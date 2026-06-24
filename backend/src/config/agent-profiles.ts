export interface AgentProfile {
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
}

export const agentProfiles: Record<string, AgentProfile> = {
  ScriptAgent: {
    temperature: 0.7,
    maxOutputTokens: 32768
  },
  SceneAgent: {
    temperature: 0.5,
    maxOutputTokens: 8192
  },
  VeoAgent: {
    temperature: 0.7,
    maxOutputTokens: 3000
  },
  ProductionBibleAgent: {
    temperature: 0.3,
    maxOutputTokens: 16384
  },
  StoryPlannerAgent: {
    temperature: 0.8,
    maxOutputTokens: 3000
  },
  StoryAnalyzerAgent: {
    temperature: 0.3,
    maxOutputTokens: 4000
  },
  CredibilityReviewerAgent: {
    temperature: 0.1,
    maxOutputTokens: 4000
  },
  HookScorerAgent: {
    temperature: 0.0,
    maxOutputTokens: 600
  },
  TitleMetadataAgent: {
    temperature: 0.6,
    maxOutputTokens: 2000
  },
  ContinuityAgent: {
    temperature: 0.2,
    maxOutputTokens: 500
  },
  VeoAgent_AppearanceValidator: {
    temperature: 0.0,
    maxOutputTokens: 8096
  },
  VeoAgent_NarrationFit: {
    temperature: 0.2,
    maxOutputTokens: 300
  },
  VeoAgent_ConnectionReconciliation: {
    temperature: 0.2,
    maxOutputTokens: 4096
  },
  ConceptAgent: {
    temperature: 0.85,
    maxOutputTokens: 4000
  }
};