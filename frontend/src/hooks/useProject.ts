import { useProjectStore } from '../store/project.store';

export function useProject() {
  const projects = useProjectStore((s) => s.projects);
  const activeProject = useProjectStore((s) => s.activeProject);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const isLoading = useProjectStore((s) => s.isLoading);
  const error = useProjectStore((s) => s.error);
  
  const storyPlan = useProjectStore((s) => s.storyPlan);
  const bible = useProjectStore((s) => s.bible);
  const script = useProjectStore((s) => s.script);
  const phases = useProjectStore((s) => s.phases);
  const scenes = useProjectStore((s) => s.scenes);
  const veoPrompts = useProjectStore((s) => s.veoPrompts);
  const isBulkGenerating = useProjectStore((s) => s.isBulkGenerating);
  const bulkGenerationProgress = useProjectStore((s) => s.bulkGenerationProgress);
  const bulkGenerationError = useProjectStore((s) => s.bulkGenerationError);
  
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const selectProject = useProjectStore((s) => s.selectProject);
  const fetchProjectDetails = useProjectStore((s) => s.fetchProjectDetails);
  const createProject = useProjectStore((s) => s.createProject);
  const updateProject = useProjectStore((s) => s.updateProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const approveScript = useProjectStore((s) => s.approveScript);
  const updateBible = useProjectStore((s) => s.updateBible);
  const updatePhase = useProjectStore((s) => s.updatePhase);
  const updateScene = useProjectStore((s) => s.updateScene);
  const updatePrompt = useProjectStore((s) => s.updatePrompt);
  const fetchStoryPlan = useProjectStore((s) => s.fetchStoryPlan);
  const updateStoryPlan = useProjectStore((s) => s.updateStoryPlan);
  const approveStoryPlan = useProjectStore((s) => s.approveStoryPlan);
  const setBulkGenerating = useProjectStore((s) => s.setBulkGenerating);
  const setBulkGenerationProgress = useProjectStore((s) => s.setBulkGenerationProgress);
  const setBulkGenerationError = useProjectStore((s) => s.setBulkGenerationError);

  return {
    projects,
    activeProject,
    activeProjectId,
    storyPlan,
    bible,
    script,
    phases,
    scenes,
    veoPrompts,
    isLoading,
    error,
    isBulkGenerating,
    bulkGenerationProgress,
    bulkGenerationError,
    fetchProjects,
    selectProject,
    fetchProjectDetails,
    createProject,
    updateProject,
    deleteProject,
    approveScript,
    updateBible,
    updatePhase,
    updateScene,
    updatePrompt,
    fetchStoryPlan,
    updateStoryPlan,
    approveStoryPlan,
    setBulkGenerating,
    setBulkGenerationProgress,
    setBulkGenerationError,
  };
}
