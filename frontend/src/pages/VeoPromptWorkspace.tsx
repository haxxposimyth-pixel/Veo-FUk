import React, { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useProject } from '../hooks/useProject';
import { useAgent } from '../hooks/useAgent';
import { useUiStore } from '../store/ui.store';
import { useClipboard } from '../hooks/useClipboard';
import { veoPromptsApi } from '../api/veoprompts.api';
import PageHeader from '../components/layout/PageHeader';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import {
  Camera,
  Copy,
  Edit,
  RotateCcw,
  Volume2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  ChevronLeft,
  Clock,
  RefreshCw,
  CheckCircle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { continuityApi } from '../api/continuity.api';
import { projectsApi } from '../api/projects.api';
import { type Scene, type VeoPrompt, type Phase, type ContinuityWarning, narrationFitsDuration, getWordCount } from 'shared';
import { useProjectStore } from '../store/project.store';
import { resolveBibleRefs } from '../utils/resolveBibleRefs';

export const SHOT_TYPE_COLORS: Record<string, { bg: string; text: string; border: string; dot: string; label: string }> = {
  establishing: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', dot: '#3b82f6', label: 'Establishing' },
  wide: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20', dot: '#06b6d4', label: 'Wide' },
  medium: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', dot: '#10b981', label: 'Medium' },
  close_up: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20', dot: '#f43f5e', label: 'Close Up' },
  extreme_close_up: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', dot: '#ef4444', label: 'Extreme Close Up' },
  aerial: { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/20', dot: '#0ea5e9', label: 'Aerial' },
  pov: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20', dot: '#6366f1', label: 'POV' },
  over_shoulder: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20', dot: '#a855f7', label: 'Over Shoulder' },
  insert: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', dot: '#f59e0b', label: 'Insert' }
};

const AutoResizingTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className, ...props }) => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  
  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  React.useEffect(() => {
    adjustHeight();
  }, [props.value]);

  return (
    <textarea
      ref={textareaRef}
      onInput={adjustHeight}
      className={className}
      {...props}
    />
  );
};

