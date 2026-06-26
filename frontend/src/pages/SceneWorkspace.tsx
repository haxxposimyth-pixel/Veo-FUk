import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProject } from '../hooks/useProject';
import { formatVeoPrompt } from './VeoPromptWorkspace';
import { useAgent } from '../hooks/useAgent';
import { useUiStore } from '../store/ui.store';
import { useSettingsStore } from '../store/settings.store';
import { scenesApi } from '../api/scenes.api';
import { veoPromptsApi } from '../api/veoprompts.api';
import { continuityApi } from '../api/continuity.api';
import PageHeader from '../components/layout/PageHeader';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import StreamingText from '../components/agent/StreamingText';
import {
  Clapperboard,
  Sparkles,
  Clock,
  Edit,
  RotateCcw,
  Plus,
  CheckCircle,
  Copy,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  Loader,
  Loader2,
  MapPin,
  Users,
  ChevronDown,
  ChevronUp,
  Eye,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { Scene, Phase, PhaseStatus } from 'shared';
import { getWordCount, resolveLanguageRules } from 'shared';
import { MIN_NARRATION_WORDS_PER_SCENE, NARRATION_WORDS_PER_SCENE } from 'shared';
import { useProjectStore } from '../store/project.store';
import { resolveBibleRefs } from '../utils/resolveBibleRefs';

const getNarrationLabel = (narrationText: string, language: string = 'English') => {
  if (!narrationText) return null;
  const cleanText = narrationText
    .replace(/\[WARNING: narration too short — review needed\]/g, '')
    .replace(/\[WARNING: narration cut mid-sentence — regenerate phase\]/g, '')
    .trim();
  if (cleanText === '[No narration — visual only]' || cleanText === '') {
    return (
      <span className="text-[10px] text-gray-400 font-mono font-bold ml-2 bg-white/5 px-1.5 py-0.5 rounded border border-white/10 shrink-0">
        🔇 Visual only
      </span>
    );
  }
  
  const count = getWordCount(cleanText, language);
  
  const endsCleanly = /(?:[.!?…]|\.\.\.)["'”’)]*$/.test(cleanText);
  const isWarningTag = narrationText.includes('[WARNING');

  if (count < 5 || isWarningTag) {
    return (
      <span className="text-[10px] text-rose-500 font-mono font-bold ml-2 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20 shrink-0">
        🗙 {count} words - warning
      </span>
    );
  } else if (endsCleanly && count >= MIN_NARRATION_WORDS_PER_SCENE && count <= NARRATION_WORDS_PER_SCENE) {
    return (
      <span className="text-[10px] text-emerald-400 font-mono font-bold ml-2 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0">
        ✓ {count} words
      </span>
    );
  } else {
    return (
      <span className="text-[10px] text-amber-500 font-mono font-bold ml-2 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 shrink-0">
        ⚠ {count} words — check narration
      </span>
    );
  }
};

export const SceneWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    activeProject,
    script,
    phases,
    scenes,
    veoPrompts,
    fetchProjectDetails,
    updateScene,
    isBulkGenerating,
    bulkGenerationProgress,
    bulkGenerationError,
    setBulkGenerating,
    setBulkGenerationProgress,
    setBulkGenerationError,
  } = useProject();
  const productionBible = useProjectStore((s) => s.productionBible);
  const [overwriteAll, setOverwriteAll] = useState(false);

  const isPredecessorIncomplete = useCallback((phaseNum: number): boolean => {
    for (let p = 1; p < phaseNum; p++) {
      const phase = phases.find((ph) => ph.phase_number === p);
      if (!phase || (phase as any).status !== 'done') {
        return true;
      }
      const pScenes = scenes.filter((s) => s.phase_number === p).sort((a, b) => a.scene_number - b.scene_number);
      if (pScenes.length === 0) {
        return true;
      }
      const lastScene = pScenes[pScenes.length - 1];
      if (!lastScene || !lastScene.visual_state_snapshot) {
        return true;
      }
    }
    return false;
  }, [phases, scenes]);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const runAgentStep = (
    projectId: string,
    agentName: string,
    apiCall: () => Promise<any>,
    signal: AbortSignal
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      let eventSource: EventSource | null = null;
      let timer: any = null;
      let onAbort: (() => void) | null = null;

      const cleanup = () => {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
        useUiStore.getState().stopAgentRun();
        useProjectStore.getState().setHookRewriteLoading(false);
      };

      if (signal.aborted) {
        cleanup();
        reject(new Error('Cancelled'));
        return;
      }

      useUiStore.getState().startAgentRun(agentName);

      try {
        const streamUrl = `/api/v1/stream/${projectId}/${agentName}`;
        eventSource = new EventSource(streamUrl);
        let lastEventTime = Date.now();

        timer = setInterval(() => {
          useUiStore.getState().tickAgentTimer();
          if (Date.now() - lastEventTime > 180000) {
            cleanup();
            if (onAbort) signal.removeEventListener('abort', onAbort);
            reject(new Error('Agent execution timed out (180 seconds of inactivity).'));
          }
        }, 1000);

        onAbort = () => {
          cleanup();
          reject(new Error('Cancelled'));
        };
        signal.addEventListener('abort', onAbort);

        eventSource.onmessage = (event) => {
          lastEventTime = Date.now();
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'heartbeat') {
              // Keepalive ping from backend — lastEventTime already reset above.
              return;
            } else if (payload.type === 'progress') {
              useUiStore.getState().updateAgentProgressInfo({
                current: payload.current,
                total: payload.total,
                phase: payload.phase,
                scene: payload.scene,
              });
            } else if (payload.type === 'chunk') {
              useUiStore.getState().updateAgentProgress(payload.data);
            } else if (payload.type === 'hook_rewrite_start') {
              useProjectStore.getState().setHookRewriteLoading(true);
            } else if (payload.type === 'hook_rewrite_complete') {
              useProjectStore.getState().setHookRewriteLoading(false);
              fetchProjectDetails(projectId);
            } else if (payload.type === 'hook_score') {
              fetchProjectDetails(projectId);
            } else if (payload.type === 'done') {
              cleanup();
              if (onAbort) signal.removeEventListener('abort', onAbort);
              fetchProjectDetails(projectId).then(() => {
                resolve();
              });
            } else if (payload.type === 'error') {
              cleanup();
              if (onAbort) signal.removeEventListener('abort', onAbort);
              reject(new Error(payload.data || 'Step failed'));
            }
          } catch (err) {
            console.error('Error parsing SSE event data:', err);
          }
        };

        eventSource.onerror = (err) => {
          console.error('EventSource connection error:', err);
          cleanup();
          if (onAbort) signal.removeEventListener('abort', onAbort);
          reject(new Error('Lost connection to backend server.'));
        };

        apiCall().catch((err) => {
          cleanup();
          if (onAbort) signal.removeEventListener('abort', onAbort);
          reject(err);
        });

      } catch (err: any) {
        cleanup();
        if (onAbort) signal.removeEventListener('abort', onAbort);
        reject(err);
      }
    });
  };

  const startBulkGeneration = async (startFromPhaseNum = 1) => {
    if (!id) return;

    setBulkGenerationError(null);
    setBulkGenerating(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const totalPhases = phases.length;
    let completed = startFromPhaseNum > 1 ? Array.from({ length: startFromPhaseNum - 1 }, (_, i) => i + 1) : [];

    // Calculate how many phases will run vs. be skipped
    const phasesToRun = phases.filter((p) => {
      const pNum = p.phase_number;
      if (pNum < startFromPhaseNum) return false;
      const sForPhase = scenes.filter((s) => s.phase_number === pNum);
      const scenesDone = (p as any).scenes_generated === 1 && sForPhase.length > 0;
      const promptsDone = sForPhase.length > 0 && sForPhase.every((s) => s.veo_prompt_generated === 1);
      return overwriteAll || !(scenesDone && promptsDone);
    });

    const runCount = phasesToRun.length;
    const skippedCount = totalPhases - runCount - completed.length;

    toast(`Starting generation: ${runCount} phases will run, ${skippedCount} phases skipped.`, { icon: 'ℹ️' });

    setBulkGenerationProgress({
      currentPhase: startFromPhaseNum,
      totalPhases,
      currentStep: 'scenes',
      completedPhases: completed,
    });

    let currentRunningPhase = startFromPhaseNum;

    try {
      for (let pNum = startFromPhaseNum; pNum <= totalPhases; pNum++) {
        currentRunningPhase = pNum;
        if (abortController.signal.aborted) {
          throw new Error('Cancelled');
        }

        const phase = phases.find((ph) => ph.phase_number === pNum);
        const sForPhase = scenes.filter((s) => s.phase_number === pNum);
        const scenesDone = !!(phase && (phase as any).scenes_generated === 1 && sForPhase.length > 0);
        const promptsDone = !!(sForPhase.length > 0 && sForPhase.every((s) => s.veo_prompt_generated === 1));

        const skipScenes = !overwriteAll && scenesDone;
        const skipPrompts = !overwriteAll && promptsDone;

        if (skipScenes && skipPrompts) {
          completed = [...completed, pNum];
          setBulkGenerationProgress({
            currentPhase: Math.min(pNum + 1, totalPhases),
            totalPhases,
            currentStep: 'scenes',
            completedPhases: completed,
          });
          continue;
        }

        setSelectedPhaseNum(pNum);

        // --- Step 1: Scenes Generation ---
        if (!skipScenes) {
          setBulkGenerationProgress({
            currentPhase: pNum,
            totalPhases,
            currentStep: 'scenes',
            completedPhases: completed,
          });

          await runAgentStep(
            id,
            `SceneAgent_Phase${pNum}`,
            () => scenesApi.generateScenes(id, { phaseNumber: pNum, regenerate: overwriteAll }),
            abortController.signal
          );
        }

        // --- Step 2: Prompts Generation ---
        if (!skipPrompts) {
          setBulkGenerationProgress({
            currentPhase: pNum,
            totalPhases,
            currentStep: 'prompts',
            completedPhases: completed,
          });

          await runAgentStep(
            id,
            `VeoAgent_Phase_${pNum}`,
            () => veoPromptsApi.generatePrompt(id, { phaseNumber: pNum, regenerate: overwriteAll }),
            abortController.signal
          );
        }

        completed = [...completed, pNum];
        setBulkGenerationProgress({
          currentPhase: Math.min(pNum + 1, totalPhases),
          totalPhases,
          currentStep: 'scenes',
          completedPhases: completed,
        });
      }

      setBulkGenerating(false);
      setBulkGenerationProgress(null);
      toast.success('All phases and scenes generated successfully!');
    } catch (err: any) {
      if (err.message === 'Cancelled' || abortController.signal.aborted) {
        toast.error('Bulk generation cancelled.');
      } else {
        let displayMsg = err.message || 'Generation failed';
        if (err.status === 409 || err.reason) {
          if (err.reason === 'generation_in_progress') {
            displayMsg = `Generation is already in progress for this project (Active: ${err.active_phase || 'another task'}).`;
          } else if (err.reason === 'previous_phase_incomplete') {
            displayMsg = err.message || 'Predecessor phases are incomplete. Please complete preceding phases first.';
          }
        }
        setBulkGenerationError({
          phase: currentRunningPhase,
          message: displayMsg,
        });
        toast.error(`Bulk generation failed at Phase ${currentRunningPhase}: ${displayMsg}`);
      }
      setBulkGenerating(false);
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleCancelBulkGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const [expandedVisualStates, setExpandedVisualStates] = useState<Record<string, boolean>>({});
  const [expandedPrompts, setExpandedPrompts] = useState<Record<string, boolean>>({});
  const [expandedOverlays, setExpandedOverlays] = useState<Record<string, boolean>>({});

  const toggleVisualStateExpand = (sceneId: string) => {
    setExpandedVisualStates((prev) => ({
      ...prev,
      [sceneId]: !prev[sceneId],
    }));
  };

  const togglePromptExpand = (sceneId: string) => {
    setExpandedPrompts((prev) => ({
      ...prev,
      [sceneId]: !prev[sceneId],
    }));
  };

  const toggleOverlayExpand = (sceneId: string) => {
    setExpandedOverlays((prev) => ({
      ...prev,
      [sceneId]: !prev[sceneId],
    }));
  };
  
  const scriptData = script
    ? (typeof script.raw_json === 'string' ? JSON.parse(script.raw_json) : script.raw_json)
    : null;
  const getPhaseItem = (pNum: number) => {
    return scriptData?.phases?.find((sp: any) => sp.phase_number === pNum);
  };
  const { invokeAgent, isRunning } = useAgent();
  const activeAgentRun = useUiStore((s) => s.activeAgentRun);
  const settings = useSettingsStore((s) => s.settings);

  const isPhaseBusy = useCallback((phaseNum: number): boolean => {
    if (!activeAgentRun) return false;
    const agent = activeAgentRun.agentName;
    return (
      agent === `SceneAgent_Phase${phaseNum}` ||
      agent === `VeoAgent_Phase_${phaseNum}` ||
      !!(agent.startsWith(`SceneAgent_Scene`) && scenes.find(s => `SceneAgent_Scene${s.scene_number}` === agent)?.phase_number === phaseNum) ||
      agent.startsWith(`VeoAgent_Scene_${phaseNum}_`) ||
      !!(agent.startsWith(`VeoAgent_Regen_`) && veoPrompts.find(vp => `VeoAgent_Regen_${vp.prompt_number}` === agent)?.phase_number === phaseNum)
    );
  }, [activeAgentRun, scenes, veoPrompts]);

  // Selected phase
  const [selectedPhaseNum, setSelectedPhaseNum] = useState<number>(1);
  
  // Scene edit modal
  const [editingScene, setEditingScene] = useState<any | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editContinuity, setEditContinuity] = useState('');
  const [editNarration, setEditNarration] = useState('');

  // Regeneration targets
  const [regenSceneTarget, setRegenSceneTarget] = useState<any | null>(null);

  // Continuity Warnings
  const [continuityWarnings, setContinuityWarnings] = useState<any[]>([]);

  const fetchWarnings = () => {
    if (id) {
      continuityApi.getWarnings(id).then(setContinuityWarnings).catch(() => {});
    }
  };

  useEffect(() => {
    fetchWarnings();
  }, [id, scenes, activeAgentRun]);

  // Tooltip state
  const [activeTooltipPhase, setActiveTooltipPhase] = useState<number | null>(null);

  useEffect(() => {
    if (id) {
      fetchProjectDetails(id);
    }
  }, [id, fetchProjectDetails]);

  // Click-away listener to close the tooltip
  useEffect(() => {
    const handleOutsideClick = () => {
      setActiveTooltipPhase(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Filter scenes and prompts for selected phase
  const phaseScenes = scenes.filter((s: Scene) => s.phase_number === selectedPhaseNum);
  const selectedPhase = phases.find((p: Phase) => p.phase_number === selectedPhaseNum);

  const selectedPhaseNarrationText = selectedPhase?.narration_text ?? selectedPhase?.phase_content ?? '';
  const selectedPhaseNarrationWordCount = selectedPhase?.narration_word_count ?? getWordCount(selectedPhaseNarrationText, activeProject?.narration_language || 'English');
  const selectedPhaseNarrationTooShort = selectedPhaseNarrationWordCount < 60;

  const handleEditStart = (scene: Scene) => {
    setEditingScene(scene);
    setEditTitle(scene.title);
    setEditDesc(scene.scene_description);
    setEditContinuity(scene.continuity_notes);
    setEditNarration(scene.narration_fragment);
  };

  const handleEditSave = async () => {
    if (!id || !editingScene) return;
    try {
      const sData = typeof editingScene.raw_json === 'string'
        ? JSON.parse(editingScene.raw_json)
        : editingScene.raw_json;
      const updatedItem = {
        ...sData,
        title: editTitle,
        scene_description: editDesc,
        continuity_notes: editContinuity,
        narration_fragment: editNarration,
      };

      await updateScene(editingScene.id, updatedItem);
      toast.success('Scene updated successfully!');
      setEditingScene(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update scene');
    }
  };

  const handleRegenerateScene = async () => {
    if (!id || !regenSceneTarget) return;
    const sNum = regenSceneTarget.scene_number;
    setRegenSceneTarget(null);

    await invokeAgent(id, `SceneAgent_Scene${sNum}`, async () => {
      await scenesApi.regenerateScene(id, regenSceneTarget.id);
    });
  };

  const handleGenerateScenesForPhase = async (phaseNum?: number) => {
    const targetPhase = phaseNum ?? selectedPhaseNum;
    if (!id) return;
    await invokeAgent(id, `SceneAgent_Phase${targetPhase}`, async () => {
      await scenesApi.generateScenes(id, { phaseNumber: targetPhase });
    });
  };

  const handleRegenerateScenesForPhase = async (phaseNumber: number) => {
    if (!id) return;
    const confirm = window.confirm(`Are you sure you want to regenerate all scenes for Phase ${phaseNumber}? This will overwrite the existing scenes.`);
    if (!confirm) return;
    await invokeAgent(id, `SceneAgent_Phase${phaseNumber}`, async () => {
      await scenesApi.generateScenes(id, { phaseNumber, regenerate: true });
    });
  };

  const handleRepairContinuity = async () => {
    if (!id) return;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    try {
      await runAgentStep(
        id,
        'SceneAgent_RepairContinuity',
        () => scenesApi.repairContinuity(id),
        abortController.signal
      );
      toast.success('Continuity repair completed successfully!');
    } catch (err: any) {
      if (err.message !== 'Cancelled') {
        let displayMsg = err.message || 'Repair failed';
        if (err.status === 409 || err.reason) {
          if (err.reason === 'generation_in_progress') {
            displayMsg = `Generation is already in progress for this project (Active: ${err.active_phase || 'another task'}).`;
          }
        }
        toast.error(`Continuity repair failed: ${displayMsg}`);
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleRetryPhase = async (phaseNumber: number) => {
    if (!id) return;
    await invokeAgent(id, `SceneAgent_Phase${phaseNumber}`, async () => {
      await scenesApi.retryPhase(id, phaseNumber);
    });
    toast.success(`Retrying Phase ${phaseNumber}...`);
  };

  const handleGeneratePromptForScene = async (sceneRow: any) => {
    if (!id) return;
    const agentName = `VeoAgent_Scene_${sceneRow.phase_number}_${sceneRow.scene_number}`;
    await invokeAgent(id, agentName, async () => {
      await veoPromptsApi.generatePrompt(id, { sceneId: sceneRow.id });
    });
    toast.success('Veo prompt generated!');
  };

  const handleGenerateAllPromptsForPhase = async (phaseNum?: number) => {
    const targetPhase = phaseNum ?? selectedPhaseNum;
    if (!id) return;
    const agentName = `VeoAgent_Phase_${targetPhase}`;
    await invokeAgent(id, agentName, async () => {
      await veoPromptsApi.generatePrompt(id, { phaseNumber: targetPhase, regenerate: overwriteAll });
    });
    toast.success(`Veo prompt generation for Phase ${targetPhase} completed!`);
  };

  const handleCopyFullScript = () => {
    if (!phases || phases.length === 0) return;
    const fullText = phases
      .map((p) => `Phase ${p.phase_number} (${p.phase_type}) - ${p.phase_title}\n${p.narration_text ?? ''}`)
      .join('\n\n');
    navigator.clipboard.writeText(fullText);
    toast.success('Full script copied to clipboard!');
  };

  const hasApiKey = !!settings?.apiKey;

  // Helpers for sidebar metrics
  const getPhaseScenesCount = (pNum: number) => {
    return scenes.filter((s: Scene) => s.phase_number === pNum).length;
  };

  const getPhaseCompletionPercent = (pNum: number) => {
    const pScenes = scenes.filter((s: Scene) => s.phase_number === pNum);
    if (pScenes.length === 0) return 0;
    
    const completed = pScenes.filter((s: Scene) => s.veo_prompt_generated === 1).length;
    return Math.round((completed / pScenes.length) * 100);
  };

  const isGeneratingScenes = activeAgentRun && activeAgentRun.agentName === `SceneAgent_Phase${selectedPhaseNum}`;
  const isBulkGeneratingPrompts = activeAgentRun && activeAgentRun.agentName === `VeoAgent_Phase_${selectedPhaseNum}`;

  return (
    <div className="space-y-8 select-none">
      <PageHeader
        title="Scene Workspace"
        description="Review visual camera setups and storyboard frames. Break narration scripts down into scene-by-scene instructions for the video generator."
        actions={
          <div className="flex items-center gap-3">
            {phases.length > 0 && (
              <Button
                onClick={handleCopyFullScript}
                disabled={isBulkGenerating}
                className="flex items-center gap-1.5 cursor-pointer border-[#6C63FF]/30 text-[#6C63FF] hover:bg-[#6C63FF]/10"
                variant="secondary"
              >
                <Copy className="w-4 h-4" />
                <span>Copy Full Script</span>
              </Button>
            )}
            {id && (
              <Button
                onClick={() => navigate(`/projects/${id}/export`)}
                disabled={isBulkGenerating}
                className="flex items-center gap-1.5 cursor-pointer border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                variant="secondary"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Export</span>
              </Button>
            )}
            {isBulkGenerating ? (
              <Button
                onClick={handleCancelBulkGeneration}
                className="flex items-center gap-1.5 cursor-pointer bg-rose-600 hover:bg-rose-550 text-white font-bold"
              >
                <span>Cancel</span>
              </Button>
            ) : (
              phases.length > 0 && (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 bg-[#1A1A24] border border-[#2A2A38] px-3 py-1.5 rounded-lg">
                    <input
                      type="checkbox"
                      id="overwriteAll"
                      checked={overwriteAll}
                      onChange={(e) => setOverwriteAll(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 bg-black text-[#6C63FF] focus:ring-[#6C63FF] cursor-pointer"
                    />
                    <label htmlFor="overwriteAll" className="text-xs text-gray-300 cursor-pointer select-none">
                      Overwrite Existing
                    </label>
                  </div>
                  <Button
                    onClick={() => startBulkGeneration(1)}
                    disabled={!hasApiKey || isRunning}
                    className="flex items-center gap-1.5 cursor-pointer bg-[#6C63FF] hover:bg-[#6C63FF]/90 text-white font-bold"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Generate All Scenes</span>
                  </Button>
                </div>
              )
            )}
            {phaseScenes.length > 0 && (
              <Button
                onClick={() => handleGenerateAllPromptsForPhase(selectedPhaseNum)}
                disabled={!hasApiKey || isPhaseBusy(selectedPhaseNum) || isBulkGenerating || isPredecessorIncomplete(selectedPhaseNum)}
                title={isPredecessorIncomplete(selectedPhaseNum) ? `Complete Phase ${selectedPhaseNum - 1} first (continuity chain)` : undefined}
                className="flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Generate All Prompts (Phase {selectedPhaseNum})</span>
              </Button>
            )}
          </div>
        }
      />

      {isBulkGenerating && bulkGenerationProgress && (
        <Card className="bg-[#111118]/65 border-[#6C63FF]/30 p-5 space-y-4 shadow-lg shadow-[#6C63FF]/5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="space-y-1">
              <h4 className="font-bold text-sm text-white flex items-center gap-2">
                <Loader className="w-4 h-4 animate-spin text-[#6C63FF]" />
                Processing Phase {bulkGenerationProgress.currentPhase} of {bulkGenerationProgress.totalPhases}...
              </h4>
              <p className="text-xs text-gray-400 font-mono">
                Current Step: <span className="text-[#6C63FF] font-bold uppercase">{bulkGenerationProgress.currentStep === 'scenes' ? 'Generating Scenes' : 'Generating Veo Prompts'}</span>
              </p>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
              <Button
                onClick={handleCancelBulkGeneration}
                variant="secondary"
                className="w-full sm:w-auto border-rose-500/30 text-rose-400 hover:bg-rose-500/10 cursor-pointer text-xs"
              >
                Cancel Generation
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] text-gray-500 font-mono">
              <span>Progress: {Math.round((bulkGenerationProgress.completedPhases.length / bulkGenerationProgress.totalPhases) * 100)}%</span>
              <span>
                {bulkGenerationProgress.completedPhases.length} / {bulkGenerationProgress.totalPhases} Phases Completed
                {phases.filter(p => !overwriteAll && p.scenes_generated === 1 && scenes.filter(s => s.phase_number === p.phase_number).length > 0 && scenes.filter(s => s.phase_number === p.phase_number).every(s => s.veo_prompt_generated === 1)).length > 0 && 
                  ` (${phases.filter(p => !overwriteAll && p.scenes_generated === 1 && scenes.filter(s => s.phase_number === p.phase_number).length > 0 && scenes.filter(s => s.phase_number === p.phase_number).every(s => s.veo_prompt_generated === 1)).length} skipped)`}
              </span>
            </div>
            <div className="w-full bg-[#1A1A24] h-2 rounded-full overflow-hidden border border-white/5">
              <div
                className="bg-gradient-to-r from-[#6C63FF] to-[#A5A1FF] h-full transition-all duration-500 ease-out"
                style={{ width: `${(bulkGenerationProgress.completedPhases.length / bulkGenerationProgress.totalPhases) * 100}%` }}
              />
            </div>
          </div>
        </Card>
      )}

      {bulkGenerationError && (
        <Card className="bg-rose-500/10 border-rose-500/30 p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-lg shadow-rose-500/5">
          <div className="space-y-1">
            <h4 className="font-bold text-sm text-rose-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-550 shrink-0" />
              Pipeline Interrupted: Phase {bulkGenerationError.phase} Failed
            </h4>
            <p className="text-xs text-gray-300">
              {bulkGenerationError.message}
            </p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto shrink-0">
            <Button
              onClick={() => {
                setBulkGenerationError(null);
              }}
              variant="ghost"
              className="w-full sm:w-auto text-gray-400 hover:text-white text-xs"
            >
              Dismiss
            </Button>
            <Button
              onClick={() => startBulkGeneration(bulkGenerationError.phase)}
              className="w-full sm:w-auto bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs"
            >
              Retry Phase {bulkGenerationError.phase}
            </Button>
          </div>
        </Card>
      )}

      {scenes.some(s => s.continuity_stale === 1) && (
        <Card className="bg-[#D97706]/10 border-[#D97706]/30 p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-lg shadow-[#D97706]/5">
          <div className="space-y-1">
            <h4 className="font-bold text-sm text-[#F59E0B] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0" />
              Continuity stale: Downstream scenes may have drifted from updated visual states
            </h4>
            <p className="text-xs text-gray-300">
              Upstream scene changes have invalidated the visual continuity chain. Repair the continuity to realign snapshots sequentially.
            </p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto shrink-0">
            <Button
              onClick={handleRepairContinuity}
              disabled={isRunning || isBulkGenerating}
              className="w-full sm:w-auto bg-[#D97706] hover:bg-[#B45309] text-white font-bold text-xs"
            >
              Repair Continuity
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left column: Phase Navigation List */}
        <div className="space-y-2 shrink-0">
          <div className="sticky top-6 border border-[#2A2A38] rounded-xl p-3 bg-[#111118]/50 space-y-1">
            <div className="px-3 pb-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-[#2A2A38]/30 mb-2">
              Timeline Phases
            </div>
            
            {phases.map((p: Phase) => {
              const sCount = getPhaseScenesCount(p.phase_number);
              const pComplete = getPhaseCompletionPercent(p.phase_number);
              const isActive = selectedPhaseNum === p.phase_number;
              const phaseStatus = (p as any).status as PhaseStatus | undefined;
              const isPredInc = isPredecessorIncomplete(p.phase_number);

              const rawNarration = p.narration_text ?? p.phase_content ?? '';
              const narrationWordCount = p.narration_word_count ?? getWordCount(rawNarration, activeProject?.narration_language || 'English');

              const activeItem = getPhaseItem(p.phase_number);
              const locationName = productionBible?.location_roster
                ?.find(l => l.id === activeItem?.location_id_primary)
                ?.name ?? activeItem?.location_id_primary ?? '';
              const charNames = activeItem?.character_ids_active && activeItem.character_ids_active.length > 0
                ? activeItem.character_ids_active.map((id: string) => 
                    productionBible?.character_roster?.find(c => c.id === id)?.name ?? id
                  ).join(', ')
                : '';

              const getNarrationHealthIndicator = () => {
                if (narrationWordCount >= 120) {
                  return (
                    <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 shrink-0">
                      ✓ {narrationWordCount}w
                    </span>
                  );
                }
                if (narrationWordCount >= 60) {
                  return (
                    <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                      ⚠ {narrationWordCount}w
                    </span>
                  );
                }
                return (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTooltipPhase(activeTooltipPhase === p.phase_number ? null : p.phase_number);
                    }}
                    className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 shrink-0 cursor-pointer relative"
                  >
                    ✗ {narrationWordCount}w — too short
                    {activeTooltipPhase === p.phase_number && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-[#1E1E2A] text-white text-xs p-3 rounded-lg shadow-xl border border-[#3A3A50] z-50 pointer-events-auto whitespace-normal font-sans normal-case font-normal leading-relaxed">
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1E1E2A]" />
                        Narration too short to generate quality scenes. Go back to Script Workspace and regenerate this phase, or edit the narration text directly.
                      </div>
                    )}
                  </span>
                );
              };

              return (
                <div
                  key={p.phase_number}
                  onClick={() => setSelectedPhaseNum(p.phase_number)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#6C63FF]/10 text-white border border-[#6C63FF]/20'
                      : 'text-gray-400 hover:bg-white/5 hover:text-white border border-transparent'
                  }`}
                >
                  <div className="space-y-0.5 overflow-hidden pr-2 flex-1">
                    <div className="text-xs font-bold truncate flex items-center gap-1.5 flex-wrap">
                      <span className="truncate">{p.phase_title}</span>
                      {getNarrationHealthIndicator()}
                    </div>
                    <div className="text-[10px] text-gray-500 font-mono">
                      Phase {p.phase_number} · {sCount} scenes · ~{Math.floor((sCount * 8) / 60) > 0 ? `${Math.floor((sCount * 8) / 60)}m ` : ''}{(sCount * 8) % 60}s
                    </div>
                    {(locationName || charNames) && (
                      <div className="flex items-center gap-2 text-[9px] text-gray-500 font-mono mt-1 flex-wrap">
                        {locationName && (
                          <span className="flex items-center gap-1 bg-white/5 px-1 py-0.5 rounded border border-white/10 max-w-[100px] truncate" title={locationName}>
                            <MapPin className="w-2.5 h-2.5 text-[#6C63FF] shrink-0" />
                            <span className="truncate">{locationName}</span>
                          </span>
                        )}
                        {charNames && (
                          <span className="flex items-center gap-1 bg-white/5 px-1 py-0.5 rounded border border-white/10 max-w-[120px] truncate" title={charNames}>
                            <Users className="w-2.5 h-2.5 text-[#6C63FF] shrink-0" />
                            <span className="truncate">{charNames}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1.5 shrink-0">
                                 {phaseStatus === 'failed' ? (
                      <>
                        <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-red-550/10 text-red-400 border border-red-555/20 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Failed
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); if (!isPredInc && !isPhaseBusy(p.phase_number)) handleRetryPhase(p.phase_number); }}
                          disabled={isPredInc || isPhaseBusy(p.phase_number)}
                          className={`p-1 rounded bg-amber-500/20 hover:bg-amber-500/40 border border-amber-500/30 text-white cursor-pointer transition-all hover:scale-105 flex items-center justify-center ${
                            isPredInc || isPhaseBusy(p.phase_number) ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          title={isPredInc ? `Complete Phase ${p.phase_number - 1} first (continuity chain)` : `Retry Phase ${p.phase_number}`}
                        >
                          <RefreshCw className="w-3 h-3 text-amber-400" />
                        </button>
                      </>
                    ) : phaseStatus === 'processing' ? (
                      <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                        <Loader className="w-3 h-3 animate-spin" />
                        Processing
                      </span>
                    ) : sCount > 0 ? (
                      <>
                        <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded ${
                          pComplete === 100 ? 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/20' : 'bg-[#1A1A24] text-gray-400 border border-[#2A2A38]'
                        }`}>
                          {pComplete}%
                        </span>
                        {pComplete > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/projects/${id}/prompts?phase=${p.phase_number}`); }}
                            className="p-1 rounded bg-[#6C63FF]/20 hover:bg-[#6C63FF]/40 border border-[#6C63FF]/30 text-white cursor-pointer transition-all hover:scale-105 flex items-center justify-center"
                            title={`Go directly to Phase ${p.phase_number} Prompts`}
                          >
                            <ExternalLink className="w-3 h-3 text-[#A5A1FF]" />
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0">
                        Empty
                      </span>
                    )}

                    {phaseStatus !== 'processing' && (
                      <div className="flex items-center gap-1.5">
                        {sCount > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGenerateAllPromptsForPhase(p.phase_number);
                            }}
                            disabled={isPhaseBusy(p.phase_number) || isBulkGenerating}
                            className={`p-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-amber-400 hover:text-amber-300 cursor-pointer transition-all hover:scale-105 flex items-center justify-center ${
                              isPhaseBusy(p.phase_number) || isBulkGenerating ? 'opacity-40 cursor-not-allowed' : ''
                            }`}
                            title={`Generate Prompts for Phase ${p.phase_number}`}
                          >
                            <Sparkles className="w-3 h-3 text-[#A5A1FF] hover:text-[#C4C1FF]" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isPredInc) handleRegenerateScenesForPhase(p.phase_number);
                          }}
                          disabled={isPredInc || isPhaseBusy(p.phase_number) || isBulkGenerating}
                          className={`p-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white cursor-pointer transition-all hover:scale-105 flex items-center justify-center ${
                            isPredInc || isPhaseBusy(p.phase_number) || isBulkGenerating ? 'opacity-40 cursor-not-allowed' : ''
                          }`}
                          title={isPredInc ? `Complete Phase ${p.phase_number - 1} first (continuity chain)` : `Regenerate Scenes for Phase ${p.phase_number}`}
                        >
                          <RotateCcw className="w-3 h-3 text-gray-400 hover:text-white" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right column: Scene Breakdown Panel */}
        <div className="lg:col-span-3 space-y-6">
          {/* Active Phase summary */}
          {selectedPhase && (
            <Card className="bg-[#111118]/40 border-[#2A2A38]/40 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm text-white">
                    Phase {selectedPhase.phase_number}: {selectedPhase.phase_title}
                  </h4>
                  {(selectedPhase as any).status === 'done' && (
                    <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      ✓ Done
                    </span>
                  )}
                  {(selectedPhase as any).status === 'processing' && (
                    <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                      <Loader className="w-3 h-3 animate-spin" /> Processing
                    </span>
                  )}
                  {(selectedPhase as any).status === 'failed' && (
                    <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Failed
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 italic">
                  "{selectedPhase.phase_content}"
                </p>
              </div>
              
              <div className="flex gap-2 shrink-0">
                {selectedPhaseNarrationTooShort ? (
                  <Button
                    onClick={() => navigate(`/projects/${id}/script#phase-${selectedPhaseNum}`)}
                    className="flex items-center gap-1.5 cursor-pointer shrink-0 bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/20"
                  >
                    <span>⚠ Fix Narration First</span>
                  </Button>
                ) : (
                  <>
                    {(selectedPhase as any).status === 'failed' && (
                      <Button
                        onClick={() => handleRetryPhase(selectedPhaseNum)}
                        disabled={isPhaseBusy(selectedPhaseNum) || isPredecessorIncomplete(selectedPhaseNum)}
                        title={isPredecessorIncomplete(selectedPhaseNum) ? `Complete Phase ${selectedPhaseNum - 1} first (continuity chain)` : undefined}
                        className="flex items-center gap-1.5 cursor-pointer bg-amber-600 hover:bg-amber-500 text-white"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>Retry Phase</span>
                      </Button>
                    )}
                    {phaseScenes.length === 0 && (selectedPhase as any).status !== 'failed' && (
                      <Button
                        onClick={() => handleGenerateScenesForPhase(selectedPhaseNum)}
                        disabled={!hasApiKey || isPhaseBusy(selectedPhaseNum) || isPredecessorIncomplete(selectedPhaseNum)}
                        title={isPredecessorIncomplete(selectedPhaseNum) ? `Complete Phase ${selectedPhaseNum - 1} first (continuity chain)` : undefined}
                        className="flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Generate Scenes ({settings?.defaultSceneCount || 14} slots)</span>
                      </Button>
                    )}
                    {(phaseScenes.length > 0 || (selectedPhase as any).status === 'failed') && (
                      <Button
                        onClick={() => handleRegenerateScenesForPhase(selectedPhaseNum)}
                        disabled={isPhaseBusy(selectedPhaseNum) || isPredecessorIncomplete(selectedPhaseNum)}
                        title={isPredecessorIncomplete(selectedPhaseNum) ? `Complete Phase ${selectedPhaseNum - 1} first (continuity chain)` : undefined}
                        className="flex items-center gap-1.5 cursor-pointer shrink-0 bg-[#6C63FF]/20 hover:bg-[#6C63FF]/40 border border-[#6C63FF]/30 text-white"
                      >
                        <RefreshCw className="w-4 h-4 text-[#A5A1FF]" />
                        <span>Regenerate Scenes</span>
                      </Button>
                    )}
                  </>
                )}
              </div>
            </Card>
          )}

          {/* Load screen for scenes generation */}
          {isGeneratingScenes && activeAgentRun && (
            <div className="space-y-4">
              <div className="p-4 bg-[#6C63FF]/5 border border-[#6C63FF]/15 rounded-xl">
                <span className="text-xs font-bold uppercase tracking-wider text-[#6C63FF]">
                  Breaking script down into camera scenes...
                </span>
              </div>
              <StreamingText text={activeAgentRun.progressText} title={`Phase ${selectedPhaseNum} Storyboard Stream`} />
            </div>
          )}

          {/* Bulk run stream console */}
          {isBulkGeneratingPrompts && activeAgentRun && (
            <div className="space-y-4">
              <div className="p-4 bg-[#6C63FF]/5 border border-[#6C63FF]/15 rounded-xl">
                <span className="text-xs font-bold uppercase tracking-wider text-[#6C63FF]">
                  Generating all Veo Prompts for Phase {selectedPhaseNum} in background...
                </span>
              </div>
              <StreamingText text={activeAgentRun.progressText} title="Bulk Prompt Generator Console" />
            </div>
          )}

          {/* Empty scenes screen */}
          {!isGeneratingScenes && phaseScenes.length === 0 && (
            <EmptyState
              title="No Scenes Generated"
              description={`The Script Agent outlines have been locked for Phase ${selectedPhaseNum}. Execute Agent 3 to decompose this narration block into exact visual camera scenes.`}
              actionLabel={selectedPhaseNarrationTooShort ? "⚠ Fix Narration First" : "Generate Scenes breakdown"}
              disabled={selectedPhaseNarrationTooShort ? false : (isPredecessorIncomplete(selectedPhaseNum) || isPhaseBusy(selectedPhaseNum))}
              actionTitle={selectedPhaseNarrationTooShort ? undefined : ((isPredecessorIncomplete(selectedPhaseNum) || isPhaseBusy(selectedPhaseNum)) ? `Complete Phase ${selectedPhaseNum - 1} first (continuity chain)` : undefined)}
              onAction={
                selectedPhaseNarrationTooShort
                  ? () => navigate(`/projects/${id}/script#phase-${selectedPhaseNum}`)
                  : () => handleGenerateScenesForPhase(selectedPhaseNum)
              }
              icon={Clapperboard}
            />
          )}

          {activeAgentRun && activeAgentRun.agentName === 'SceneAgent_RepairContinuity' && (
            <div className="p-5 bg-[#D97706]/5 border border-[#D97706]/15 rounded-xl space-y-3 animate-fade-in mb-6">
              {activeAgentRun.progressInfo ? (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[#D97706]">
                        Repairing Continuity Chain
                      </h4>
                      <p className="text-[11px] text-gray-400 font-semibold mt-0.5">
                        Phase {activeAgentRun.progressInfo.phase} · Scene {activeAgentRun.progressInfo.scene}
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold text-white">
                      Scene {activeAgentRun.progressInfo.current} of {activeAgentRun.progressInfo.total}
                    </span>
                  </div>
                  
                  <div className="w-full bg-[#1A1A26] h-2 rounded-full overflow-hidden border border-white/5">
                    <div 
                      className="bg-[#D97706] h-full rounded-full transition-all duration-300 shadow-md shadow-[#D97706]/20" 
                      style={{ width: `${(activeAgentRun.progressInfo.current / activeAgentRun.progressInfo.total) * 100}%` }}
                    />
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between animate-pulse">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#D97706]">
                      Initializing Continuity Repair...
                    </h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Establishing stream and querying agent...
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Scenes Grid */}
          {!isGeneratingScenes && phaseScenes.length > 0 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {phaseScenes.map((s: Scene) => {
                const sData = typeof s.raw_json === 'string' ? JSON.parse(s.raw_json) : s.raw_json;
                const hasPrompt = s.veo_prompt_generated === 1;
                const isSceneRegenerating = isRunning && activeAgentRun && activeAgentRun.agentName === `SceneAgent_Scene${s.scene_number}`;
                const displayDescription = resolveBibleRefs(s.scene_description, productionBible);
                const displayNarration = resolveBibleRefs(s.narration_fragment, productionBible);

                return (
                  <Card 
                    key={s.id} 
                    className={`flex flex-col justify-between gap-4 relative overflow-hidden bg-[#111118]/70 ${
                      s.status === 'needs_review'
                        ? 'border-red-500/80 shadow-[0_0_10px_rgba(239,68,68,0.15)] ring-1 ring-red-500/50'
                        : s.status === 'failed'
                        ? 'border-amber-500/80 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
                        : 'border-[#2a2a38]/60'
                    }`}
                  >
                    {/* Visual load screen for single scene regeneration */}
                    {isSceneRegenerating && (
                      <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center p-4 z-10">
                        <Loader2 className="w-8 h-8 animate-spin text-[#6C63FF]" />
                        <span className="text-xs font-mono font-bold text-gray-400 mt-2">Updating Scene...</span>
                      </div>
                    )}

                    <div className="space-y-3">
                      {/* Header info */}
                      <div className="flex justify-between items-start gap-4 border-b border-[#2A2A38]/30 pb-2">
                        <div>
                          <span className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-wider block">
                            Scene {s.scene_number}
                          </span>
                          <h5 className="font-bold text-xs text-white">{s.title}</h5>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {s.continuity_stale === 1 && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                              style={{
                                backgroundColor: 'var(--color-background-warning)',
                                color: 'var(--color-text-warning)',
                                border: '1px solid rgba(217, 119, 6, 0.2)'
                              }}
                            >
                              Continuity stale
                            </span>
                          )}
                          <Badge variant="gray" className="flex items-center gap-1 font-mono">
                            <Clock className="w-3 h-3 text-[#6C63FF]" />
                            <span>{sData.estimated_duration_seconds || 8}s</span>
                          </Badge>
                          <Badge variant="blue" className="font-mono">
                            {productionBible?.location_roster?.find(l => l.id === sData.location_id)?.name ?? sData.location_id}
                          </Badge>
                        </div>
                      </div>

                      {/* Framer desc */}
                      <div className="space-y-1">
                        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest block">Visual Framing</span>
                        <p className="text-xs text-gray-300 leading-relaxed font-semibold">
                          {displayDescription}
                        </p>
                      </div>

                      {/* Narration voice sync */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest block">Sync Narration</span>
                          {getNarrationLabel(s.narration_fragment, activeProject?.narration_language || 'English')}
                        </div>
                        {(() => {
                          const narration = s.narration_fragment ?? '';
                          const rules = resolveLanguageRules(activeProject?.narration_language || 'English');
                          let endsCleanly = false;
                          if (!rules.terminators) {
                            endsCleanly = narration.trim().length > 0;
                          } else {
                            const escaped = rules.terminators.replace(/[\\^$\-*+?.()|[\]{}]/g, '\\$&');
                            endsCleanly = new RegExp(`(?:[${escaped}]|\\.\\.\\.)["'”’)]*$`).test(narration.trim());
                          }
                          const isBadEnding = !endsCleanly && narration !== '[No narration — visual only]' && narration !== '' && !narration.includes('[WARNING');
                          return (
                            <div>
                              <p 
                                dir={rules.direction}
                                className={`text-xs text-gray-400 leading-relaxed italic bg-black/45 p-2 rounded border ${isBadEnding ? 'border-amber-500/80 bg-amber-500/5' : 'border-[#2a2a38]/20'}`}
                                title={isBadEnding ? "Narration may be cut mid-sentence — consider regenerating phase" : undefined}
                              >
                                "{displayNarration}"
                              </p>
                              {isBadEnding && (
                                <span className="text-[9px] text-amber-500 font-medium block mt-0.5">
                                  ⚠ Narration may be cut mid-sentence — consider regenerating phase
                                </span>
                              )}
                              {s.status === 'failed' && (
                                <span 
                                  className="text-[9px] text-amber-500 font-medium flex items-center gap-1 mt-1 cursor-help" 
                                  title="Narration too short — consider regenerating this phase."
                                >
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                  <span>Narration too short — consider regenerating this phase.</span>
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Continuity Warnings for Scene */}
                      {(() => {
                        const sceneWarnings = continuityWarnings.filter(
                          (w) => w.prompt_number === s.scene_number && !w.resolved
                        );
                        if (sceneWarnings.length === 0) return null;
                        return (
                          <div className="space-y-2 mt-2">
                            {sceneWarnings.map((w: any) => (
                              <div 
                                key={w.id} 
                                className="text-[11.5px] text-red-400 font-medium flex items-start gap-2 bg-red-950/20 p-2.5 rounded border border-red-500/25 cursor-help"
                                title={w.suggestion}
                              >
                                <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-bold block text-red-300">Continuity Warning:</span> {w.issue}
                                  {w.suggestion && (
                                    <span className="block text-gray-400 mt-0.5 italic text-[11px]">Suggestion: {w.suggestion}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                            {s.status === 'needs_review' && (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={async () => {
                                  await invokeAgent(id!, `SceneAgent_Scene${s.scene_number}`, async () => {
                                    await scenesApi.regenerateScene(id!, s.id);
                                  });
                                  fetchWarnings();
                                }}
                                disabled={isRunning}
                                className="w-full flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-500 text-white font-bold py-1.5 text-xs rounded border border-red-500/30 cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Regenerate Scene</span>
                              </Button>
                            )}
                          </div>
                        );
                      })()}

                      {/* Veo Prompt text preview when ready */}
                      {hasPrompt && (
                        (() => {
                          const matchRow = veoPrompts.find((p) => p.phase_number === s.phase_number && p.scene_number === s.scene_number);
                          if (!matchRow) return null;
                          const pData = typeof matchRow.raw_json === 'string' ? JSON.parse(matchRow.raw_json) : matchRow.raw_json;
                          return (
                            <div className="space-y-1.5 mt-3 pt-3 border-t border-[#2A2A38]/30">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] font-bold text-[#6C63FF] uppercase tracking-widest block">Veo Video Generator Prompt</span>
                                  {getNarrationLabel(pData.narration)}
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const globalIndex = veoPrompts.findIndex((p) => p.id === matchRow.id) + 1;
                                    const formatted = formatVeoPrompt(pData, globalIndex);
                                    navigator.clipboard.writeText(formatted);
                                    toast.success('Prompt copied to clipboard!');
                                  }}
                                  className="flex items-center gap-1 text-[9px] text-[#6C63FF] hover:text-white hover:bg-[#6C63FF]/10 px-2 py-0.5 rounded cursor-pointer transition-all border border-[#6C63FF]/20"
                                >
                                  <Copy className="w-3 h-3" />
                                  <span>Copy Prompt</span>
                                </button>
                              </div>
                              {(() => {
                                const isPromptExpanded = expandedPrompts[s.id] || false;
                                const hasOverlays = pData.overlay_suggestions && pData.overlay_suggestions.length > 0;
                                const isOverlayExpanded = expandedOverlays[s.id] || false;
                                return (
                                  <>
                                    <p className={`text-[11px] font-mono text-gray-300 leading-normal bg-black/35 p-2.5 rounded border border-[#2a2a38]/30 select-text whitespace-pre-wrap transition-all duration-200 ${
                                      !isPromptExpanded ? 'line-clamp-3 overflow-hidden' : 'max-h-96 overflow-y-auto'
                                    }`}>
                                      {pData.veo_full_prompt}
                                    </p>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        togglePromptExpand(s.id);
                                      }}
                                      className="text-[10px] text-[#6C63FF] hover:text-[#5B54E6] hover:underline font-bold mt-1 block cursor-pointer"
                                    >
                                      {isPromptExpanded ? 'Show Less' : 'Read More'}
                                    </button>

                                    {hasOverlays && (
                                      <div className="mt-3 pt-3 border-t border-[#2A2A38]/30">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            toggleOverlayExpand(s.id);
                                          }}
                                          className="flex items-center justify-between w-full text-[9px] font-bold text-purple-400 hover:text-purple-300 uppercase tracking-widest cursor-pointer"
                                        >
                                          <span>Post-Production Overlays ({pData.overlay_suggestions.length})</span>
                                          <span className="text-[10px] font-mono">{isOverlayExpanded ? '▼' : '▶'}</span>
                                        </button>
                                        {isOverlayExpanded && (
                                          <div className="mt-2 space-y-2 bg-purple-950/20 p-2.5 rounded border border-purple-500/20 select-text max-h-60 overflow-y-auto">
                                            {pData.overlay_suggestions.map((item: any, idx: number) => (
                                              <div key={idx} className="text-[11px] text-gray-300 leading-relaxed border-b border-purple-500/10 last:border-0 pb-1.5 last:pb-0">
                                                <div className="flex items-center gap-1.5 mb-0.5">
                                                  <span className="text-[9px] font-extrabold bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded uppercase tracking-wider">{item.type}</span>
                                                  {item.target && (
                                                    <span className="text-[10px] font-semibold text-purple-400">Target: {item.target}</span>
                                                  )}
                                                  {item.timing && (
                                                    <span className="text-[10px] text-gray-500">[{item.timing}]</span>
                                                  )}
                                                </div>
                                                <p className="text-gray-200 mt-1">{item.text}</p>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          );
                        })()
                      )}
                      {(() => {
                        const snapshot = (s as any).visual_state_snapshot
                          ? (typeof (s as any).visual_state_snapshot === 'string' ? JSON.parse((s as any).visual_state_snapshot) : (s as any).visual_state_snapshot)
                          : (sData?.visual_state_snapshot || null);

                        if (!snapshot) return null;

                        const isExpanded = expandedVisualStates[s.id] || false;

                        return (
                          <div className="border-t border-[#2A2A38]/30 pt-3 mt-1 select-none">
                            <button
                              onClick={() => toggleVisualStateExpand(s.id)}
                              className="flex items-center justify-between w-full text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:text-white transition-colors cursor-pointer"
                            >
                              <span className="flex items-center gap-1.5">
                                <Eye className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                <span>Visual State Snapshot</span>
                              </span>
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                              )}
                            </button>
                            {isExpanded && (
                              <div className="mt-2 text-xs space-y-2 bg-black/35 p-2.5 rounded border border-[#2a2a38]/30">
                                <div>
                                  <span className="text-[10px] text-gray-500 block font-bold uppercase tracking-wider mb-1">Characters Present:</span>
                                  {snapshot.characters_present && snapshot.characters_present.length > 0 ? (
                                    <ul className="list-disc pl-4 space-y-1 text-gray-300 font-mono text-[11px]">
                                      {snapshot.characters_present.map((c: any, idx: number) => {
                                        const charName = c.name || (productionBible?.character_roster?.find((r: any) => r.id === c.character_id)?.name ?? c.character_id);
                                        const position = c.position || c.current_position || 'N/A';
                                        const props = c.props || c.props_held || [];
                                        const physicalCondition = c.physical_condition || 'N/A';
                                        const facingDirection = c.facing_direction || 'N/A';
                                        return (
                                          <li key={idx}>
                                            <strong className="text-[#6C63FF]">{charName}:</strong> position='{position}', props='{props.join(', ') || 'none'}', condition='{physicalCondition}', facing='{facingDirection}'
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  ) : (
                                    <span className="text-gray-400 italic text-[11px]">None</span>
                                  )}
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-[11px] border-t border-[#2A2A38]/20 pt-2">
                                  <div>
                                    <span className="text-[10px] text-gray-500 block font-bold uppercase tracking-wider">Location State:</span>
                                    <span className="text-gray-300">{snapshot.location_state || 'Same as open'}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] text-gray-500 block font-bold uppercase tracking-wider">Time of Day:</span>
                                    <span className="text-gray-300">{snapshot.time_of_day || 'N/A'}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] text-gray-500 block font-bold uppercase tracking-wider">Atmosphere:</span>
                                    <span className="text-gray-300">{snapshot.atmosphere || snapshot.weather_or_atmosphere || 'N/A'}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] text-gray-500 block font-bold uppercase tracking-wider">Key Objects Visible:</span>
                                    <span className="text-gray-300">{(snapshot.key_visible_objects || snapshot.key_objects_visible || []).join(', ') || 'None'}</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Actions and statuses */}
                    <div className="flex items-center justify-between pt-3 border-t border-[#2A2A38]/30">
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditStart(s)}
                          className="p-1 hover:text-white"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRegenSceneTarget(s)}
                          disabled={isPhaseBusy(selectedPhaseNum)}
                          className="p-1 text-rose-500 hover:text-rose-400"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                      </div>

                      <div>
                        {hasPrompt ? (
                          <div className="flex items-center gap-1.5 text-xs text-green-400 font-bold font-mono">
                            <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                            <span>✓ Prompt Ready</span>
                          </div>
                        ) : (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleGeneratePromptForScene(s)}
                            disabled={!hasApiKey || isPhaseBusy(selectedPhaseNum)}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs cursor-pointer"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Build Prompt</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Next phase / Go to prompts bottom control bar */}
            {getPhaseCompletionPercent(selectedPhaseNum) > 0 && (
              <div className="flex justify-end p-4 border border-[#2A2A38] bg-[#111118]/50 rounded-xl">
                <Button
                  onClick={() => navigate(`/projects/${id}/prompts?phase=${selectedPhaseNum}`)}
                  className="flex items-center gap-1.5 cursor-pointer bg-[#6C63FF] hover:bg-[#6C63FF]/90 text-white font-bold"
                >
                  <span>Next: Copy Prompts for Phase {selectedPhaseNum}</span>
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </div>
            )}
            </div>
          )}
        </div>
      </div>

      {/* EDIT SCENE DETAILS MODAL */}
      <Modal isOpen={editingScene !== null} onClose={() => setEditingScene(null)} title={`Edit Scene ${editingScene?.scene_number} Specifications`} size="lg">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">Scene Title</label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full px-4 py-2 bg-black border border-[#2A2A38] rounded-lg text-sm text-white focus:outline-none focus:border-[#6C63FF]"
            />
          </div>
          
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">Visual Action Description</label>
            <textarea
              rows={3}
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              className="w-full px-4 py-2 bg-black border border-[#2A2A38] rounded-lg text-sm text-white focus:outline-none focus:border-[#6C63FF]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">Narration Sync Fragment</label>
            <textarea
              rows={2}
              value={editNarration}
              onChange={(e) => setEditNarration(e.target.value)}
              className="w-full px-4 py-2 bg-black border border-[#2A2A38] rounded-lg text-sm text-white focus:outline-none focus:border-[#6C63FF] font-sans"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">Continuity & Style Notes</label>
            <textarea
              rows={2}
              value={editContinuity}
              onChange={(e) => setEditContinuity(e.target.value)}
              className="w-full px-4 py-2 bg-black border border-[#2A2A38] rounded-lg text-sm text-white focus:outline-none focus:border-[#6C63FF] font-sans"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setEditingScene(null)}>
              Cancel
            </Button>
            <Button onClick={handleEditSave}>
              Save Specifications
            </Button>
          </div>
        </div>
      </Modal>

      {/* REGENERATE WARNING DIALOG */}
      <ConfirmDialog
        isOpen={regenSceneTarget !== null}
        onClose={() => setRegenSceneTarget(null)}
        onConfirm={handleRegenerateScene}
        title="Regenerate Storyboard Scene"
        message="Are you sure you want to regenerate this scene? This will query the agent to rewrite the storyboard details, which will invalidate and delete any existing Veo Prompt for this scene."
        confirmLabel="Regenerate Scene"
        variant="danger"
      />
    </div>
  );
};

export default SceneWorkspace;
