export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  details?: any;
}

export interface ApiSettings {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  topK?: number;
  defaultVisualStyle: string;
  defaultLanguage: string;
  defaultAspectRatio: string;
  defaultSceneCount: number;

  // Simplified Config
  geminiApiKey?: string;
  geminiEnabled?: boolean;
  highwayApiEnabled?: boolean;
  highwayApiKey?: string;
  highwayApiBaseUrl?: string;
  highwayApiModel?: string;
  localLmEnabled?: boolean;
  thirdPartyEnabled?: boolean;
  thirdPartyBaseUrl?: string;
  thirdPartyApiKey?: string;
  thirdPartyModel?: string;

  // Premium / Fallback & Routing settings
  backupModelPrimary?: string;
  backupModelSecondary?: string;
  useAgentSpecificRouting?: boolean;
  geminiApiKeys?: string[];
  vertexEnabled?: boolean;
  gcpProjectId?: string;
  gcpLocation?: string;
}

export interface StorageInfo {
  dbSize: string;
  projectCount: number;
  totalPrompts: number;
}
