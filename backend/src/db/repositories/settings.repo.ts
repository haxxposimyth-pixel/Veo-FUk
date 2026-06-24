import db from '../connection';
import type { ApiSettings } from 'shared';

export const SettingsRepository = {

  getSettings(): ApiSettings {
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const map  = new Map(rows.map((r) => [r.key, r.value]));

    const model = map.get('selected_model') || map.get('model') || 'gemini-2.5-flash-lite';
    const geminiApiKey = map.get('gemini_api_key') || map.get('apiKey') || process.env.GEMINI_API_KEY || '';
    const highwayApiKey = map.get('highway_api_key') || '';
    const localLmEnabled = map.get('local_lm_enabled') === 'true';
    const thirdPartyModel = map.get('third_party_model') || '';
    const thirdPartyApiKey = map.get('third_party_api_key') || '';

    let geminiApiKeys: string[] = [];
    try {
      const keysJson = map.get('gemini_api_keys');
      if (keysJson) {
        geminiApiKeys = JSON.parse(keysJson);
      }
    } catch (e) {
      console.error('Failed to parse gemini_api_keys JSON from settings:', e);
    }
    if (Array.isArray(geminiApiKeys)) {
      geminiApiKeys = geminiApiKeys.map(k => k.trim()).filter(k => k.length > 0);
    }
    if (!Array.isArray(geminiApiKeys) || geminiApiKeys.length === 0) {
      if (geminiApiKey && geminiApiKey.trim().length > 0) {
        geminiApiKeys = [geminiApiKey.trim()];
      } else {
        geminiApiKeys = [];
      }
    }

    // Dynamically resolve apiKey based on the active model
    let apiKey = geminiApiKey;
    if (model.startsWith('claude')) {
      apiKey = highwayApiKey;
    } else if (model.startsWith('local')) {
      apiKey = 'not-needed';
    } else if (model === thirdPartyModel && thirdPartyModel) {
      apiKey = thirdPartyApiKey;
    }

    return {
      apiKey,
      model,
      temperature:        parseFloat(map.get('temperature') || '0.8'),
      maxTokens:          parseInt(map.get('maxTokens')     || '8192', 10),
      topP:               map.has('topP') ? parseFloat(map.get('topP')!)   : undefined,
      topK:               map.has('topK') ? parseInt(map.get('topK')!, 10) : undefined,
      defaultVisualStyle: map.get('defaultVisualStyle') || 'Cinematic Realism',
      defaultLanguage:    map.get('defaultLanguage')    || 'English',
      defaultAspectRatio: map.get('defaultAspectRatio') || '16:9',
      defaultSceneCount:  parseInt(map.get('defaultSceneCount') || '14', 10),
      
      geminiApiKey,
      geminiApiKeys,
      geminiEnabled:      map.has('gemini_enabled') ? map.get('gemini_enabled') === 'true' : true,
      highwayApiEnabled:  map.get('highway_api_enabled') === 'true',
      highwayApiKey,
      highwayApiBaseUrl:  map.get('highway_api_base_url')  || 'https://api.highwayapi.ai/openai',
      highwayApiModel:    map.get('highway_api_model')    || 'claude-fable-5',
      localLmEnabled,
      thirdPartyEnabled:  map.get('third_party_enabled') === 'true',
      thirdPartyBaseUrl:  map.get('third_party_base_url')  || 'https://openrouter.ai/api/v1',
      thirdPartyApiKey,
      thirdPartyModel,

      backupModelPrimary: map.get('backup_model_primary') || '',
      backupModelSecondary: map.get('backup_model_secondary') || '',
      useAgentSpecificRouting: map.get('use_agent_specific_routing') === 'true',
      vertexEnabled: map.get('vertex_enabled') === 'true',
      gcpProjectId: map.get('gcp_project_id') || '',
      gcpLocation: map.get('gcp_location') || 'us-central1',
      generationConcurrency: parseInt(map.get('generation_concurrency') || '5', 10),
    };
  },

  saveSettings(settings: Partial<ApiSettings>): void {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    `);
    db.transaction(() => {
      for (const [key, val] of Object.entries(settings)) {
        if (val !== undefined && val !== null) {
          let dbKey = key;
          let valStr = String(val);

          if (key === 'geminiApiKeys') {
            dbKey = 'gemini_api_keys';
            valStr = JSON.stringify(val);
            if (Array.isArray(val) && val.length > 0) {
              stmt.run('gemini_api_key', val[0]);
            }
          }
          else if (key === 'geminiApiKey') {
            dbKey = 'gemini_api_key';
          } else if (key === 'apiKey') {
            if ('geminiApiKey' in settings) continue;
            const currentModel = settings.model || SettingsRepository.getSettings().model;
            if (currentModel.startsWith('gemini')) {
              dbKey = 'gemini_api_key';
            } else {
              continue;
            }
          }
          else if (key === 'model') dbKey = 'selected_model';
          else if (key === 'highwayApiKey') dbKey = 'highway_api_key';
          else if (key === 'highwayApiEnabled') dbKey = 'highway_api_enabled';
          else if (key === 'highwayApiBaseUrl') dbKey = 'highway_api_base_url';
          else if (key === 'highwayApiModel') dbKey = 'highway_api_model';
          else if (key === 'localLmEnabled') dbKey = 'local_lm_enabled';
          else if (key === 'geminiEnabled') dbKey = 'gemini_enabled';
          else if (key === 'thirdPartyEnabled') dbKey = 'third_party_enabled';
          else if (key === 'thirdPartyBaseUrl') dbKey = 'third_party_base_url';
          else if (key === 'thirdPartyApiKey') dbKey = 'third_party_api_key';
          else if (key === 'thirdPartyModel') dbKey = 'third_party_model';
          else if (key === 'backupModelPrimary') dbKey = 'backup_model_primary';
          else if (key === 'backupModelSecondary') dbKey = 'backup_model_secondary';
          else if (key === 'useAgentSpecificRouting') dbKey = 'use_agent_specific_routing';
          else if (key === 'vertexEnabled') dbKey = 'vertex_enabled';
          else if (key === 'gcpProjectId') dbKey = 'gcp_project_id';
          else if (key === 'gcpLocation') dbKey = 'gcp_location';
          else if (key === 'generationConcurrency') dbKey = 'generation_concurrency';

          stmt.run(dbKey, valStr);
        }
      }
    })();
  },
};
