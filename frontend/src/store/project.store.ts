import { create } from 'zustand';
import type { Project, ProductionBibleData, Script, Phase, Scene, VeoPrompt, SceneItem, VeoPromptData, StoryPlanData, ScriptTone, StoryAnalysisData, CredibilityReviewData } from 'shared';
import { projectsApi } from '../api/projects.api';
import { bibleApi } from '../api/bible.api';
import { storyPlanApi } from '../api/storyplan.api';
import { scriptApi } from '../api/script.api';
import { scenesApi } from '../api/scenes.api';
import { veoPromptsApi } from '../api/veoprompts.api';
import { continuityApi } from '../api/continuity.api';
import { storyAnalysisApi } from '../api/storyanalysis.api';
import { credibilityReviewApi } from '../api/credibilityreview.api';
import { toast } from 'react-hot-toast';

let activeScanEventSource: EventSource | null = null;

interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  activeProject: Project | null;
  storyPlan: StoryPlanData | null;
  bible: ProductionBibleData | null;
  productionBible: ProductionBibleData | null;
  script: Script | null;
  phases: Phase[];
  scenes: Scene[];
  veoPrompts: VeoPrompt[];
  storyAnalysis: StoryAnalysisData | null;
  credibilityReview: CredibilityReviewData | null;
  isLoading: boolean;
  error: string | null;
  isContinuityScanRunning: boolean;
  continuityScanProgress: { phase: number; total_phases: number } | null;
  hookRewriteLoading: boolean;
  hookRewriteAttempts: number;

  isBulkGenerating: boolean;
  bulkGenerationProgress: { currentPhase: number; totalPhases: number; currentStep: 'scenes' | 'prompts'; completedPhases: number[] } | null;
  bulkGenerationError: { phase: number; message: string } | null;

  setBulkGenerating: (isGenerating: boolean) => void;
  setBulkGenerationProgress: (progress: { currentPhase: number; totalPhases: number; currentStep: 'scenes' | 'prompts'; completedPhases: number[] } | null) => void;
  setBulkGenerationError: (error: { phase: number; message: string } | null) => void;

  // Actions
  fetchProjects: () => Promise<void>;
  selectProject: (id: string | null) => Promise<void>;
  fetchProjectDetails: (id: string) => Promise<void>;
  setStoryAnalysis: (analysis: StoryAnalysisData | null) => void;
  setCredibilityReview: (review: CredibilityReviewData | null) => void;
  createProject: (data: { title: string; topic: string; visual_style: string; narration_language: string; aspect_ratio: string; youtube_transcript?: string | null; content_type?: string; content_profile?: string; concept_brief?: string | null; style_id?: string | null }) => Promise<Project>;
  updateProject: (id: string, data: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  duplicateProject: (id: string) => Promise<Project>;
  
  fetchStoryPlan: (id: string) => Promise<void>;
  updateStoryPlan: (data: StoryPlanData) => Promise<void>;
  approveStoryPlan: (approved: boolean) => Promise<void>;

  updateBible: (data: ProductionBibleData) => Promise<void>;
  setProductionBible: (bible: ProductionBibleData | null) => void;
  approveScript: (approved: boolean) => Promise<any>;
  updatePhase: (phaseNumber: number, data: { title: string; content: string; narration_text?: string; narration_word_count?: number }) => Promise<void>;
  updateScene: (sceneId: string, data: SceneItem) => Promise<void>;
  updatePrompt: (promptId: string, data: VeoPromptData) => Promise<void>;
  startContinuityScan: (projectId: string) => Promise<void>;
  cancelContinuityScan: () => void;
  scriptTone: ScriptTone;
  setScriptTone: (values: Partial<ScriptTone>) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  setHookRewriteLoading: (loading: boolean) => void;
  incrementHookRewriteAttempts: () => void;
  resetHookRewriteAttempts: () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  activeProject: null,
  storyPlan: null,
  bible: null,
  productionBible: null,
  script: null,
  phases: [],
  scenes: [],
  veoPrompts: [],
  storyAnalysis: null,
  credibilityReview: null,
  isLoading: false,
  error: null,
  isContinuityScanRunning: false,
  continuityScanProgress: null,
  scriptTone: {
    pacing: 5,
    emotional_intensity: 5,
    narration_style: 5,
    target_audience: 'auto',
    hook_regenerate: 'auto',
    pre_climax_spike: 'auto',
    long_open_loop: 'auto',
  },
  hookRewriteLoading: false,
  hookRewriteAttempts: 0,

  isBulkGenerating: false,
  bulkGenerationProgress: null,
  bulkGenerationError: null,

  setBulkGenerating: (isBulkGenerating) => set({ isBulkGenerating }),
  setBulkGenerationProgress: (bulkGenerationProgress) => set({ bulkGenerationProgress }),
  setBulkGenerationError: (bulkGenerationError) => set({ bulkGenerationError }),

  setScriptTone: (values) => set((state) => ({ scriptTone: { ...state.scriptTone, ...values } })),
  setProductionBible: (productionBible) => set({ productionBible }),
  setStoryAnalysis: (storyAnalysis) => set({ storyAnalysis }),
  setCredibilityReview: (credibilityReview) => set({ credibilityReview }),
  setHookRewriteLoading: (hookRewriteLoading) => set({ hookRewriteLoading }),
  incrementHookRewriteAttempts: () => set((state) => ({ hookRewriteAttempts: state.hookRewriteAttempts + 1 })),
  resetHookRewriteAttempts: () => set({ hookRewriteAttempts: 0 }),

  fetchProjects: async () => {
    set({ isLoading: true, error: null });
    try {
      const projects = await projectsApi.getProjects();
      set({ projects, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to load projects', isLoading: false });
    }
  },

  selectProject: async (id: string | null) => {
    if (!id) {
      set({
        activeProjectId: null,
        activeProject: null,
        storyPlan: null,
        bible: null,
        productionBible: null,
        script: null,
        phases: [],
        scenes: [],
        veoPrompts: [],
        storyAnalysis: null,
        credibilityReview: null,
      });
      return;
    }

    set({ activeProjectId: id });
    await get().fetchProjectDetails(id);
  },

  fetchProjectDetails: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const activeProject = await projectsApi.getProject(id);
      
      // Load individual components, swallowing 404s for not-yet-generated assets
      let storyPlan: StoryPlanData | null = null;
      try {
        storyPlan = await storyPlanApi.getStoryPlan(id);
      } catch (e) {
        // Story Plan not generated yet
      }

      let bible: ProductionBibleData | null = null;
      try {
        bible = await bibleApi.getBible(id);
      } catch (e) {
        // Bible not generated yet
      }

      let script: Script | null = null;
      try {
        script = await scriptApi.getScript(id);
      } catch (e) {
        // Script not generated yet
      }

      let phases: Phase[] = [];
      try {
        phases = await scriptApi.getPhases(id);
      } catch (e) {
        // Phases not generated yet
      }

      let scenes: Scene[] = [];
      try {
        scenes = await scenesApi.getScenes(id);
      } catch (e) {
        // Scenes not generated yet
      }

      let veoPrompts: VeoPrompt[] = [];
      try {
        veoPrompts = await veoPromptsApi.getPrompts(id);
      } catch (e) {
        // Prompts not generated yet
      }

      let storyAnalysis: StoryAnalysisData | null = null;
      try {
        storyAnalysis = await storyAnalysisApi.getStoryAnalysis(id);
      } catch (e) {
        // Story Analysis not generated yet
      }

      let credibilityReview: CredibilityReviewData | null = null;
      try {
        credibilityReview = await credibilityReviewApi.getCredibilityReview(id);
      } catch (e) {
        // Credibility Review not generated yet
      }

      set({
        activeProject,
        storyPlan,
        bible,
        productionBible: bible,
        script,
        phases,
        scenes,
        veoPrompts,
        storyAnalysis,
        credibilityReview,
        isLoading: false,
      });
    } catch (err: any) {
      set({ error: err.message || 'Failed to load project details', isLoading: false });
    }
  },

  createProject: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const project = await projectsApi.createProject(data);
      await get().fetchProjects();
      set({ isLoading: false });
      return project;
    } catch (err: any) {
      set({ error: err.message || 'Failed to create project', isLoading: false });
      throw err;
    }
  },

  updateProject: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      await projectsApi.updateProject(id, data);
      await get().fetchProjects();
      if (get().activeProjectId === id) {
        await get().fetchProjectDetails(id);
      }
      set({ isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to update project', isLoading: false });
      throw err;
    }
  },

  deleteProject: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await projectsApi.deleteProject(id);
      await get().fetchProjects();
      if (get().activeProjectId === id) {
        get().selectProject(null);
      }
      set({ isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to delete project', isLoading: false });
      throw err;
    }
  },

  duplicateProject: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const duplicated = await projectsApi.duplicateProject(id);
      await get().fetchProjects();
      set({ isLoading: false });
      return duplicated;
    } catch (err: any) {
      set({ error: err.message || 'Failed to duplicate universe', isLoading: false });
      throw err;
    }
  },

  fetchStoryPlan: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const storyPlan = await storyPlanApi.getStoryPlan(id);
      set({ storyPlan, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to load story plan', isLoading: false });
    }
  },

  updateStoryPlan: async (data: StoryPlanData) => {
    const projectId = get().activeProjectId;
    if (!projectId) return;
    set({ isLoading: true, error: null });
    try {
      const updated = await storyPlanApi.updateStoryPlan(projectId, data);
      set({ storyPlan: updated, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to update Story Plan', isLoading: false });
      throw err;
    }
  },

  approveStoryPlan: async (approved: boolean) => {
    const projectId = get().activeProjectId;
    if (!projectId) return;
    set({ isLoading: true, error: null });
    try {
      if (approved) {
        await storyPlanApi.approveStoryPlan(projectId);
      }
      await get().fetchProjectDetails(projectId);
      set({ isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to approve Story Plan', isLoading: false });
      throw err;
    }
  },

  updateBible: async (data) => {
    const projectId = get().activeProjectId;
    if (!projectId) return;
    set({ isLoading: true, error: null });
    try {
      const updated = await bibleApi.updateBible(projectId, data);
      set({ bible: updated, productionBible: updated, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to update Production Bible', isLoading: false });
      throw err;
    }
  },

  approveScript: async (approved) => {
    const projectId = get().activeProjectId;
    if (!projectId) return;
    set({ isLoading: true, error: null });
    try {
      const res = await scriptApi.approveScript(projectId, approved);
      await get().fetchProjectDetails(projectId);
      set({ isLoading: false });
      return res;
    } catch (err: any) {
      set({ error: err.message || 'Failed to approve script', isLoading: false });
      throw err;
    }
  },

  updatePhase: async (phaseNumber, data) => {
    const projectId = get().activeProjectId;
    if (!projectId) return;
    set({ isLoading: true, error: null });
    try {
      await scriptApi.updatePhase(projectId, phaseNumber, data);
      await get().fetchProjectDetails(projectId);
      set({ isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to update phase script', isLoading: false });
      throw err;
    }
  },

  updateScene: async (sceneId, data) => {
    const projectId = get().activeProjectId;
    if (!projectId) return;
    set({ isLoading: true, error: null });
    try {
      await scenesApi.updateScene(projectId, sceneId, data);
      await get().fetchProjectDetails(projectId);
      set({ isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to update scene details', isLoading: false });
      throw err;
    }
  },

  updatePrompt: async (promptId, data) => {
    const projectId = get().activeProjectId;
    if (!projectId) return;
    set({ isLoading: true, error: null });
    try {
      await veoPromptsApi.updatePrompt(projectId, promptId, data);
      await get().fetchProjectDetails(projectId);
      set({ isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to update Veo prompt', isLoading: false });
      throw err;
    }
  },

  startContinuityScan: async (projectId: string) => {
    set({ isContinuityScanRunning: true, continuityScanProgress: null });
    
    if (activeScanEventSource) {
      activeScanEventSource.close();
      activeScanEventSource = null;
    }

    try {
      const streamUrl = `/api/v1/stream/${projectId}/continuity-scan-all`;
      activeScanEventSource = new EventSource(streamUrl);

      activeScanEventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'progress') {
            set({
              continuityScanProgress: {
                phase: payload.phase,
                total_phases: payload.total_phases
              }
            });
          } else if (payload.type === 'complete') {
            if (activeScanEventSource) {
              activeScanEventSource.close();
              activeScanEventSource = null;
            }
            set({ isContinuityScanRunning: false, continuityScanProgress: null });
            get().fetchProjectDetails(projectId).then(() => {
              if (payload.warnings_found === 0) {
                toast.success("Continuity scan complete — no issues found.");
              } else {
                toast.success(`Continuity scan complete — ${payload.warnings_found} new warnings found.`);
              }
            });
          } else if (payload.type === 'error') {
            if (activeScanEventSource) {
              activeScanEventSource.close();
              activeScanEventSource = null;
            }
            set({ isContinuityScanRunning: false, continuityScanProgress: null });
            toast.error(`Continuity scan failed: ${payload.data}`);
          }
        } catch (e) {
          console.error('Failed to parse continuity scan SSE payload:', e);
        }
      };

      activeScanEventSource.onerror = () => {
        if (activeScanEventSource) {
          activeScanEventSource.close();
          activeScanEventSource = null;
        }
        set({ isContinuityScanRunning: false, continuityScanProgress: null });
        toast.error('SSE connection error during continuity scan.');
      };

      await continuityApi.scanAll(projectId);

    } catch (err: any) {
      if (activeScanEventSource) {
        activeScanEventSource.close();
        activeScanEventSource = null;
      }
      set({ isContinuityScanRunning: false, continuityScanProgress: null });
      toast.error(`Failed to start continuity scan: ${err.message}`);
    }
  },

  cancelContinuityScan: () => {
    if (activeScanEventSource) {
      activeScanEventSource.close();
      activeScanEventSource = null;
    }
    set({ isContinuityScanRunning: false, continuityScanProgress: null });
  },

  setError: (error) => set({ error }),
  setLoading: (isLoading) => set({ isLoading }),
}));
