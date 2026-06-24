export const AGENT_MODEL_MAPPING: Record<string, string> = {
  ProductionBibleAgent: 'gemini-2.5-pro',
  ScriptAgent:          'gemini-2.5-pro',
  SceneAgent:           'gemini-2.5-pro',
  VeoAgent:             'gemini-2.5-pro',
  StoryPlannerAgent:    'gemini-2.5-flash',
  HookScorerAgent:      'gemini-2.5-flash',
  StoryAnalyzerAgent:   'gemini-2.5-flash',
  TitleMetadataAgent:   'gemini-2.5-flash',
  ContinuityAgent:      'gemini-2.5-flash',
  ConceptAgent:         'gemini-2.5-pro',
  CredibilityReviewerAgent: 'gemini-2.5-pro',
  // sub-agents → fast model
  VeoAgent_AppearanceValidator:     'gemini-2.5-flash',
  VeoAgent_NarrationFit:            'gemini-2.5-flash',
  VeoAgent_ConnectionReconciliation:'gemini-2.5-flash',
};
