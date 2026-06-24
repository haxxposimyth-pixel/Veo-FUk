import { create } from 'zustand';
import type { ApiSettings, ModelUsage } from 'shared';
import { settingsApi } from '../api/settings.api';

interface SettingsState {
  settings: ApiSettings | null;
  stats: {
    projectCount: number;
    totalPrompts: number;
    dbSize: string;
    modelUsage?: ModelUsage;
    allModelUsages?: Record<string, ModelUsage>;
  } | null;
  isLoading: boolean;
  error: string | null;
  isValidatingKey: boolean;
  validationResult: { success: boolean; message: string } | null;
  availableModels: Array<{ value: string; label: string }>;
  modelTestResults: Record<string, { success: boolean; latency: number; error?: string; testing?: boolean }>;
  isTestingModels: boolean;

  // Actions
  fetchSettings: () => Promise<void>;
  updateSettings: (data: Partial<ApiSettings>) => Promise<void>;
  validateApiKey: (apiKey: string, provider?: 'gemini' | 'highway' | 'third-party', baseUrl?: string) => Promise<boolean>;
  clearValidationResult: () => void;
  fetchAvailableModels: () => Promise<void>;
  testModel: (model: string, apiKey?: string) => Promise<void>;
  testAllModels: (apiKey?: string) => Promise<void>;
  optimizeModelRouting: (force?: boolean) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  stats: null,
  isLoading: false,
  error: null,
  isValidatingKey: false,
  validationResult: null,
  availableModels: [],
  modelTestResults: {},
  isTestingModels: false,

  fetchSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await settingsApi.getSettings();
      // Extract settings vs stats
      const { stats, ...settings } = data;
      set({ settings, stats, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to load settings', isLoading: false });
    }
  },

  updateSettings: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const result = await settingsApi.updateSettings(data);
      const { stats, ...settings } = result;
      set({ settings, stats, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to save settings', isLoading: false });
      throw err;
    }
  },

  validateApiKey: async (apiKey, provider, baseUrl) => {
    set({ isValidatingKey: true, validationResult: null });
    try {
      const res = await settingsApi.validateKey(apiKey, provider, baseUrl);
      set({
        validationResult: { success: true, message: res.message || 'API Key is valid!' },
        isValidatingKey: false,
      });
      return true;
    } catch (err: any) {
      set({
        validationResult: { success: false, message: err.message || 'Invalid API Key' },
        isValidatingKey: false,
      });
      return false;
    }
  },

  clearValidationResult: () => set({ validationResult: null }),

  fetchAvailableModels: async () => {
    try {
      const models = await settingsApi.getAvailableModels();
      set({ availableModels: models });
    } catch (err: any) {
      console.error('Failed to fetch available models:', err);
    }
  },

  testModel: async (model, apiKey) => {
    set((state) => ({
      modelTestResults: {
        ...state.modelTestResults,
        [model]: { success: false, latency: 0, testing: true }
      }
    }));
    try {
      const res = await settingsApi.testModel(model, apiKey);
      set((state) => ({
        modelTestResults: {
          ...state.modelTestResults,
          [model]: { success: res.success, latency: res.latency, error: res.error, testing: false }
        }
      }));
    } catch (err: any) {
      set((state) => ({
        modelTestResults: {
          ...state.modelTestResults,
          [model]: { success: false, latency: 0, error: err.message, testing: false }
        }
      }));
    }
  },

  testAllModels: async (apiKey) => {
    set({ isTestingModels: true });
    const { availableModels } = useSettingsStore.getState();
    const geminiModels = availableModels.filter(
      (m) => m.value.startsWith('gemini') || m.value.startsWith('models/gemini')
    );
    const testPromises = geminiModels.map((m) =>
      useSettingsStore.getState().testModel(m.value, apiKey)
    );
    await Promise.all(testPromises);
    set({ isTestingModels: false });
  },

  optimizeModelRouting: async (force = false) => {
    const { settings, fetchAvailableModels, updateSettings } = useSettingsStore.getState();
    if (!settings) return;

    const apiKey = settings.geminiApiKey || settings.apiKey;
    if (!apiKey || settings.geminiEnabled === false) return;

    // Check localStorage to avoid exhausting the user's free tier quota
    const lastCheck = localStorage.getItem('last_model_quota_check');
    const now = Date.now();
    if (!force && lastCheck && now - parseInt(lastCheck, 10) < 24 * 60 * 60 * 1000) {
      console.info('[SettingsStore] Model fallback optimization skipped (run recently).');
      return;
    }

    set({ isLoading: true });
    try {
      // 1. Discover available models
      await fetchAvailableModels();
      const { availableModels } = useSettingsStore.getState();
      
      const geminiModels = availableModels.filter(
        (m) => m.value.startsWith('gemini') || m.value.startsWith('models/gemini')
      );
      if (geminiModels.length === 0) {
        set({ isLoading: false });
        return;
      }

      // 2. Test all models in parallel
      const testPromises = geminiModels.map(async (m) => {
        try {
          const res = await settingsApi.testModel(m.value, apiKey);
          return { model: m.value, success: res.success, latency: res.latency };
        } catch (err) {
          return { model: m.value, success: false, latency: Infinity };
        }
      });

      const results = await Promise.all(testPromises);

      // Save test results in state
      const resultsMap: Record<string, { success: boolean; latency: number; error?: string }> = {};
      results.forEach((r) => {
        resultsMap[r.model] = { success: r.success, latency: r.latency };
      });
      set((state) => ({ modelTestResults: { ...state.modelTestResults, ...resultsMap } }));

      // 3. Filter only successful models
      const workingModels = results.filter((r) => r.success);
      if (workingModels.length === 0) {
        console.warn('[SettingsStore] No working Gemini models found in check.');
        set({ isLoading: false });
        return;
      }

      // 4. Sort working models by priority order, then latency
      const PRIORITY: Record<string, number> = {
        'gemini-2.5-pro': 100,
        'gemini-1.5-pro': 90,
        'gemini-pro-latest': 85,
        'gemini-2.5-flash': 80,
        'gemini-2.0-flash-001': 75,
        'gemini-2.0-flash': 70,
        'gemini-2.5-flash-lite': 60,
        'gemini-flash-latest': 55,
        'gemini-1.5-flash': 50,
      };

      const getModelScore = (mName: string) => {
        const cleanName = mName.replace(/^models\//, '');
        for (const [key, score] of Object.entries(PRIORITY)) {
          if (cleanName.includes(key)) return score;
        }
        return 0;
      };

      workingModels.sort((a, b) => {
        const scoreA = getModelScore(a.model);
        const scoreB = getModelScore(b.model);
        if (scoreA !== scoreB) {
          return scoreB - scoreA;
        }
        return a.latency - b.latency;
      });

      // 5. Select primary, backup 1, backup 2
      const bestModel = workingModels[0]?.model || settings.model;
      const backup1 = workingModels[1]?.model || '';
      const backup2 = workingModels[2]?.model || '';

      // 6. Save new configurations
      await updateSettings({
        model: bestModel,
        backupModelPrimary: backup1,
        backupModelSecondary: backup2,
      });

      localStorage.setItem('last_model_quota_check', now.toString());
      console.info(`[SettingsStore] Auto-optimized routing: Primary=${bestModel}, Backup1=${backup1}, Backup2=${backup2}`);
    } catch (err) {
      console.error('[SettingsStore] Failed to auto-optimize fallback chain:', err);
    } finally {
      set({ isLoading: false });
    }
  },
}));
