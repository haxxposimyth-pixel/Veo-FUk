import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '../store/settings.store';
import { useProjectStore } from '../store/project.store';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { settingsUpdateSchema } from 'shared';
import PageHeader from '../components/layout/PageHeader';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import {
  ShieldAlert,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Database,
  Trash2,
  Lock,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { projectsApi } from '../api/projects.api';
import { settingsApi } from '../api/settings.api';

export const AISettings: React.FC = () => {
  const settings = useSettingsStore((s) => s.settings);
  const stats = useSettingsStore((s) => s.stats);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const selectProject = useProjectStore((s) => s.selectProject);

  const availableModels = useSettingsStore((s) => s.availableModels);
  const fetchAvailableModels = useSettingsStore((s) => s.fetchAvailableModels);
  const modelTestResults = useSettingsStore((s) => s.modelTestResults);
  const isTestingModels = useSettingsStore((s) => s.isTestingModels);
  const testModel = useSettingsStore((s) => s.testModel);
  const testAllModels = useSettingsStore((s) => s.testAllModels);
  const optimizeModelRouting = useSettingsStore((s) => s.optimizeModelRouting);
  const isLoading = useSettingsStore((s) => s.isLoading);

  const [showApiKey, setShowApiKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [bulkKeysText, setBulkKeysText] = useState('');
  const [isHighwayValidating, setIsHighwayValidating] = useState(false);
  const [highwayValidationResult, setHighwayValidationResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isThirdPartyValidating, setIsThirdPartyValidating] = useState(false);
  const [thirdPartyValidationResult, setThirdPartyValidationResult] = useState<{ success: boolean; message: string } | null>(null);
  const [now, setNow] = useState(Date.now());

  // Danger zone triple confirm
  const [dangerStep, setDangerStep] = useState(0);
  const [confirmInput, setConfirmInput] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(settingsUpdateSchema),
    defaultValues: {
      apiKey: '',
      model: 'gemini-2.5-flash-lite' as any,
      temperature: 0.8,
      maxTokens: 8192,
      topP: undefined as number | undefined,
      topK: undefined as number | undefined,
      defaultVisualStyle: 'Cinematic Realism',
      defaultLanguage: 'English',
      defaultAspectRatio: '16:9',
      defaultSceneCount: 14,
      
      geminiApiKey: '',
      geminiApiKeys: ['', '', '', '', ''],
      geminiEnabled: true,
      highwayApiEnabled: false,
      highwayApiKey: '',
      highwayApiBaseUrl: 'https://api.highwayapi.ai/openai',
      highwayApiModel: 'claude-fable-5',
      localLmEnabled: false,
      thirdPartyEnabled: false,
      thirdPartyBaseUrl: 'https://openrouter.ai/api/v1',
      thirdPartyApiKey: '',
      thirdPartyModel: '',
      
      backupModelPrimary: '',
      backupModelSecondary: '',
      useAgentSpecificRouting: false,
      vertexEnabled: false,
      gcpProjectId: '',
      gcpLocation: 'us-central1',
      generationConcurrency: 5,
    },
  });

  // Load settings, stats, and models on mount
  useEffect(() => {
    fetchSettings();
    fetchAvailableModels();
    
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [fetchSettings, fetchAvailableModels]);

  // Set form values once settings load
  useEffect(() => {
    if (settings) {
      Object.entries(settings).forEach(([key, value]) => {
        if (key === 'geminiApiKeys') {
          const arr = Array.isArray(value) ? [...value] : [];
          setValue('geminiApiKeys', arr as any);
          setBulkKeysText(arr.join('\n'));
        } else {
          setValue(key as any, value);
        }
      });
    }
  }, [settings, setValue]);

  const handleBulkKeysChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setBulkKeysText(text);
    const keys = text.split('\n').map(k => k.trim()).filter(Boolean);
    setValue('geminiApiKeys', keys as any, { shouldDirty: true });
  };

  const isAllDisabled = 
    watch('geminiEnabled') === false &&
    watch('highwayApiEnabled') === false &&
    watch('localLmEnabled') === false &&
    watch('thirdPartyEnabled') === false;

  const [isValidatingAllKeys, setIsValidatingAllKeys] = useState(false);
  const [isRemovingDeadKeys, setIsRemovingDeadKeys] = useState(false);

  const handleValidateAllKeys = async () => {
    setIsValidatingAllKeys(true);
    try {
      const res = await settingsApi.validateAllKeys();
      if (res.success) {
        toast.success('All API keys validated successfully!');
        await fetchSettings();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to validate keys');
    } finally {
      setIsValidatingAllKeys(false);
    }
  };

  const handleRemoveDeadKeys = async () => {
    setIsRemovingDeadKeys(true);
    try {
      const res = await settingsApi.removeDeadKeys();
      if (res.success) {
        toast.success('All disabled dead keys removed successfully!');
        await fetchSettings();
        if (res.data?.geminiApiKeys) {
          setValue('geminiApiKeys', res.data.geminiApiKeys);
          setBulkKeysText(res.data.geminiApiKeys.join('\n'));
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove dead keys');
    } finally {
      setIsRemovingDeadKeys(false);
    }
  };



  const handleValidateThirdPartyKey = async () => {
    const key = watch('thirdPartyApiKey');
    const baseUrl = watch('thirdPartyBaseUrl');
    if (!key) {
      toast.error('Please input a Third-Party API Key to validate.');
      return;
    }
    setIsThirdPartyValidating(true);
    setThirdPartyValidationResult(null);
    try {
      const res = await settingsApi.validateKey(key, 'third-party', baseUrl);
      setThirdPartyValidationResult({ success: true, message: res.message || 'Third-Party API Key is valid!' });
      toast.success('Third-Party API Key is valid!');
    } catch (err: any) {
      setThirdPartyValidationResult({ success: false, message: err.message || 'Invalid API Key' });
      toast.error('Third-Party API Key validation failed.');
    } finally {
      setIsThirdPartyValidating(false);
    }
  };

  const handleValidateHighwayKey = async () => {
    const key = watch('highwayApiKey');
    const baseUrl = watch('highwayApiBaseUrl');
    if (!key) {
      toast.error('Please input a HighwayAPI API Key to validate.');
      return;
    }
    setIsHighwayValidating(true);
    setHighwayValidationResult(null);
    try {
      const res = await settingsApi.validateKey(key, 'highway', baseUrl);
      setHighwayValidationResult({ success: true, message: res.message || 'HighwayAPI Key is valid!' });
      toast.success('HighwayAPI Key is valid!');
    } catch (err: any) {
      setHighwayValidationResult({ success: false, message: err.message || 'Invalid API Key' });
      toast.error('HighwayAPI Key validation failed.');
    } finally {
      setIsHighwayValidating(false);
    }
  };

  const onSubmit = async (data: any) => {
    if (Array.isArray(data.geminiApiKeys)) {
      const cleanedKeys = data.geminiApiKeys.map((k: any) => String(k || '').trim()).filter(Boolean);
      data.geminiApiKeys = cleanedKeys;
      data.geminiApiKey = cleanedKeys[0] || '';
      setValue('geminiApiKey', cleanedKeys[0] || '');
    }

    const isModelAvailable = data.model === 'disabled' || availableModels.some(m => m.value === data.model);
    if (!isModelAvailable && availableModels.length > 0) {
      data.model = availableModels[0].value;
      setValue('model', availableModels[0].value);
      toast(`Selected model is no longer available. Switched active model to ${availableModels[0].label}.`, {
        icon: '⚠️',
      });
    } else if (availableModels.length === 0) {
      const anyProviderEnabled = data.geminiEnabled || data.highwayApiEnabled || data.localLmEnabled || data.thirdPartyEnabled;
      if (!anyProviderEnabled) {
        toast.error('Cannot save configuration: At least one AI provider must be enabled.');
        return;
      }
    }

    try {
      await updateSettings(data);
      await fetchAvailableModels(); // Refresh available models after save
      toast.success('Configuration saved successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save settings');
    }
  };

  const handleResetDefaults = () => {
    setValue('model', 'gemini-2.5-flash-lite');
    setValue('temperature', 0.8);
    setValue('maxTokens', 8192);
    setValue('topP', undefined);
    setValue('topK', undefined);
    setValue('defaultVisualStyle', 'Cinematic Realism');
    setValue('defaultLanguage', 'English');
    setValue('defaultAspectRatio', '16:9');
    setValue('defaultSceneCount', 14);

    setValue('geminiApiKey', '');
    setValue('geminiApiKeys', ['', '', '', '', '']);
    setValue('geminiEnabled', true);
    setValue('highwayApiEnabled', false);
    setValue('highwayApiKey', '');
    setValue('highwayApiBaseUrl', 'https://api.highwayapi.ai/openai');
    setValue('highwayApiModel', 'claude-fable-5');
    setValue('localLmEnabled', false);
    setValue('thirdPartyEnabled', false);
    setValue('thirdPartyBaseUrl', 'https://openrouter.ai/api/v1');
    setValue('thirdPartyApiKey', '');
    setValue('thirdPartyModel', '');

    toast.success('Defaults reset. Don\'t forget to click Save Settings.');
  };

  // Danger zone reset
  const handleDangerStepOne = () => {
    setDangerStep(1);
    setConfirmInput('');
  };

  const handleDangerStepTwo = () => {
    if (confirmInput !== 'DELETE ALL PROJECTS') {
      toast.error('Text does not match. Please write "DELETE ALL PROJECTS" exactly.');
      return;
    }
    setDangerStep(2);
  };

  const handleDangerFinalExecute = async () => {
    try {
      // Fetch all projects and delete them one by one
      const projects = useProjectStore.getState().projects;
      for (const p of projects) {
        await projectsApi.deleteProject(p.id);
      }
      // Reload projects list
      await fetchProjects();
      selectProject(null);
      // Refresh settings stats
      await fetchSettings();
      toast.success('All project workspace data deleted successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to perform clear operation.');
    } finally {
      setDangerStep(0);
      setConfirmInput('');
    }
  };

  const renderModelQuotaCircle = (modelValue: string) => {
    const modelUsage = stats?.allModelUsages?.[modelValue];
    const used = modelUsage?.requestsUsed ?? 0;
    const limit = modelUsage?.requestsLimit ?? 1000;
    const hasExceeded = used > limit;

    const radius = 7.5;
    const strokeWidth = 2.5;
    const circumference = 2 * Math.PI * radius;

    let greenDashoffset = circumference;
    let redDashoffset = circumference;

    if (used === 0) {
      greenDashoffset = 0;
    } else if (used <= limit) {
      const pctRemaining = (limit - used) / limit;
      greenDashoffset = circumference * (1 - pctRemaining);
    } else {
      const exceededPct = Math.min(1, (used - limit) / limit);
      const displayPct = Math.max(0.1, exceededPct);
      redDashoffset = circumference * (1 - displayPct);
    }

    return (
      <div className="relative group cursor-help flex items-center justify-center shrink-0" title={`Usage: ${used} / ${limit} requests (24h)`}>
        <svg width="22" height="22" className="transform -rotate-90">
          <circle
            cx="11"
            cy="11"
            r={radius}
            fill="none"
            stroke="#1C1C24"
            strokeWidth={strokeWidth}
          />
          <circle
            cx="11"
            cy="11"
            r={radius}
            fill="none"
            stroke="#22c55e"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={greenDashoffset}
            strokeLinecap="round"
            className="transition-all duration-300"
          />
          <circle
            cx="11"
            cy="11"
            r={radius}
            fill="none"
            stroke="#ef4444"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={redDashoffset}
            strokeLinecap="round"
            className="transition-all duration-300"
          />
        </svg>
        <div className="absolute bottom-full mb-1.5 left-1/2 transform -translate-x-1/2 hidden group-hover:block bg-[#09090b] border border-[#23232f] text-[10px] text-gray-300 rounded-md py-1.5 px-2.5 whitespace-nowrap z-50 shadow-2xl font-mono leading-relaxed pointer-events-none">
          <span className="font-bold block text-gray-200 border-b border-[#23232f] pb-0.5 mb-1">24h Quota Usage:</span>
          Requests: <span className={hasExceeded ? "text-[#f87171] font-bold" : "text-[#4ade80]"}>{used}</span> / {limit}
          {modelUsage && (
            <div className="mt-0.5">
              Tokens: {Math.round((modelUsage.tokensUsed || 0) / 1000)}k / {Math.round(modelUsage.tokensLimit / 1000)}k
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 select-none max-w-4xl mx-auto">
      <PageHeader
        title="AI Pipeline Settings"
        description="Configure Google Gemini credentials, system constraints, models, temperature configurations, and baseline defaults."
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Active Model Configuration */}
        <Card className="space-y-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 border-b border-[#2A2A38]/30 pb-2">
            Active Model Configuration
          </h3>

          {isAllDisabled && (
            <div className="bg-amber-950/45 border border-amber-500/30 rounded-lg p-4 flex gap-3 text-xs text-amber-400 leading-relaxed font-semibold">
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <p className="font-bold mb-1">All AI Providers Disabled</p>
                <p>At least one AI provider (Google Gemini, HighwayAPI, Local LM, or Third-Party API) must be enabled to run pipeline agents.</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="col-span-1">
              <Select
                label="Primary Model"
                options={[{ value: 'disabled', label: 'Disabled' }, ...availableModels.map((m) => ({ value: m.value, label: m.label }))]}
                error={errors.model?.message}
                {...register('model')}
              />
              {availableModels.length === 0 && (
                <p className="text-xs text-amber-400 mt-2 font-semibold leading-relaxed">
                  No active models available. Please configure API credentials below to populate this list.
                </p>
              )}
            </div>

            <div className="col-span-1">
              <Select
                label="Backup Model 1 (Fallback)"
                options={[{ value: 'disabled', label: 'Disabled' }, { value: '', label: 'None (default: gemini-2.0-flash)' }, ...availableModels.map((m) => ({ value: m.value, label: m.label }))]}
                error={errors.backupModelPrimary?.message}
                {...register('backupModelPrimary')}
              />
            </div>

            <div className="col-span-1">
              <Select
                label="Backup Model 2 (Last Resort)"
                options={[{ value: 'disabled', label: 'Disabled' }, { value: '', label: 'None (default: gemini-1.5-flash)' }, ...availableModels.map((m) => ({ value: m.value, label: m.label }))]}
                error={errors.backupModelSecondary?.message}
                {...register('backupModelSecondary')}
              />
            </div>
          </div>

          <div className="border-t border-[#2A2A38]/30 pt-4 space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="useAgentSpecificRouting"
                className="w-4 h-4 rounded bg-[#0A0A0F] border border-[#2A2A38] text-[#6C63FF] focus:ring-[#6C63FF] cursor-pointer"
                {...register('useAgentSpecificRouting')}
              />
              <label htmlFor="useAgentSpecificRouting" className="text-xs font-bold uppercase tracking-wider text-gray-300 cursor-pointer select-none">
                Enable Agent-Specific Routing
              </label>
            </div>
            
            {watch('useAgentSpecificRouting') && (
              <div className="bg-[#0A0A0F] border border-[#2A2A38] rounded-xl p-3.5 text-xs text-gray-400 space-y-2 animate-fade-in">
                <span className="font-bold text-gray-300 block mb-1.5">Intelligent Agent Mapping:</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 font-mono text-[11px]">
                  <div>🧠 Story Planner: <span className="text-[#6C63FF]">gemini-2.5-flash</span></div>
                  <div>📖 Production Bible: <span className="text-[#6C63FF]">gemini-2.5-pro</span></div>
                  <div>✍️ Script Agent: <span className="text-[#6C63FF]">gemini-2.5-pro</span></div>
                  <div>🔥 Hook Scorer: <span className="text-[#6C63FF]">gemini-2.5-flash</span></div>
                  <div>📊 Story Analyzer: <span className="text-[#6C63FF]">gemini-2.5-flash</span></div>
                  <div>🎬 Scene Agent: <span className="text-[#6C63FF]">gemini-2.5-pro</span></div>
                  <div>📹 Veo Agent: <span className="text-[#6C63FF]">gemini-2.5-pro</span></div>
                  <div>📝 Title & Metadata: <span className="text-[#6C63FF]">gemini-2.5-flash</span></div>
                  <div>🔄 Continuity Agent: <span className="text-[#6C63FF]">gemini-2.5-flash</span></div>
                </div>
                <p className="text-[10px] text-gray-500 italic mt-2 leading-relaxed">
                  Note: Agent-specific routing automatically assigns creative or analytical models to match each agent profile. If a mapped model fails, it will gracefully try your backup model fallback chain.
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">
                  Temperature
                </label>
                <span className="text-xs font-mono font-bold text-[#6C63FF]">
                  {watch('temperature')}
                </span>
              </div>
              <input
                type="range"
                min="0.0"
                max="2.0"
                step="0.1"
                className="w-full h-1.5 bg-[#0A0A0F] border border-[#2A2A38] rounded-lg appearance-none cursor-pointer accent-[#6C63FF]"
                {...register('temperature', { valueAsNumber: true })}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">
                  Max Output Tokens
                </label>
                <span className="text-xs font-mono font-bold text-[#6C63FF]">
                  {watch('maxTokens')}
                </span>
              </div>
              <input
                type="range"
                min="1024"
                max="32768"
                step="1024"
                className="w-full h-1.5 bg-[#0A0A0F] border border-[#2A2A38] rounded-lg appearance-none cursor-pointer accent-[#6C63FF]"
                {...register('maxTokens', { valueAsNumber: true })}
              />
            </div>
          </div>

          {/* Collapsible Advanced Parameters */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs font-bold text-[#6C63FF] hover:text-[#5b52eb] cursor-pointer flex items-center gap-1.5"
            >
              <span>{showAdvanced ? 'Hide Advanced Tuning' : 'Show Advanced Tuning'}</span>
            </button>

            {showAdvanced && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 animate-fade-in">
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">
                      Top-P (Nucleus Tuning)
                    </label>
                    <span className="text-xs font-mono font-bold text-[#6C63FF]">
                      {watch('topP') !== undefined && watch('topP') !== null ? watch('topP') : 'Not Configured'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="1.0"
                    step="0.05"
                    className="w-full h-1.5 bg-[#0A0A0F] border border-[#2A2A38] rounded-lg appearance-none cursor-pointer accent-[#6C63FF]"
                    {...register('topP', { valueAsNumber: true })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">
                    Top-K (Probability Cutoff)
                  </label>
                  <input
                    type="number"
                    placeholder="Not Configured"
                    className="w-full px-4 py-2 bg-[#0A0A0F] border border-[#2A2A38] rounded-lg text-sm text-white focus:outline-none focus:border-[#6C63FF]"
                    {...register('topK', { valueAsNumber: true })}
                  />
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Gemini Provider Toggle */}
        <Card className="space-y-4">
          <div className="flex justify-between items-center border-b border-[#2A2A38]/30 pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#6C63FF]" />
              <span>Google Gemini Credentials Pool (1–5 keys)</span>
            </h3>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="geminiEnabled"
                className="w-4 h-4 rounded bg-[#0A0A0F] border border-[#2A2A38] text-[#6C63FF] focus:ring-[#6C63FF] cursor-pointer"
                {...register('geminiEnabled')}
              />
              <label htmlFor="geminiEnabled" className="text-xs font-bold uppercase tracking-wider text-gray-300 cursor-pointer select-none">
                Enable Pool
              </label>
            </div>
          </div>

          {watch('geminiEnabled') && (
            <div className="space-y-6 animate-fade-in">
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Paste up to 80 keys from separate Google accounts (one per line). VVS Studio will load balance using round-robin and automatically track cooldowns per model.
              </p>

              <div className="bg-[#0A0A0F]/60 border border-[#2A2A38]/40 rounded-xl p-4 space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">
                  Bulk API Keys
                </label>
                <textarea
                  className="w-full h-40 px-4 py-3 bg-[#0A0A0F] border border-[#2A2A38] rounded-lg text-sm text-gray-300 font-mono focus:outline-none focus:border-[#6C63FF] resize-y"
                  placeholder="AIzaSy...\nAIzaSy...\nAIzaSy..."
                  value={bulkKeysText}
                  onChange={handleBulkKeysChange}
                />
                <p className="text-[10px] text-gray-500 text-right">
                  {watch('geminiApiKeys')?.filter?.((k: string) => k.trim())?.length || 0} keys entered. Remember to click Save Settings at the bottom.
                </p>
              </div>

              {/* Status Grid */}
              {(settings as any)?.keyStatuses?.length > 0 && (() => {
                const keyStatuses = (settings as any).keyStatuses;
                const activeCount = keyStatuses.filter((k: any) => k.status === 'active').length;
                const coolingCount = keyStatuses.filter((k: any) => k.status === 'cooldown').length;
                const deadCount = keyStatuses.filter((k: any) => k.status === 'disabled').length;

                return (
                  <div className="bg-[#0A0A0F]/60 border border-[#2A2A38]/40 rounded-xl p-4 space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-[#2A2A38]/30 pb-2.5 gap-3">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                          Key Health Grid
                        </h4>
                        <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                          {activeCount} active / {coolingCount} cooling / {deadCount} dead
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={handleValidateAllKeys}
                          isLoading={isValidatingAllKeys}
                          className="text-[10px] py-1 px-2.5 cursor-pointer flex items-center gap-1.5 border-[#2A2A38] hover:border-[#6C63FF] hover:text-[#6C63FF]"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Validate All Keys</span>
                        </Button>
                        {deadCount > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleRemoveDeadKeys}
                            isLoading={isRemovingDeadKeys}
                            className="text-[10px] py-1 px-2.5 cursor-pointer flex items-center gap-1.5 border border-rose-500/30 hover:border-rose-500 text-rose-400 hover:text-rose-300"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Remove Dead Keys</span>
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {keyStatuses.map((kStatus: any, i: number) => {
                        const cooldowns = Object.entries(kStatus.modelCooldowns || {});
                        const isDead = kStatus.status === 'disabled';
                        const isCooldown = kStatus.status === 'cooldown';
                        
                        let cardBorderClass = "border-[#2A2A38]/60";
                        let statusBadge = (
                          <div className="flex items-center gap-1.5 text-green-400 text-[10px] mt-2 font-mono">
                            <CheckCircle className="w-3 h-3" />
                            <span>Ready (All Models)</span>
                          </div>
                        );

                        if (isDead) {
                          cardBorderClass = "border-rose-500/40 bg-rose-950/10";
                          statusBadge = (
                            <div className="space-y-1 mt-2 border-t border-[#2A2A38]/40 pt-1.5">
                              <div className="flex items-center gap-1.5 text-rose-500 text-[10px] font-mono font-bold">
                                <XCircle className="w-3 h-3" />
                                <span>Disabled (Dead)</span>
                              </div>
                              {kStatus.errorReason && (
                                <p className="text-[9px] text-rose-400/80 leading-relaxed font-sans mt-0.5 break-words max-h-16 overflow-y-auto" title={kStatus.errorReason}>
                                  {kStatus.errorReason}
                                </p>
                              )}
                            </div>
                          );
                        } else if (isCooldown || cooldowns.length > 0) {
                          cardBorderClass = "border-amber-500/40 bg-amber-950/10";
                          statusBadge = (
                            <div className="space-y-1 mt-2 border-t border-[#2A2A38]/40 pt-1.5">
                              <div className="flex items-center gap-1.5 text-amber-400 text-[10px] font-mono font-bold">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Cooling Down</span>
                              </div>
                              <div className="space-y-0.5">
                                {cooldowns.map(([model, cd]: [string, any]) => {
                                  const left = Math.max(0, Math.ceil((cd.until - now) / 1000));
                                  return left > 0 ? (
                                    <div key={model} className="flex justify-between items-center text-[9px] font-mono">
                                      <span className="text-gray-400 truncate pr-2" title={model}>{model}</span>
                                      <span className="text-amber-500 font-bold shrink-0">{cd.reason === 'rpd' ? `${Math.ceil(left/3600)}h` : `${left}s`}</span>
                                    </div>
                                  ) : null;
                                })}
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={kStatus.keyId || i} className={`bg-[#1C1C24]/50 border ${cardBorderClass} rounded-lg p-3 text-xs font-mono relative overflow-hidden group`}>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-gray-300 font-bold truncate">Key {i + 1}</span>
                              <span className="text-gray-500 text-[10px]">{kStatus.masked}</span>
                            </div>
                            {statusBadge}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </Card>

        {/* Vertex AI Credentials Section */}
        <Card className="space-y-4">
          <div className="flex justify-between items-center border-b border-[#2A2A38]/30 pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
              <Database className="w-4 h-4 text-[#6C63FF]" />
              <span>Vertex AI (optional fallback)</span>
            </h3>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="vertexEnabled"
                className="w-4 h-4 rounded bg-[#0A0A0F] border border-[#2A2A38] text-[#6C63FF] focus:ring-[#6C63FF] cursor-pointer"
                {...register('vertexEnabled')}
              />
              <label htmlFor="vertexEnabled" className="text-xs font-bold uppercase tracking-wider text-gray-300 cursor-pointer select-none">
                Enable Vertex AI
              </label>
            </div>
          </div>

          {watch('vertexEnabled') && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in pt-2">
              <Input
                label="GCP Project ID"
                placeholder="e.g. my-gcp-project"
                error={errors.gcpProjectId?.message}
                {...register('gcpProjectId')}
              />
              <Input
                label="GCP Location"
                placeholder="e.g. us-central1"
                error={errors.gcpLocation?.message}
                {...register('gcpLocation')}
              />
            </div>
          )}
        </Card>

        {/* Available Gemini Models discovery and testing */}
        {watch('geminiEnabled') && (watch('geminiApiKey') || watch('geminiApiKeys')?.[0]) && (
          <Card className="space-y-4">
            <div className="flex justify-between items-center border-b border-[#2A2A38]/30 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                <Database className="w-4 h-4 text-[#6C63FF]" />
                <span>Available Gemini Models</span>
              </h3>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    await fetchAvailableModels();
                    toast.success('Discovered available models!');
                  }}
                  className="text-xs py-1 px-2.5 cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Discover Models</span>
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={async () => {
                    const key = watch('geminiApiKey');
                    await testAllModels(key);
                    toast.success('Tested all available models!');
                  }}
                  isLoading={isTestingModels}
                  disabled={availableModels.length === 0}
                  className="text-xs py-1 px-2.5 cursor-pointer flex items-center gap-1.5"
                >
                  <span>Test All Models</span>
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={async () => {
                    await optimizeModelRouting(true);
                    const freshSettings = useSettingsStore.getState().settings;
                    if (freshSettings) {
                      Object.entries(freshSettings).forEach(([key, val]) => {
                        setValue(key as any, val);
                      });
                    }
                    toast.success('Fallback chain prioritized and configured!');
                  }}
                  isLoading={isLoading}
                  disabled={availableModels.length === 0}
                  className="text-xs py-1 px-2.5 cursor-pointer flex items-center gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 border-none text-white font-bold"
                >
                  <span>Auto-Optimize Fallbacks</span>
                </Button>
              </div>
            </div>

            {availableModels.length === 0 ? (
              <p className="text-xs text-gray-500 italic">No models discovered yet. Click Discover Models above.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                {availableModels
                  .filter(m => m.value.startsWith('gemini') || m.value.startsWith('models/gemini'))
                  .map((m) => {
                    const testResult = modelTestResults[m.value];
                    return (
                      <div key={m.value} className="bg-[#0A0A0F] border border-[#2A2A38] rounded-lg p-2.5 flex items-center justify-between text-xs font-sans">
                        <div className="flex items-center gap-3">
                          {renderModelQuotaCircle(m.value)}
                          <div className="space-y-1">
                            <span className="font-bold text-gray-300 block">{m.label}</span>
                            <span className="text-[10px] text-gray-500 font-mono block">{m.value}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {testResult?.testing ? (
                            <span className="text-[10px] text-amber-400 flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Testing...</span>
                            </span>
                          ) : testResult?.success ? (
                            <span className="text-[10px] text-green-400 font-bold flex items-center gap-1">
                              <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                              <span>{testResult.latency}ms</span>
                            </span>
                          ) : testResult?.error ? (
                            <span className="text-[10px] text-rose-500 font-bold flex items-center gap-1 cursor-help" title={testResult.error}>
                              <XCircle className="w-3.5 h-3.5 text-rose-500" />
                              <span>Failed</span>
                            </span>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                const key = watch('geminiApiKey');
                                await testModel(m.value, key);
                              }}
                              className="text-[10px] py-0.5 px-1.5 border border-[#2A2A38] hover:border-[#6C63FF] hover:text-[#6C63FF]"
                            >
                              Test
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </Card>
        )}

        {/* Third-Party API Configuration */}
        <Card className="space-y-4">
          <div className="flex justify-between items-center border-b border-[#2A2A38]/30 pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#6C63FF]" />
              <span>Third-Party API (OpenRouter, etc.)</span>
            </h3>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="thirdPartyEnabled"
                className="w-4 h-4 rounded bg-[#0A0A0F] border border-[#2A2A38] text-[#6C63FF] focus:ring-[#6C63FF] cursor-pointer"
                {...register('thirdPartyEnabled')}
              />
              <label htmlFor="thirdPartyEnabled" className="text-xs font-bold uppercase tracking-wider text-gray-300 cursor-pointer select-none">
                Enable
              </label>
            </div>
          </div>

          {watch('thirdPartyEnabled') && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Third-Party API Base URL"
                  placeholder="https://openrouter.ai/api/v1"
                  error={errors.thirdPartyBaseUrl?.message}
                  {...register('thirdPartyBaseUrl')}
                />
                <Input
                  label="Third-Party Model ID"
                  placeholder="e.g., google/gemma-4-26b-a4b-it:free"
                  error={errors.thirdPartyModel?.message}
                  {...register('thirdPartyModel')}
                />
              </div>

              <div className="flex flex-col md:flex-row items-end gap-4">
                <div className="flex-1 relative w-full">
                  <Input
                    label="Third-Party API Key"
                    type={showApiKey ? 'text' : 'password'}
                    placeholder="sk-or-v1-..."
                    error={errors.thirdPartyApiKey?.message}
                    {...register('thirdPartyApiKey')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-[34px] text-gray-500 hover:text-white cursor-pointer"
                  >
                    {showApiKey ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                  </button>
                </div>

                <div className="shrink-0 flex items-center gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleValidateThirdPartyKey}
                    isLoading={isThirdPartyValidating}
                    className="cursor-pointer py-2.5"
                  >
                    Validate Key
                  </Button>
                </div>
              </div>

              {/* Validation indicators */}
              {thirdPartyValidationResult && (
                <div className="animate-fade-in flex items-center gap-2 text-xs">
                  {thirdPartyValidationResult.success ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                      <span className="text-green-400 font-bold">{thirdPartyValidationResult.message}</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      <span className="text-rose-500 font-bold">{thirdPartyValidationResult.message}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* HighwayAPI Configuration */}
        <Card className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 border-b border-[#2A2A38]/30 pb-2 flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#6C63FF]" />
            <span>HighwayAPI Configuration</span>
          </h3>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="highwayApiEnabled"
              className="w-4 h-4 rounded bg-[#0A0A0F] border border-[#2A2A38] text-[#6C63FF] focus:ring-[#6C63FF] cursor-pointer"
              {...register('highwayApiEnabled')}
            />
            <label htmlFor="highwayApiEnabled" className="text-xs font-bold uppercase tracking-wider text-gray-300 cursor-pointer select-none">
              Enable HighwayAPI Provider
            </label>
          </div>

          {watch('highwayApiEnabled') && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="HighwayAPI Base URL"
                  placeholder="https://api.highwayapi.ai/openai"
                  error={errors.highwayApiBaseUrl?.message}
                  {...register('highwayApiBaseUrl')}
                />
                <Input
                  label="HighwayAPI Model Name"
                  placeholder="claude-fable-5"
                  error={errors.highwayApiModel?.message}
                  {...register('highwayApiModel')}
                />
              </div>

              <div className="flex flex-col md:flex-row items-end gap-4">
                <div className="flex-1 relative w-full">
                  <Input
                    label="HighwayAPI API Key"
                    type={showApiKey ? 'text' : 'password'}
                    placeholder="sk_..."
                    error={errors.highwayApiKey?.message}
                    {...register('highwayApiKey')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-[34px] text-gray-500 hover:text-white cursor-pointer"
                  >
                    {showApiKey ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                  </button>
                </div>

                <div className="shrink-0 flex items-center gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleValidateHighwayKey}
                    isLoading={isHighwayValidating}
                    className="cursor-pointer py-2.5"
                  >
                    Validate Key
                  </Button>
                </div>
              </div>

              {/* Validation indicators */}
              {highwayValidationResult && (
                <div className="animate-fade-in flex items-center gap-2 text-xs">
                  {highwayValidationResult.success ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                      <span className="text-green-400 font-bold">{highwayValidationResult.message}</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      <span className="text-rose-500 font-bold">{highwayValidationResult.message}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Local LM Configuration */}
        <Card className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 border-b border-[#2A2A38]/30 pb-2 flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#6C63FF]" />
            <span>Local LM Configuration</span>
          </h3>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="localLmEnabled"
              className="w-4 h-4 rounded bg-[#0A0A0F] border border-[#2A2A38] text-[#6C63FF] focus:ring-[#6C63FF] cursor-pointer"
              {...register('localLmEnabled')}
            />
            <label htmlFor="localLmEnabled" className="text-xs font-bold uppercase tracking-wider text-gray-300 cursor-pointer select-none">
              Enable Local LM Provider
            </label>
          </div>

          <p className="text-xs text-gray-400 leading-relaxed">
            Allows selecting local model instances running on <code className="text-[#6C63FF] font-mono">http://localhost:1234/v1</code> (e.g. LM Studio, Ollama).
          </p>
        </Card>

        {/* Pipeline Defaults */}
        <Card className="space-y-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 border-b border-[#2A2A38]/30 pb-2">
            Creative Pipeline Defaults
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Select
              label="Default Visual Style Preset"
              options={[
                { value: 'Cinematic Realism', label: 'Cinematic Realism' },
                { value: 'Anime Epic', label: 'Anime Epic' },
                { value: 'Documentary Gritty', label: 'Documentary Gritty' },
                { value: 'Painterly Fantasy', label: 'Painterly Fantasy' },
                { value: 'Sci-Fi Noir', label: 'Sci-Fi Noir' },
                { value: 'Architectural Minimalism', label: 'Architectural Minimalism' },
              ]}
              {...register('defaultVisualStyle')}
            />

            <Select
              label="Default Narration Language"
              options={[
                { value: 'English', label: 'English' },
                { value: 'Spanish', label: 'Spanish (Español)' },
                { value: 'French', label: 'French (Français)' },
                { value: 'German', label: 'German (Deutsch)' },
                { value: 'Chinese', label: 'Chinese (中文)' },
                { value: 'Japanese', label: 'Japanese (日本語)' },
              ]}
              {...register('defaultLanguage')}
            />

            <Select
              label="Default Aspect Ratio"
              options={[
                { value: '16:9', label: '16:9 Landscape' },
                { value: '9:16', label: '9:16 Portrait' },
                { value: '1:1', label: '1:1 Square' },
              ]}
              {...register('defaultAspectRatio')}
            />

            <div className="space-y-1.5">
              <div className="flex justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">
                  Scenes Per Script Phase
                </label>
                <span className="text-xs font-mono font-bold text-[#6C63FF]">
                  {watch('defaultSceneCount')} Scenes
                </span>
              </div>
              <input
                type="range"
                min="12"
                max="18"
                step="1"
                className="w-full h-1.5 bg-[#0A0A0F] border border-[#2A2A38] rounded-lg appearance-none cursor-pointer accent-[#6C63FF]"
                {...register('defaultSceneCount', { valueAsNumber: true })}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">
                  Prompt Generation Concurrency
                </label>
                <span className="text-xs font-mono font-bold text-[#6C63FF]">
                  {watch('generationConcurrency')} Workers
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                className="w-full h-1.5 bg-[#0A0A0F] border border-[#2A2A38] rounded-lg appearance-none cursor-pointer accent-[#6C63FF]"
                {...register('generationConcurrency', { valueAsNumber: true })}
              />
            </div>
          </div>
        </Card>

        {/* Form buttons */}
        <div className="flex items-center justify-between border-t border-[#2A2A38]/30 pt-6">
          <Button type="button" variant="ghost" onClick={handleResetDefaults}>
            Reset Defaults
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Save All Settings
          </Button>
        </div>
      </form>

      {/* Storage and System Info */}
      <Card className="space-y-4 bg-[#111118]/25 border-dashed border-[#2A2A38]">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 border-b border-[#2A2A38]/30 pb-2 flex items-center gap-2">
          <Database className="w-4 h-4 text-blue-400" />
          <span>Database Storage Stats</span>
        </h3>
        
        <div className="grid grid-cols-3 gap-4 text-xs font-mono text-gray-400">
          <div>
            Total Projects: <span className="text-white font-bold">{stats?.projectCount ?? 0}</span>
          </div>
          <div>
            Total Prompts: <span className="text-white font-bold">{stats?.totalPrompts ?? 0}</span>
          </div>
          <div>
            Database Size: <span className="text-white font-bold">{stats?.dbSize ?? '0 KB'}</span>
          </div>
        </div>
      </Card>

      {/* Danger Zone: Delete All Projects */}
      <Card className="border-rose-500/25 bg-rose-500/5 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400 border-b border-rose-500/10 pb-2 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-500" />
          <span>Danger Zone</span>
        </h3>

        <p className="text-xs text-rose-300 leading-relaxed font-semibold">
          Executing clean operations will permanently purge all projects, production bibles, scripts, scene storyboards, and technical prompts. This will erase the SQLite tables and cannot be undone.
        </p>

        <div>
          <Button variant="danger" size="sm" onClick={handleDangerStepOne} className="flex items-center gap-1.5 cursor-pointer">
            <Trash2 className="w-3.5 h-3.5" />
            <span>Purge All Workspace Data</span>
          </Button>
        </div>
      </Card>

      {/* TRIPLE CONFIRMATION MODALS */}
      {/* Step 1: Text Consent */}
      <Modal isOpen={dangerStep === 1} onClose={() => setDangerStep(0)} title="Confirm Deletion (Step 1 of 3)" size="md">
        <div className="space-y-4">
          <p className="text-xs text-gray-300 leading-relaxed">
            To confirm that you want to delete ALL projects, type exactly <strong className="text-rose-500 select-text">DELETE ALL PROJECTS</strong> below:
          </p>
          <input
            type="text"
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            className="w-full px-4 py-2 bg-black border border-rose-500/40 rounded-lg text-sm text-white focus:outline-none focus:border-rose-500"
            placeholder="DELETE ALL PROJECTS"
          />
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setDangerStep(0)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDangerStepTwo} disabled={confirmInput !== 'DELETE ALL PROJECTS'}>
              Proceed &rarr;
            </Button>
          </div>
        </div>
      </Modal>

      {/* Step 2: Final Warning checkbox check */}
      <Modal isOpen={dangerStep === 2} onClose={() => setDangerStep(0)} title="Final Warning (Step 2 of 3)" size="md">
        <div className="space-y-5">
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs rounded-lg font-semibold leading-relaxed">
            WARNING: This deletes the underlying records in SQLite! There is no backup or recovery mechanism for these local files.
          </div>
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setDangerStep(0)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => setDangerStep(3)}>
              I Understand, Continue &rarr;
            </Button>
          </div>
        </div>
      </Modal>

      {/* Step 3: Action click execution */}
      <Modal isOpen={dangerStep === 3} onClose={() => setDangerStep(0)} title="Execute Purge (Step 3 of 3)" size="sm">
        <div className="space-y-5 text-center">
          <p className="text-xs text-gray-300 leading-relaxed">
            Click the button below to permanently execute the SQLite deletion.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button variant="ghost" onClick={() => setDangerStep(0)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDangerFinalExecute}>
              PERMANENTLY DELETE EVERYTHING
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
export default AISettings;