const getNarrationLabel = (narrationText: string, duration: number = 8) => {
  if (!narrationText) return null;
  const cleanText = narrationText.replace(/\[WARNING:.*\]/g, '').trim();
  if (cleanText === '[No narration — visual only]' || cleanText === '') {
    return (
      <span className="text-[10px] text-gray-400 font-mono font-bold ml-2 bg-white/5 px-1.5 py-0.5 rounded border border-white/10 shrink-0">
        🔇 Visual only
      </span>
    );
  }
  const words = cleanText.split(/\s+/).filter(Boolean);
  const count = words.length;
  const isValid = narrationFitsDuration(count, duration);

  if (isValid) {
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

export const formatVeoPrompt = (pData: any, globalIndex: number): string => {
  const narrationClean = (pData.narration || '').replace(/\[WARNING:.*\]/g, '').trim();
  return `Prompt ${globalIndex} :\n` +
         `Visual: ${pData.visual || ''}\n` +
         `Lens: ${pData.lens || ''}\n` +
         `Lighting: ${pData.lighting || ''}\n` +
         `Camera: ${pData.camera || ''}\n` +
         `Sound:\n` +
         `  Ambient: ${pData.ambient_sound || ''}\n` +
         `  SFX: ${pData.sfx || ''}\n` +
         `  Dialogue: ${pData.dialogue || 'None'}\n` +
         `Avoid: ${pData.avoid || ''}\n` +
         `Connection: ${pData.connection || ''}\n` +
         `Narration: ${narrationClean}`;
};

export const VeoPromptWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const { phases, scenes, veoPrompts, fetchProjectDetails } = useProject();
  const productionBible = useProjectStore((s) => s.productionBible);
  const isContinuityScanRunning = useProjectStore((s) => s.isContinuityScanRunning);
  const continuityScanProgress = useProjectStore((s) => s.continuityScanProgress);
  const startContinuityScan = useProjectStore((s) => s.startContinuityScan);
  const cancelContinuityScan = useProjectStore((s) => s.cancelContinuityScan);

  const { invokeAgent } = useAgent();
  const activeAgentRun = useUiStore((s) => s.activeAgentRun);
  const { copy } = useClipboard();

  const allPhasesDone = phases.length > 0 && phases.every(p => p.status === 'done') && veoPrompts.length === scenes.length && scenes.length > 0;

  const [integrityReport, setIntegrityReport] = useState<any | null>(null);
  const [isIntegrityLoading, setIsIntegrityLoading] = useState(false);

  const fetchIntegrity = React.useCallback(() => {
    if (!id) return;
    setIsIntegrityLoading(true);
    projectsApi.getIntegrity(id)
      .then((res) => {
        setIntegrityReport(res);
      })
      .catch((err) => {
        console.error('Failed to fetch integrity report', err);
      })
      .finally(() => {
        setIsIntegrityLoading(false);
      });
  }, [id]);

  useEffect(() => {
    return () => {
      cancelContinuityScan();
    };
  }, [cancelContinuityScan]);

  const handleFullContinuityScan = async () => {
    if (!id) return;
    await startContinuityScan(id);
  };

  // Filters
  const [filterPhase, setFilterPhase] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  // Sync initial phase selection from route query parameters or navigation state
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const pVal = params.get('phase') || location.state?.phase?.toString();
    if (pVal) {
      setFilterPhase(pVal);
    }
  }, [location.search, location.state]);

  // Expandable card IDs tracking
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  // Inline edit state
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ [field: string]: string }>({});
  const [validationWarnings, setValidationWarnings] = useState<{ [field: string]: string }>({});
  const [nudgeBannerPromptId, setNudgeBannerPromptId] = useState<string | null>(null);


  const [editFields, setEditFields] = useState<any>({
    prompt_number: '',
    visual: '',
    shot: 'MS',
    shot_type: 'medium',
    lens: '',
    lighting: '',
    camera: '',
    ambient_sound: '',
    sfx: '',
    avoid: '',
    connection: '',
    narration: '',
    duration_seconds: 8,
    veo_full_prompt: '',
  });

  // Regenerate target
  const [regenTarget, setRegenTarget] = useState<any | null>(null);

  useEffect(() => {
    if (id) {
      fetchProjectDetails(id);
      continuityApi.getWarnings(id).then(setContinuityWarnings).catch(() => {});
      fetchIntegrity();
    }
  }, [id, fetchProjectDetails, fetchIntegrity]);

  useEffect(() => {
    if (id) {
      fetchIntegrity();
    }
  }, [id, veoPrompts, scenes, fetchIntegrity]);

  useEffect(() => {
    if (!isContinuityScanRunning && id) {
      fetchIntegrity();
      continuityApi.getWarnings(id).then(setContinuityWarnings).catch(() => {});
    }
  }, [isContinuityScanRunning, id, fetchIntegrity]);

  const [continuityWarnings, setContinuityWarnings] = useState<ContinuityWarning[]>([]);
  const [fixingWarningId, setFixingWarningId] = useState<string | null>(null);

  const handleResolveWarning = async (warningId: string, resolved: boolean) => {
    if (!id) return;
    try {
      await continuityApi.resolveWarning(id, warningId, resolved);
      setContinuityWarnings((prev) =>
        prev.map((w) => (w.id === warningId ? { ...w, resolved } : w))
      );
    } catch (err) {
      toast.error('Failed to resolve warning');
    }
  };

  const handleFixWarningWithAI = async (warningId: string) => {
    if (!id) return;
    setFixingWarningId(warningId);
    const loadingToast = toast.loading('AI is fixing continuity warning...');
    try {
      const res = await continuityApi.fixWarning(id, warningId);
      if (res.success) {
        toast.dismiss(loadingToast);
        toast.success('Continuity warning fixed successfully!');
        // Reload project details to get the updated prompt
        await fetchProjectDetails(id);
        // Reload warnings list
        const warnings = await continuityApi.getWarnings(id);
        setContinuityWarnings(warnings);
        // Refresh integrity report
        fetchIntegrity();
      } else {
        throw new Error((res as any).error || res.message || 'Failed to fix warning');
      }
    } catch (err: any) {
      toast.dismiss(loadingToast);
      toast.error(err.message || 'Failed to auto-fix warning');
    } finally {
      setFixingWarningId(null);
    }
  };

  const handleStartEdit = async (promptRow: any) => {
    // If another card is already in edit mode, save it first
    if (editingCardId && editingCardId !== promptRow.id) {
      await handleSaveAndValidate(editingCardId, true);
    }

    const pData = typeof promptRow.raw_json === 'string'
      ? JSON.parse(promptRow.raw_json)
      : promptRow.raw_json;

    setEditingCardId(promptRow.id);
    setExpandedCardId(promptRow.scene_id);
    setValidationErrors({});
    setValidationWarnings({});
    setEditFields({
      prompt_number: pData.prompt_number,
      visual: pData.visual,
      shot: pData.shot,
      shot_type: pData.shot_type || 'medium',
      lens: pData.lens,
      lighting: pData.lighting,
      camera: pData.camera,
      ambient_sound: pData.ambient_sound,
      sfx: pData.sfx,
      avoid: pData.avoid,
      connection: pData.connection,
      narration: pData.narration,
      duration_seconds: pData.duration_seconds || 8,
      scene_type: pData.scene_type || 'standard',
      veo_full_prompt: pData.veo_full_prompt,
    });
  };

  const handleSaveAndValidate = async (promptId: string, silent: boolean = false) => {
    const errors: { [key: string]: string } = {};
    const warnings: { [key: string]: string } = {};

    let visualVal = editFields.visual || '';

    // 1. visual length check
    if (visualVal.length < 200) {
      errors.visual = "Visual field too short — minimum 200 characters.";
    } else if (visualVal.length > 500) {
      visualVal = visualVal.substring(0, 497) + '...';
      warnings.visual = "Visual field auto-truncated to 497 characters.";
      setEditFields((prev: any) => ({ ...prev, visual: visualVal }));
    }

    // 2. Arabic numerals check
    if (/\d/.test(visualVal)) {
      errors.visual = "Visual field contains numerals — use word form (e.g. 'three' not '3').";
    }

    // 3. Avoid check
    if (!editFields.avoid || editFields.avoid.trim().length === 0) {
      errors.avoid = "Avoid field must contain at least one exclusion cue.";
    }

    setValidationErrors(errors);
    setValidationWarnings(warnings);

    if (Object.keys(errors).length > 0) {
      if (!silent) {
        toast.error("Please fix the validation errors before saving.");
      }
      return false;
    }

    try {
      const result = await veoPromptsApi.updateManualPrompt(id!, promptId, {
        visual: visualVal,
        shot: editFields.shot,
        shot_type: editFields.shot_type,
        lens: editFields.lens,
        lighting: editFields.lighting,
        camera: editFields.camera,
        ambient_sound: editFields.ambient_sound,
        sfx: editFields.sfx,
        avoid: editFields.avoid,
        connection: editFields.connection,
        duration_seconds: editFields.duration_seconds,
        scene_type: editFields.scene_type,
      });

      await fetchProjectDetails(id!);

      setEditingCardId(null);
      setValidationErrors({});
      setValidationWarnings({});

      if (result.violations && result.violations.length > 0) {
        toast.error(`Saved but detected ${result.violations.length} appearance/style violation(s). Review below!`);
      } else if (!silent) {
        toast.success("Veo Prompt updated successfully!");
      }

      // Check if Agent 5 warnings exist for this prompt's phase
      const phaseNum = result.prompt.phase_number;
      const phaseRow = phases.find(p => p.phase_number === phaseNum);
      const hasWarningsForPhase = continuityWarnings.some(w => w.phase_id === phaseRow?.id);
      if (hasWarningsForPhase) {
        setNudgeBannerPromptId(promptId);
      }

      return true;
    } catch (err: any) {
      if (!silent) {
        toast.error(err.message || "Failed to save edit.");
      }
      return false;
    }
  };

  const toggleExpand = (cardId: string) => {
    setExpandedCardId(expandedCardId === cardId ? null : cardId);
  };

  const handleApplySuggestion = async (promptRow: any, violation: any) => {
    if (!id) return;
    const pData = typeof promptRow.raw_json === 'string' ? JSON.parse(promptRow.raw_json) : promptRow.raw_json;
    const updatedFields = {
      visual: pData.visual,
      shot: pData.shot,
      shot_type: pData.shot_type || 'medium',
      lens: pData.lens,
      lighting: pData.lighting,
      camera: pData.camera,
      ambient_sound: pData.ambient_sound,
      sfx: pData.sfx,
      avoid: pData.avoid,
      connection: pData.connection,
      duration_seconds: pData.duration_seconds || 8,
      scene_type: pData.scene_type || 'standard',
      [violation.field]: violation.suggestion
    };

    try {
      await veoPromptsApi.updateManualPrompt(id, promptRow.id, updatedFields);
      toast.success(`Applied suggestion for ${violation.field} field!`);
      await fetchProjectDetails(id);
    } catch (err: any) {
      toast.error(err.message || 'Failed to apply suggestion');
    }
  };

  const handleKeepMyEdit = async (promptRow: any, violation: any) => {
    if (!id) return;
    const pData = typeof promptRow.raw_json === 'string' ? JSON.parse(promptRow.raw_json) : promptRow.raw_json;
    const existingViolations = pData.violations || [];
    const updatedViolations = existingViolations.map((v: any) => {
      if (v.field === violation.field && v.rule === violation.rule) {
        return { ...v, dismissed: true };
      }
      return v;
    });

    const updatedFields = {
      visual: pData.visual,
      shot: pData.shot,
      shot_type: pData.shot_type || 'medium',
      lens: pData.lens,
      lighting: pData.lighting,
      camera: pData.camera,
      ambient_sound: pData.ambient_sound,
      sfx: pData.sfx,
      avoid: pData.avoid,
      connection: pData.connection,
      duration_seconds: pData.duration_seconds || 8,
      scene_type: pData.scene_type || 'standard',
      violations: updatedViolations
    };

    try {
      await veoPromptsApi.updateManualPrompt(id, promptRow.id, updatedFields);
      toast.success('Edit kept and warning dismissed.');
      await fetchProjectDetails(id);
    } catch (err: any) {
      toast.error(err.message || 'Failed to dismiss warning');
    }
  };



  const handleRegeneratePrompt = async () => {
    if (!id || !regenTarget) return;
    const pNum = regenTarget.prompt_number;
    setRegenTarget(null);

    await invokeAgent(id, `VeoAgent_Regen_${pNum}`, async () => {
      await veoPromptsApi.regeneratePrompt(id, regenTarget.id);
    });
  };

  const handleCopyPrompt = async (e: React.MouseEvent, pData: any) => {
    e.stopPropagation();
    const cleanFull = (pData.veo_full_prompt || '')
      .replace(/\[WARNING:.*\]/g, '')
      .trim();
    await copy(cleanFull);
    if (integrityReport && integrityReport.verdict === 'issues') {
      toast.error('This project has unresolved integrity issues.', { id: 'integrity-warn' });
    } else {
      toast.success('Prompt copied to clipboard!');
    }
  };

  // Compile list of scene items joined with prompt info
  const scenePromptList = scenes.flatMap((s: Scene): { scene: Scene; promptRow: VeoPrompt | null }[] => {
    const matches = veoPrompts.filter((p: VeoPrompt) => p.phase_number === s.phase_number && p.scene_number === s.scene_number);
    matches.sort((a, b) => Number(a.prompt_number) - Number(b.prompt_number));
    if (matches.length === 0) {
      return [{
        scene: s,
        promptRow: null,
      }];
    }
    return matches.map((match) => {
      return {
        scene: s,
        promptRow: match
      };
    });
  });

  // Filter list
  const filteredList = scenePromptList.filter((item: { scene: Scene; promptRow: VeoPrompt | null }) => {
    // 1. Phase filter
    if (filterPhase !== 'all' && item.scene.phase_number !== parseInt(filterPhase)) {
      return false;
    }
    // 2. Status filter
    if (filterStatus === 'ready' && !item.promptRow) return false;
    if (filterStatus === 'missing' && item.promptRow) return false;
    if (filterStatus === 'outdated') {
      const pData = item.promptRow ? (typeof item.promptRow.raw_json === 'string' ? JSON.parse(item.promptRow.raw_json) : item.promptRow.raw_json) : null;
      const isOutdated = pData && (pData.bible_version ?? 1) < (productionBible?.version ?? 1);
      if (!isOutdated) return false;
    }
    if (filterStatus === 'failed') {
      const isFailedOrIncomplete = !item.promptRow || (() => {
        const pData = typeof item.promptRow.raw_json === 'string' ? JSON.parse(item.promptRow.raw_json) : item.promptRow.raw_json;
        if (pData.status === 'failed' || pData.status === 'stale' || (item.promptRow as any).visual_truncated === 1 || pData.visual_truncated === 1) return true;
        
        const requiredFields = ['visual', 'shot', 'shot_type', 'lens', 'lighting', 'camera', 'ambient_sound', 'avoid', 'connection', 'narration', 'duration_seconds'];
        const hasEmptyRequired = requiredFields.some((field) => {
          const val = pData[field];
          return val === undefined || val === null || (typeof val === 'string' && val.trim() === '');
        });
        if (hasEmptyRequired) return true;

        const narrationText = (pData.narration || '').replace(/\[WARNING:.*\]/g, '').trim();
        const words = narrationText.split(/\s+/).filter(Boolean).length;
        const duration = pData.duration_seconds || 8;
        if (pData.narration && pData.narration !== '[No narration — visual only]' && !narrationFitsDuration(words, duration)) return true;

        const appViolation = (item.promptRow as any).appearance_violation === 1 || pData.appearance_violation === 1;
        const appCorrected = (item.promptRow as any).appearance_corrected === 1 || pData.appearance_corrected === 1;
        if (appViolation && !appCorrected) return true;

        return false;
      })();
      if (!isFailedOrIncomplete) return false;
    }
    if (filterStatus === 'warnings') {
      const hasWarnings = item.promptRow && continuityWarnings.some(w => {
        const pData = typeof item.promptRow!.raw_json === 'string' ? JSON.parse(item.promptRow!.raw_json) : item.promptRow!.raw_json;
        return w.prompt_number === pData.prompt_number && !w.resolved;
      });
      if (!hasWarnings) return false;
    }

    // 3. Search query
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchText = (item.scene.title + ' ' + item.scene.scene_description).toLowerCase();
      const matchPrompt = item.promptRow
        ? (typeof item.promptRow.raw_json === 'string' ? JSON.parse(item.promptRow.raw_json) : item.promptRow.raw_json).veo_full_prompt.toLowerCase()
        : '';
      if (!matchText.includes(q) && !matchPrompt.includes(q)) return false;
    }

    return true;
  });

  const handleCopyAllPrompts = async () => {
    const activePrompts = filteredList
      .filter((item) => item.promptRow !== null)
      .map((item) => {
        const pRow = item.promptRow!;
        const pData = typeof pRow.raw_json === 'string' ? JSON.parse(pRow.raw_json) : pRow.raw_json;
        return (pData.veo_full_prompt || '').replace(/\[WARNING:.*\]/g, '').trim();
      });

    if (activePrompts.length === 0) {
      toast.error('No generated prompts found in this view to copy.');
      return;
    }

    const compiledText = activePrompts.join('\n\n');
    await copy(compiledText);
    if (integrityReport && integrityReport.verdict === 'issues') {
      toast.error('This project has unresolved integrity issues.', { id: 'integrity-warn' });
    } else {
      toast.success(`Copied ${activePrompts.length} prompts to clipboard!`);
    }
  };

  const handleBackToScenes = () => {
    navigate(`/projects/${id}/scenes`);
  };

  return (
    <div className="space-y-8 select-none">
      <style>{`
        :root {
          --shot-establishing: #3b82f6;
          --shot-wide: #06b6d4;
          --shot-medium: #10b981;
          --shot-close_up: #f43f5e;
          --shot-extreme_close_up: #ef4444;
          --shot-aerial: #0ea5e9;
          --shot-pov: #6366f1;
          --shot-over_shoulder: #a855f7;
          --shot-insert: #f59e0b;
        }
      `}</style>
      <PageHeader
        title="Veo Technical Prompts"
        description="Review optimized prompts for Google Veo. Includes focal lens calibrations, technical lighting setups, noise profiles, and negative exclude tags."
        actions={
          <div className="flex items-center gap-3">
            <Button
              onClick={handleFullContinuityScan}
              disabled={!allPhasesDone || isContinuityScanRunning}
              className={`flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 font-bold ${
                isContinuityScanRunning 
                  ? 'bg-[#D97706]/40 text-[#FEF3C7] border border-[#D97706]/50 shadow-md animate-pulse cursor-not-allowed' 
                  : !allPhasesDone
                    ? 'opacity-40 cursor-not-allowed'
                    : 'bg-[#D97706] hover:bg-[#B45309] text-white border border-[#D97706]/30 shadow-lg shadow-[#D97706]/20'
              }`}
            >
              <span>
                {isContinuityScanRunning 
                  ? `Scanning phase ${continuityScanProgress?.phase || 1} of ${continuityScanProgress?.total_phases || 10}...` 
                  : 'Full Continuity Scan'}
              </span>
            </Button>
            <Button
              variant="secondary"
              onClick={handleBackToScenes}
              className="flex items-center gap-1.5 cursor-pointer text-gray-300 hover:text-white border border-[#2A2A38] hover:bg-[#1E1E2A]"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Scenes</span>
            </Button>
            <Button
              onClick={handleCopyAllPrompts}
              className="flex items-center gap-1.5 cursor-pointer bg-[#6C63FF] hover:bg-[#7D75FF] text-white font-bold shadow-lg shadow-[#6C63FF]/20 border border-[#6C63FF]/30 transition-all active:scale-95"
            >
              <Copy className="w-4 h-4" />
              <span>Copy All Prompts ({filteredList.filter(item => item.promptRow !== null).length})</span>
            </Button>
          </div>
        }
      />

      {integrityReport && (
        <Card className={`border-l-4 p-5 ${
          integrityReport.verdict === 'ready' 
            ? 'border-l-emerald-500 bg-emerald-500/5 border-emerald-500/20' 
            : 'border-l-rose-500 bg-rose-500/5 border-rose-500/20'
        } shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4`}>
          <div className="flex items-start gap-4">
            {integrityReport.verdict === 'ready' ? (
              <CheckCircle className="w-6 h-6 text-emerald-400 mt-1 shrink-0" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-rose-400 mt-1 shrink-0" />
            )}
            <div className="space-y-1.5 select-text">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span>Export Readiness: {integrityReport.verdict === 'ready' ? 'Ready' : 'Issues Found'}</span>
              </h4>
              <p className="text-xs text-gray-400 font-semibold leading-relaxed">
                {integrityReport.verdict === 'ready' 
                  ? 'Ready — all prompts complete & consistent' 
                  : 'This project has unresolved integrity issues that should be reviewed before exporting.'}
              </p>
              {integrityReport.verdict === 'issues' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-1.5 gap-x-6 pt-2 text-xs">
                  {integrityReport.counts.phases > 0 && (
                    <div className="text-gray-300">
                      <span className="text-rose-400 font-mono">■</span> {integrityReport.counts.phases} incomplete/invalid phase(s)
                      <button 
                        onClick={() => navigate(`/projects/${id}/scenes`)}
                        className="text-[#6C63FF] hover:text-[#7D75FF] hover:underline font-bold ml-1.5 cursor-pointer"
                      >
                        Review Script/Scenes
                      </button>
                    </div>
                  )}
                  {integrityReport.counts.scenes > 0 && (
                    <div className="text-gray-300">
                      <span className="text-rose-400 font-mono">■</span> {integrityReport.counts.scenes} stale/failed scene(s)
                      <button 
                        onClick={() => navigate(`/projects/${id}/scenes`)}
                        className="text-[#6C63FF] hover:text-[#7D75FF] hover:underline font-bold ml-1.5 cursor-pointer"
                      >
                        Repair Continuity
                      </button>
                    </div>
                  )}
                  {(() => {
                    const outdatedCount = integrityReport.prompts.filter((p: any) => p.issues.includes('bible_outdated')).length;
                    if (outdatedCount > 0) {
                      return (
                        <div className="text-gray-300">
                          <span className="text-amber-400 font-mono">■</span> {outdatedCount} outdated prompt(s)
                          <button 
                            onClick={() => setFilterStatus('outdated')}
                            className="text-[#6C63FF] hover:text-[#7D75FF] hover:underline font-bold ml-1.5 cursor-pointer"
                          >
                            Review outdated
                          </button>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  {(() => {
                    const failedCount = integrityReport.prompts.filter((p: any) => p.issues.some((issue: string) => issue !== 'bible_outdated')).length;
                    const missingCount = scenes.length === 0 ? 0 : scenes.filter(s => !veoPrompts.some(p => p.phase_number === s.phase_number && p.scene_number === s.scene_number)).length;
                    const totalFailedIncomplete = failedCount + missingCount;
                    if (totalFailedIncomplete > 0) {
                      return (
                        <div className="text-gray-300">
                          <span className="text-rose-400 font-mono">■</span> {totalFailedIncomplete} failed/incomplete prompt(s)
                          <button 
                            onClick={() => setFilterStatus('failed')}
                            className="text-[#6C63FF] hover:text-[#7D75FF] hover:underline font-bold ml-1.5 cursor-pointer"
                          >
                            Review failed
                          </button>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  {integrityReport.continuity.unresolved_count > 0 && (
                    <div className="text-gray-300">
                      <span className="text-amber-400 font-mono">■</span> {integrityReport.continuity.unresolved_count} unresolved warning(s)
                      <button 
                        onClick={() => setFilterStatus('warnings')}
                        className="text-[#6C63FF] hover:text-[#7D75FF] hover:underline font-bold ml-1.5 cursor-pointer"
                      >
                        Review warnings
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchIntegrity}
              disabled={isIntegrityLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-300 hover:text-white border border-[#2A2A38] hover:bg-[#1E1E2A] cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isIntegrityLoading ? 'animate-spin text-[#6C63FF]' : ''}`} />
              <span>Refresh Check</span>
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Filter Sidebar */}
        <div className="space-y-2 shrink-0">
          <div className="sticky top-6 border border-[#2A2A38] rounded-xl p-4 bg-[#111118]/50 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-[#2A2A38]/30">
              <SlidersHorizontal className="w-4 h-4 text-[#6C63FF]" />
              <span className="text-xs font-bold uppercase tracking-wider text-gray-300">
                Filters & Search
              </span>
            </div>

            {/* Search Input */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Search Term</label>
              <input
                type="text"
                placeholder="Search prompt keywords..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 bg-[#0A0A0F] border border-[#2A2A38] rounded-lg text-xs text-white focus:outline-none focus:border-[#6C63FF]"
              />
            </div>

            {/* Phase Selector */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Script Phase</label>
              <select
                value={filterPhase}
                onChange={(e) => setFilterPhase(e.target.value)}
                className="w-full px-3 py-2 bg-[#0A0A0F] border border-[#2A2A38] rounded-lg text-xs text-white focus:outline-none focus:border-[#6C63FF]"
              >
                <option value="all">All Phases (1-10)</option>
                {phases.map((p: Phase) => (
                  <option key={p.phase_number} value={p.phase_number}>
                    Phase {p.phase_number}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Selector */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Prompt Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 bg-[#0A0A0F] border border-[#2A2A38] rounded-lg text-xs text-white focus:outline-none focus:border-[#6C63FF]"
              >
                <option value="all">All Scenes</option>
                <option value="ready">✓ Ready Prompts</option>
                <option value="missing">✗ Missing Prompts</option>
                <option value="outdated">⚠ Outdated Prompts</option>
                <option value="failed">✗ Failed / Incomplete</option>
                <option value="warnings">⚠ Continuity Warnings</option>
              </select>
            </div>
          </div>
        </div>

        {/* Right prompt list */}
        <div className="lg:col-span-3 space-y-4">
          {/* RENDER RUNNING PROGRESS BAR */}
          {activeAgentRun && activeAgentRun.agentName.includes('VeoAgent') && (
            <div className="p-5 bg-[#6C63FF]/5 border border-[#6C63FF]/15 rounded-xl space-y-3 animate-fade-in">
              {activeAgentRun.progressInfo ? (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[#6C63FF]">
                        Generating Veo Prompts
                      </h4>
                      <p className="text-[11px] text-gray-400 font-semibold mt-0.5">
                        Phase {activeAgentRun.progressInfo.phase} · Scene {activeAgentRun.progressInfo.scene}
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold text-white">
                      Prompt {activeAgentRun.progressInfo.current} of {activeAgentRun.progressInfo.total}
                    </span>
                  </div>
                  
                  {/* Progress bar container */}
                  <div className="w-full bg-[#1A1A26] h-2 rounded-full overflow-hidden border border-white/5">
                    <div 
                      className="bg-[#6C63FF] h-full rounded-full transition-all duration-300 shadow-md shadow-[#6C63FF]/20" 
                      style={{ width: `${(activeAgentRun.progressInfo.current / activeAgentRun.progressInfo.total) * 100}%` }}
                    />
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between animate-pulse">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#6C63FF]">
                      Initializing Prompt Generation...
                    </h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Establishing stream and querying agent...
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {filteredList.length === 0 ? (
            <div className="p-12 text-center border border-dashed rounded-xl border-border-dark bg-black/5">
              <p className="text-sm text-gray-400">No scenes matching filter conditions were found.</p>
            </div>
          ) : (
            (() => {
              const clipCountMap = new Map<string, number>();
              veoPrompts.forEach((p: VeoPrompt) => {
                const key = `${p.phase_number}-${p.scene_number}`;
                clipCountMap.set(key, (clipCountMap.get(key) || 0) + 1);
              });

              const groupedByPhase: Record<number, { scene: Scene; promptRow: VeoPrompt | null }[]> = {};
              filteredList.forEach(item => {
                const phaseNum = item.scene.phase_number;
                if (!groupedByPhase[phaseNum]) {
                  groupedByPhase[phaseNum] = [];
                }
                groupedByPhase[phaseNum].push(item);
              });
              const sortedPhases = Object.keys(groupedByPhase).map(Number).sort((a, b) => a - b);
              return sortedPhases.map(phaseNum => {
                const phaseItems = groupedByPhase[phaseNum];
                const phaseDetail = phases.find(p => p.phase_number === phaseNum);
                return (
                  <div key={phaseNum} className="space-y-4">
                    <div className="flex items-center justify-between border-b border-[#2A2A38]/30 pb-2 pt-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold font-mono text-gray-500">PHASE {phaseNum}</span>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                          {phaseDetail?.phase_title || 'Untitled Phase'}
                        </h3>
                      </div>
                      <div className="flex items-center gap-1.5 bg-black/30 border border-[#2A2A38]/30 px-3 py-1.5 rounded-lg">
                        <span className="text-[10px] font-bold font-mono text-gray-500 uppercase tracking-wider mr-1.5">Shot Diversity:</span>
                        <div className="flex items-center gap-1">
                          {phaseItems.map((pi, idx) => {
                            const pRow = pi.promptRow;
                            if (!pRow) {
                              return (
                                <div 
                                  key={`missing-${idx}`} 
                                  className="w-2 h-2 rounded-full bg-gray-805 border border-white/5" 
                                  title={`Scene ${pi.scene.scene_number}: Missing Prompt`}
                                />
                              );
                            }
                            const pData = typeof pRow.raw_json === 'string' ? JSON.parse(pRow.raw_json) : pRow.raw_json;
                            const st = pData.shot_type || 'medium';
                            const c = SHOT_TYPE_COLORS[st] || SHOT_TYPE_COLORS.medium;
                            return (
                              <div 
                                key={pRow.id} 
                                className="w-2 h-2 rounded-full border border-white/10 shrink-0 cursor-help"
                                style={{ backgroundColor: c.dot }}
                                title={`Scene ${pi.scene.scene_number}: ${c.label}`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      {phaseItems.map((item: { scene: Scene; promptRow: VeoPrompt | null }, itemIdx: number) => {
                        const { scene, promptRow } = item;
                        const isExpanded = expandedCardId === scene.id;
              
              if (!promptRow) {
                return (
                  <Card key={scene.id} className="border-amber-500/25 bg-amber-500/5 px-5 py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                      <div>
                        <span className="text-[10px] font-mono font-bold text-gray-500 uppercase block">
                          Phase {scene.phase_number} · Scene {scene.scene_number}
                        </span>
                        <h4 className="font-bold text-xs text-white">{scene.title}</h4>
                      </div>
                    </div>
                    <Badge variant="amber">Prompt Missing</Badge>
                  </Card>
                );
              }

              const pData = typeof promptRow.raw_json === 'string' ? JSON.parse(promptRow.raw_json) : promptRow.raw_json;
              const displayVisual = resolveBibleRefs(pData.visual, productionBible);
              const isRegenerating = activeAgentRun && activeAgentRun.agentName === `VeoAgent_Regen_${pData.prompt_number}`;

              const isFirstInList = itemIdx === 0;
              const showHeader = promptRow && (
                isFirstInList ||
                (Number(promptRow.prompt_number) === 1 && phaseItems[itemIdx - 1].scene.scene_number !== scene.scene_number)
              );
              
              const key = `${scene.phase_number}-${scene.scene_number}`;
              const count = clipCountMap.get(key) || 0;
              const headerText = count > 1 
                ? `Scene ${scene.scene_number} · ${count} clips`
                : `Scene ${scene.scene_number}`;

              return (
                <React.Fragment key={promptRow.id}>
                  {showHeader && (
                    <div 
                      style={{
                        color: 'var(--color-text-secondary)',
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        marginBottom: '6px'
                      }}
                    >
                      {headerText}
                    </div>
                  )}
                  <Card className="space-y-4 border-[#2A2A38]/80 bg-[#111118]/70 relative">
                    {/* Visual loading mask */}
                    {isRegenerating && (
                      <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center p-4 z-10 rounded-xl">
                        <Loader2 className="w-8 h-8 animate-spin text-[#6C63FF]" />
                        <span className="text-xs font-mono font-bold text-gray-400 mt-2">Regenerating Prompt...</span>
                      </div>
                    )}

                    {/* Header/Collapsed Card */}
                    <div
                      onClick={() => toggleExpand(scene.id)}
                      className="flex items-center justify-between gap-4 cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-[#6C63FF]/10 border border-[#6C63FF]/20 text-[#6C63FF] rounded-lg shrink-0">
                          <Camera className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono font-bold text-[#6C63FF]">
                              Prompt {promptRow.prompt_number}
                            </span>
                            {promptRow.manually_edited === 1 && (
                              <Badge variant="blue">Edited</Badge>
                            )}
                            {(promptRow as any).appearance_corrected === 1 && (
                              <span title="Visual description was automatically corrected to match character appearance lock.">
                                <Badge variant="amber">Appearance auto-corrected</Badge>
                              </span>
                            )}
                            {(() => {
                              const activeViolations = (pData.violations || []).filter((v: any) => !v.dismissed);
                              if (activeViolations.length > 0) {
                                const hasError = activeViolations.some((v: any) => v.severity === 'error');
                                const label = hasError ? 'Appearance Violation' : 'Style Drift';
                                const bgColor = hasError ? 'var(--color-background-danger)' : 'var(--color-background-warning)';
                                const textColor = hasError ? 'var(--color-text-danger)' : 'var(--color-text-warning)';
                                const borderOpacity = hasError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(217, 119, 6, 0.2)';
                                return (
                                  <span title={`${label} detected in manually edited prompt.`}>
                                    <span
                                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                                      style={{
                                        backgroundColor: bgColor,
                                        color: textColor,
                                        border: `1px solid ${borderOpacity}`
                                      }}
                                    >
                                      {label}
                                    </span>
                                  </span>
                                );
                              }
                              return null;
                            })()}
                            {(scene.continuity_stale === 1 || pData.status === 'stale') && (
                              <span title="Upstream scene changed — regenerate this prompt.">
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
                              </span>
                            )}
                            {promptRow.bible_outdated && (
                              <span title="Production Bible has been regenerated — regenerate this prompt to align with the new locks.">
                                <span
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ml-1"
                                  style={{
                                    backgroundColor: 'rgba(217, 119, 6, 0.1)',
                                    color: '#fbbf24',
                                    border: '1px solid rgba(217, 119, 6, 0.2)'
                                  }}
                                >
                                  Bible Outdated
                                </span>
                              </span>
                            )}
                            {(pData.status === 'failed' || promptRow.visual_truncated === 1) && (
                              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <span 
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                                  style={{
                                    backgroundColor: 'var(--color-background-danger)',
                                    color: 'var(--color-text-danger)',
                                    border: '1px solid rgba(239, 68, 68, 0.2)'
                                  }}
                                >
                                  Incomplete
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setRegenTarget(promptRow)}
                                  className="px-1.5 py-0.5 text-rose-400 hover:text-rose-350 hover:bg-rose-950/30 rounded border border-rose-500/20 transition-all flex items-center gap-1 cursor-pointer animate-pulse"
                                  title="Regenerate Prompt"
                                >
                                  <RotateCcw className="w-2.5 h-2.5" />
                                  <span className="text-[8px] font-bold uppercase tracking-wider">Regenerate</span>
                                </button>
                              </div>
                            )}
                            <span className="text-[10px] text-gray-500 font-mono">
                              (Phase {scene.phase_number} Scene {scene.scene_number})
                            </span>
                             {(() => {
                              const duration = pData.duration_seconds || 8;
                              const words = getWordCount(pData.narration);
                              const isValid = narrationFitsDuration(words, duration);
                              return (
                                <span
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold font-mono border ml-1 shrink-0"
                                  style={
                                    isValid
                                      ? {
                                          backgroundColor: 'rgba(34, 197, 94, 0.1)',
                                          color: '#4ade80',
                                          borderColor: 'rgba(34, 197, 94, 0.2)'
                                        }
                                      : {
                                          backgroundColor: 'var(--color-background-danger)',
                                          color: 'var(--color-text-danger)',
                                          borderColor: 'rgba(239, 68, 68, 0.2)'
                                        }
                                  }
                                >
                                  {words}w / {duration}s
                                </span>
                              );
                            })()}
                          </div>
                          <h4 className="font-bold text-xs text-white truncate max-w-md">
                            {displayVisual}
                          </h4>
                          {(promptRow.visual_truncated === 1 || pData.status === 'failed') && (
                            <p className="text-rose-500 text-[10px] font-semibold mt-1">
                              {promptRow.visual_truncated === 1 
                                ? "Visual description may be incomplete — ends without punctuation." 
                                : "Technical prompt failed completeness validation gate. Please regenerate."}
                            </p>
                          )}
                          <div className="text-[10px] text-gray-400 font-mono mt-0.5 flex items-center gap-1.5">
                            <span>⏱ {pData.duration_seconds || 8}s</span>
                            {pData.scene_type && (
                              <>
                                <span>·</span>
                                <span className="bg-purple-500/10 text-purple-400 px-1.5 py-0.2 rounded border border-purple-500/20 font-sans tracking-normal uppercase text-[9px]">{pData.scene_type.replace('_', ' ')}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {(() => {
                        const count = continuityWarnings.filter(w => w.prompt_number === pData.prompt_number && !w.resolved).length;
                        if (count > 0) {
                          return (
                            <Badge variant="amber" className="ml-2">
                              {count} Issue{count > 1 ? 's' : ''}
                            </Badge>
                          );
                        }
                        return null;
                      })()}

                      <div className="flex items-center gap-3">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            handleCopyPrompt(e, pData);
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs shrink-0 cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Prompt</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (editingCardId === promptRow.id) {
                              handleSaveAndValidate(promptRow.id);
                            } else {
                              handleStartEdit(promptRow);
                            }
                          }}
                          className="p-1 text-gray-400 hover:text-white shrink-0 cursor-pointer"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                      </div>
                    </div>

                    {/* Expanded Prompt Details Panel */}
                    {isExpanded && (
                      editingCardId === promptRow.id ? (
                        <div className="space-y-4 pt-4 border-t border-[#2A2A38]/30">
                          {/* Visual */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Visual Scene Action</label>
                            <AutoResizingTextarea
                              value={editFields.visual}
                              onChange={(e) => setEditFields({ ...editFields, visual: e.target.value })}
                              className="w-full px-3 py-2 bg-black border border-[#2A2A38] rounded-lg text-xs text-white focus:outline-none focus:border-[#6C63FF] leading-relaxed resize-none"
                            />
                            {validationErrors.visual && <p className="text-rose-500 text-[10px] font-semibold">{validationErrors.visual}</p>}
                            {validationWarnings.visual && <p className="text-amber-500 text-[10px] font-semibold">{validationWarnings.visual}</p>}
                            {promptRow.visual_truncated === 1 && !validationErrors.visual && (
                              <p className="text-rose-500 text-[10px] font-semibold">
                                Visual description may be incomplete — ends without punctuation.
                              </p>
                            )}
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {/* Shot Type */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Shot Type</label>
                              <select
                                value={editFields.shot_type || 'medium'}
                                onChange={(e) => setEditFields({ ...editFields, shot_type: e.target.value })}
                                className="w-full px-3.5 py-2 bg-black border border-[#2A2A38] rounded-lg text-xs text-white focus:outline-none focus:border-[#6C63FF] h-[34px] cursor-pointer"
                              >
                                {['establishing','wide','medium','close_up','extreme_close_up','aerial','pov','over_shoulder','insert'].map(t => (
                                  <option key={t} value={t}>{t.replace('_', ' ')}</option>
                                ))}
                              </select>
                            </div>
                            {/* Shot Description */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Shot Details</label>
                              <AutoResizingTextarea
                                value={editFields.shot}
                                onChange={(e) => setEditFields({ ...editFields, shot: e.target.value })}
                                className="w-full px-3 py-2 bg-black border border-[#2A2A38] rounded-lg text-xs text-white focus:outline-none focus:border-[#6C63FF] resize-none"
                              />
                            </div>
                            {/* Lens */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Lens Focal</label>
                              <AutoResizingTextarea
                                value={editFields.lens}
                                onChange={(e) => setEditFields({ ...editFields, lens: e.target.value })}
                                className="w-full px-3 py-2 bg-black border border-[#2A2A38] rounded-lg text-xs text-white focus:outline-none focus:border-[#6C63FF] resize-none"
                              />
                            </div>
                            {/* Camera */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Camera Movement</label>
                              <AutoResizingTextarea
                                value={editFields.camera}
                                onChange={(e) => setEditFields({ ...editFields, camera: e.target.value })}
                                className="w-full px-3 py-2 bg-black border border-[#2A2A38] rounded-lg text-xs text-white focus:outline-none focus:border-[#6C63FF] resize-none"
                              />
                            </div>
                            {/* Lighting */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Lighting Setup</label>
                              <AutoResizingTextarea
                                value={editFields.lighting}
                                onChange={(e) => setEditFields({ ...editFields, lighting: e.target.value })}
                                className="w-full px-3 py-2 bg-black border border-[#2A2A38] rounded-lg text-xs text-white focus:outline-none focus:border-[#6C63FF] resize-none"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Ambient Sound */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Ambient Track</label>
                              <AutoResizingTextarea
                                value={editFields.ambient_sound}
                                onChange={(e) => setEditFields({ ...editFields, ambient_sound: e.target.value })}
                                className="w-full px-3 py-2 bg-black border border-[#2A2A38] rounded-lg text-xs text-white focus:outline-none focus:border-[#6C63FF] resize-none"
                              />
                            </div>
                            {/* SFX */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Sound Effects (SFX)</label>
                              <AutoResizingTextarea
                                value={editFields.sfx}
                                onChange={(e) => setEditFields({ ...editFields, sfx: e.target.value })}
                                className="w-full px-3 py-2 bg-black border border-[#2A2A38] rounded-lg text-xs text-white focus:outline-none focus:border-[#6C63FF] resize-none"
                              />
                            </div>
                          </div>



                          {/* Avoid */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Negative Cues (Avoid)</label>
                            <AutoResizingTextarea
                              value={editFields.avoid}
                              onChange={(e) => setEditFields({ ...editFields, avoid: e.target.value })}
                              className="w-full px-3 py-2 bg-black border border-[#2A2A38] rounded-lg text-xs text-white focus:outline-none focus:border-[#6C63FF] resize-none"
                            />
                            {validationErrors.avoid && <p className="text-rose-500 text-[10px] font-semibold">{validationErrors.avoid}</p>}
                            {pData.avoid_contradiction === 1 && (
                              <p className="text-amber-500 text-[10px] font-semibold mt-1 flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                Avoid field may contradict visual description.
                              </p>
                            )}
                          </div>

                          {/* Connection */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Connection</label>
                            <AutoResizingTextarea
                              value={editFields.connection}
                              onChange={(e) => setEditFields({ ...editFields, connection: e.target.value })}
                              className="w-full px-3 py-2 bg-black border border-[#2A2A38] rounded-lg text-xs text-white focus:outline-none focus:border-[#6C63FF] resize-none"
                            />
                          </div>

                          {/* Editable Narration */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Narration</label>
                              {(() => {
                                const duration = editFields.duration_seconds || 8;
                                const words = getWordCount(editFields.narration || '');
                                const isValid = narrationFitsDuration(words, duration);
                                return (
                                  <span
                                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold font-mono border"
                                    style={
                                      isValid
                                        ? {
                                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                                            color: '#4ade80',
                                            borderColor: 'rgba(34, 197, 94, 0.2)'
                                          }
                                        : {
                                            backgroundColor: 'var(--color-background-danger)',
                                            color: 'var(--color-text-danger)',
                                            borderColor: 'rgba(239, 68, 68, 0.2)'
                                          }
                                    }
                                  >
                                    {words}w / {duration}s
                                  </span>
                                );
                              })()}
                            </div>
                            <AutoResizingTextarea
                              value={editFields.narration || ''}
                              onChange={(e) => setEditFields({ ...editFields, narration: e.target.value })}
                              className="w-full px-3 py-2 bg-black border border-[#2A2A38] rounded-lg text-xs text-white focus:outline-none focus:border-[#6C63FF] resize-none"
                            />
                          </div>

                          {/* Editable Duration Selector & Scene Type */}
                          <div className="space-y-2">
                             <div className="flex items-center justify-between">
                               <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Duration</label>
                               <div className="flex items-center gap-2">
                                 {editFields.scene_type && (
                                   <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold font-mono tracking-wide bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase mr-1">
                                     {editFields.scene_type}
                                   </span>
                                 )}
                                 {(() => {
                                   const duration = editFields.duration_seconds || 8;
                                   const words = getWordCount(editFields.narration || '');
                                   const isValid = narrationFitsDuration(words, duration);
                                   return (
                                     <span
                                       className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold font-mono border"
                                       style={
                                         isValid
                                           ? {
                                               backgroundColor: 'rgba(34, 197, 94, 0.1)',
                                               color: '#4ade80',
                                               borderColor: 'rgba(34, 197, 94, 0.2)'
                                             }
                                           : {
                                               backgroundColor: 'var(--color-background-danger)',
                                               color: 'var(--color-text-danger)',
                                               borderColor: 'rgba(239, 68, 68, 0.2)'
                                             }
                                       }
                                     >
                                       {words}w / {duration}s
                                     </span>
                                   );
                                 })()}
                               </div>
                             </div>
                             <div className="flex gap-2">
                               {[5, 6, 7, 8].map((sec) => (
                                 <button
                                   key={sec}
                                   type="button"
                                   onClick={() => setEditFields({ ...editFields, duration_seconds: sec })}
                                   className={`px-3 py-1.5 text-xs font-bold rounded-lg border font-mono transition-all cursor-pointer ${
                                     editFields.duration_seconds === sec
                                       ? "bg-[#6C63FF] text-white border-[#6C63FF] shadow-sm shadow-[#6C63FF]/20"
                                       : "bg-black text-gray-400 border-[#2A2A38] hover:text-white"
                                   }`}
                                 >
                                   {sec}s
                                 </button>
                               ))}
                             </div>
                           </div>

                          {/* Save Button */}
                          <div className="flex justify-end gap-3 pt-2">
                            <Button variant="ghost" size="sm" onClick={() => setEditingCardId(null)}>
                              Cancel
                            </Button>
                            <Button variant="primary" size="sm" onClick={() => handleSaveAndValidate(promptRow.id)}>
                              Save & Validate
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="pt-4 border-t border-[#2A2A38]/30 space-y-5 animate-fade-in">
                          
                          {/* Continuity Warnings */}
                          {(() => {
                            const promptWarnings = continuityWarnings.filter(w => w.prompt_number === pData.prompt_number && !w.resolved);
                            if (promptWarnings.length > 0) {
                              return (
                                <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 space-y-2">
                                  <div className="flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                                    <span className="text-xs font-bold text-rose-400 uppercase tracking-widest">Continuity Issues</span>
                                  </div>
                                  <div className="space-y-3">
                                    {promptWarnings.map(w => {
                                      const isCross = w.cross_phase === 1;
                                      const isShotDiv = w.field === 'shot_diversity_violation';
                                      const isAnachronism = w.field === 'character_anachronism';
                                      return (
                                        <div 
                                          key={w.id} 
                                          className={`text-xs p-2 rounded border transition-all ${
                                            isCross 
                                              ? 'text-amber-300 bg-amber-500/5 border-amber-500/20 border-l-4 border-l-amber-500' 
                                              : isShotDiv
                                                ? 'text-blue-300 bg-blue-500/5 border-blue-500/20 border-l-4 border-l-blue-500'
                                                : 'text-rose-300 bg-black/20 border-rose-500/10'
                                          }`}
                                        >
                                          <div className="flex items-center justify-between gap-2 mb-1">
                                            <div className="flex items-center gap-1.5">
                                              {isShotDiv && <Camera className="w-3.5 h-3.5 text-blue-400 ti-camera shrink-0" />}
                                              {isAnachronism && <Clock className="w-3.5 h-3.5 text-amber-400 ti-clock shrink-0" />}
                                              <p><strong className={`uppercase text-[10px] tracking-wider ${isCross ? 'text-amber-200' : isShotDiv ? 'text-blue-200' : 'text-rose-200'}`}>{isAnachronism ? 'Timeline conflict' : w.field.replace(/_/g, ' ')}:</strong> {w.issue}</p>
                                            </div>
                                            {isCross && (
                                              <span className="text-[9px] font-bold uppercase tracking-widest bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/35 shrink-0">
                                                Cross-phase
                                              </span>
                                            )}
                                          </div>
                                          <p className={`italic mt-0.5 mb-2 ${isCross ? 'text-amber-400/80' : 'text-rose-400'}`}>Suggestion: {w.suggestion}</p>
                                          <div className="flex items-center gap-2">
                                            <button
                                              onClick={(e) => { e.stopPropagation(); handleResolveWarning(w.id, true); }}
                                              className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded transition-all border ${
                                                isCross 
                                                  ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border-amber-500/30' 
                                                  : 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border-rose-500/30'
                                              }`}
                                            >
                                              Mark as Resolved
                                            </button>
                                            <button
                                              onClick={(e) => { e.stopPropagation(); handleFixWarningWithAI(w.id); }}
                                              disabled={fixingWarningId === w.id}
                                              className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded transition-all border flex items-center gap-1.5 ${
                                                isCross 
                                                  ? 'bg-amber-600/30 text-amber-200 hover:bg-amber-600/45 border-amber-600/40' 
                                                  : 'bg-rose-600/30 text-rose-200 hover:bg-rose-600/45 border-rose-600/40'
                                              }`}
                                            >
                                              {fixingWarningId === w.id ? (
                                                <RefreshCw className="w-3 h-3 animate-spin" />
                                              ) : (
                                                <span className="text-[10px]">✨</span>
                                              )}
                                              Fix with AI
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          })()}

                          {/* Appearance / Style Validation Warnings Panel */}
                          {(() => {
                            const activeViolations = (pData.violations || []).filter((v: any) => !v.dismissed);
                            if (activeViolations.length > 0) {
                              return (
                                <div className="space-y-3 animate-fade-in">
                                  {activeViolations.map((v: any, idx: number) => {
                                    const isError = v.severity === 'error';
                                    return (
                                      <div
                                        key={idx}
                                        className={`p-3.5 rounded-lg border text-xs leading-relaxed space-y-2 select-text ${
                                          isError
                                            ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                                            : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between gap-4">
                                          <div className="flex items-center gap-2">
                                            <AlertTriangle className={`w-4 h-4 shrink-0 ${isError ? 'text-rose-500' : 'text-amber-550'}`} />
                                            <span className={`font-bold uppercase tracking-wider text-[10px] ${isError ? 'text-rose-400' : 'text-amber-450'}`}>
                                              {isError ? 'Appearance Violation' : 'Style Drift'}: {v.rule}
                                            </span>
                                          </div>
                                          <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border shrink-0 ${
                                            isError
                                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                              : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                          }`}>
                                            {v.field} field
                                          </span>
                                        </div>
                                        
                                        <p className="font-semibold text-gray-250">
                                          Issue: {v.issue}
                                        </p>
                                        
                                        <div className="p-2.5 bg-black/40 rounded border border-white/5 font-mono text-[11px] whitespace-pre-wrap select-text leading-normal">
                                          <span className="text-gray-500 block text-[9px] uppercase tracking-wider font-sans font-bold mb-1">Suggested Correction:</span>
                                          "{v.suggestion}"
                                        </div>

                                        <div className="flex items-center gap-3 pt-1">
                                          <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); handleApplySuggestion(promptRow, v); }}
                                            className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all border cursor-pointer ${
                                              isError
                                                ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border-rose-500/30'
                                                : 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border-amber-500/30'
                                            }`}
                                          >
                                            Apply Suggestion
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); handleKeepMyEdit(promptRow, v); }}
                                            className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded transition-all border border-white/10 cursor-pointer"
                                          >
                                            Keep My Edit
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            }
                            return null;
                          })()}

                          {/* Technical Grid specs */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                            <div className="space-y-0.5">
                              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold font-mono">Shot Scale</span>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                {pData.shot_type && (() => {
                                  const c = SHOT_TYPE_COLORS[pData.shot_type] || SHOT_TYPE_COLORS.medium;
                                  return (
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold font-mono tracking-wide ${c.bg} ${c.text} border ${c.border} uppercase shrink-0`}>
                                      {pData.shot_type}
                                    </span>
                                  );
                                })()}
                                <p className="text-white font-semibold">{pData.shot}</p>
                              </div>
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold font-mono">Lens Focal</span>
                              <p className="text-white font-semibold">{pData.lens}</p>
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold font-mono">Camera Movement</span>
                              <p className="text-white font-semibold">{pData.camera}</p>
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold font-mono">Lighting Setup</span>
                              <p className="text-white font-semibold">{pData.lighting}</p>
                            </div>
                          </div>

                          {/* Sound profiles */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs bg-black/30 p-3 rounded-lg border border-[#2a2a38]/35">
                            <div className="space-y-0.5 flex items-start gap-2">
                              <Volume2 className="w-4 h-4 text-gray-500 shrink-0" />
                              <div>
                                <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold font-mono block">Ambient Track</span>
                                <p className="text-gray-300 leading-normal font-semibold">{pData.ambient_sound || 'None'}</p>
                              </div>
                            </div>
                            <div className="space-y-0.5 flex items-start gap-2">
                              <Volume2 className="w-4 h-4 text-gray-500 shrink-0" />
                              <div>
                                <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold font-mono block">Sound Effects (SFX)</span>
                                <p className="text-gray-300 leading-normal font-semibold">{pData.sfx || 'None'}</p>
                              </div>
                            </div>
                          </div>



                          {/* Exclusions */}
                          {pData.avoid && (
                            <div className="text-xs space-y-0.5">
                              <span className="text-[10px] text-rose-400 uppercase tracking-widest font-bold font-mono block">Negative Cues (Avoid)</span>
                              <p className="text-rose-350 leading-relaxed font-semibold">{pData.avoid}</p>
                              {pData.avoid_contradiction === 1 && (
                                <p className="text-amber-500 text-[10px] font-semibold mt-1 flex items-center gap-1">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                  Avoid field may contradict visual description.
                                </p>
                              )}
                            </div>
                          )}

                          {/* Synced Narration */}
                          <div className="text-xs space-y-0.5">
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold font-mono block">Narration voice overlay</span>
                              {getNarrationLabel(pData.narration, pData.duration_seconds || 8)}
                            </div>
                            <p className="text-gray-300 leading-relaxed italic bg-black/45 p-2 rounded border border-[#2a2a38]/20">
                              "{pData.narration}"
                            </p>
                          </div>

                          {/* Compiled final text box */}
                          <div className="space-y-1.5">
                            <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold font-mono block">Unified Google Veo Prompt</span>
                            <div className="relative">
                              <pre className="p-4 bg-black border border-[#2A2A38] text-xs text-[#6C63FF] font-mono rounded-lg overflow-x-auto whitespace-pre-wrap leading-relaxed select-text pr-12">
                                {pData.veo_full_prompt}
                              </pre>
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="flex items-center justify-end gap-3 pt-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleStartEdit(promptRow)}
                              className="flex items-center gap-1.5 cursor-pointer"
                            >
                              <Edit className="w-3.5 h-3.5" />
                              <span>Edit Prompt Specs</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRegenTarget(promptRow)}
                              className="flex items-center gap-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/20 cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Regenerate Prompt</span>
                            </Button>
                          </div>
                        </div>
                      )
                    )}
                  </Card>
                  {nudgeBannerPromptId === promptRow.id && (
                    <div className="mt-2 p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs text-amber-300 flex items-center justify-between gap-4 select-text">
                      <span>This prompt was manually edited. Consider re-running the continuity scan for this phase to check for new issues.</span>
                      <button
                        onClick={() => setNudgeBannerPromptId(null)}
                        className="text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-350 px-2.5 py-1 rounded hover:bg-amber-500/30 transition-all border border-amber-500/30 cursor-pointer shrink-0"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      );
    });
  })()
)}
        </div>
      </div>


      {/* REGENERATE WARNING */}
      <ConfirmDialog
        isOpen={regenTarget !== null}
        onClose={() => setRegenTarget(null)}
        onConfirm={handleRegeneratePrompt}
        title="Regenerate Veo Prompt"
        message="Are you sure you want to regenerate this prompt? This will query the agent to recalculate camera focal points and rewrite the technical directives."
        confirmLabel="Regenerate Prompt"
        variant="danger"
      />
    </div>
  );
};

// Tiny loader spinner helper
function Loader2(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={props.className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3 3 3"
      />
    </svg>
  );
}

export default VeoPromptWorkspace;
