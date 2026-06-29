import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProject } from '../hooks/useProject';
import { useAgent } from '../hooks/useAgent';
import { useUiStore } from '../store/ui.store';
import { useSettingsStore } from '../store/settings.store';
import { scriptApi } from '../api/script.api';
import { scenesApi } from '../api/scenes.api';
import { credibilityReviewApi } from '../api/credibilityreview.api';
import PageHeader from '../components/layout/PageHeader';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import Textarea from '../components/ui/Textarea';
import StreamingText from '../components/agent/StreamingText';
import { formatDuration } from '../utils/format';
import {
  FileText,
  RotateCcw,
  Users,
  MapPin,
  CheckCircle,
  Clapperboard,
  Save,
  Check,
  Edit,
  Copy,
  Flame,
  AlertTriangle,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { Phase, ScriptData, ScriptPhaseItem } from 'shared';
import { buildPhasePlan, getWordCount, resolveLanguageRules, resolveContentProfile } from 'shared';
import { cn } from '../utils/cn';
import { useProjectStore } from '../store/project.store';
import { resolveBibleRefs } from '../utils/resolveBibleRefs';
import { storyAnalysisApi } from '../api/storyanalysis.api';

// ─── Word Count Health Badge Helpers ──────────────────────────────────────────
type WordCountHealth = 'danger-low' | 'success' | 'warning' | 'danger-high' | 'loading';

function computeWordCount(text: string, language: string = 'English'): number {
  return getWordCount(text, language);
}

function getWordCountHealth(count: number, phaseNumber: number): { health: WordCountHealth; label: string; bg: string; fg: string } {
  if (phaseNumber === 1) {
    if (count < 60) return {
      health: 'danger-low',
      label: `${count} words — Too short`,
      bg: 'var(--color-background-danger)',
      fg: 'var(--color-text-danger)',
    };
    if (count <= 140) {
      if (count >= 130) {
        return {
          health: 'warning',
          label: `${count} words — Near limit`,
          bg: 'var(--color-background-warning)',
          fg: 'var(--color-text-warning)',
        };
      }
      return {
        health: 'success',
        label: `${count} words`,
        bg: 'var(--color-background-success)',
        fg: 'var(--color-text-success)',
      };
    }
    return {
      health: 'danger-high',
      label: `${count} words — Over limit`,
      bg: 'var(--color-background-danger)',
      fg: 'var(--color-text-danger)',
    };
  } else {
    if (count < 120) return {
      health: 'danger-low',
      label: `${count} words — Too short`,
      bg: 'var(--color-background-danger)',
      fg: 'var(--color-text-danger)',
    };
    if (count <= 300) return {
      health: 'success',
      label: `${count} words`,
      bg: 'var(--color-background-success)',
      fg: 'var(--color-text-success)',
    };
    if (count <= 360) return {
      health: 'warning',
      label: `${count} words — Near limit`,
      bg: 'var(--color-background-warning)',
      fg: 'var(--color-text-warning)',
    };
    return {
      health: 'danger-high',
      label: `${count} words — Over limit`,
      bg: 'var(--color-background-danger)',
      fg: 'var(--color-text-danger)',
    };
  }
}

const LOADING_BADGE_STYLE = {
  bg: 'var(--color-background-secondary)',
  fg: 'var(--color-text-secondary)',
};


export const ScriptWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { activeProject, script, phases, veoPrompts, fetchProjectDetails, updatePhase, approveScript } = useProject();
  const durationMinutes = activeProject?.target_duration_minutes ?? 8;
  const rules = resolveLanguageRules(activeProject?.narration_language || 'English');
  const direction = rules.direction;
  const profile = resolveContentProfile(activeProject?.content_profile || 'viral_story');
  const plan = buildPhasePlan(durationMinutes, profile);
  const phaseCount = plan.phaseCount;

  const productionBible = useProjectStore((s) => s.productionBible);
  const storyAnalysis = useProjectStore((s) => s.storyAnalysis);
  const credibilityReview = useProjectStore((s) => s.credibilityReview);
  const scriptTone = useProjectStore((s) => s.scriptTone);
  const setScriptTone = useProjectStore((s) => s.setScriptTone);
  const hookRewriteLoading = useProjectStore((s) => s.hookRewriteLoading);
  const hookRewriteAttempts = useProjectStore((s) => s.hookRewriteAttempts);
  const incrementHookRewriteAttempts = useProjectStore((s) => s.incrementHookRewriteAttempts);
  const resetHookRewriteAttempts = useProjectStore((s) => s.resetHookRewriteAttempts);
  const updateProject = useProjectStore((s) => s.updateProject);
  const { invokeAgent } = useAgent();
  const activeAgentRun = useUiStore((s) => s.activeAgentRun);
  const settings = useSettingsStore((s) => s.settings);

  // Inline edit state
  const [editingPhaseNumber, setEditingPhaseNumber] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editNarration, setEditNarration] = useState('');

  // Regeneration target state
  const [regenTarget, setRegenTarget] = useState<number | null>(null);
  const [isBorderlineOpen, setIsBorderlineOpen] = useState(false);

  const scriptData: ScriptData | null = script
    ? (typeof script.raw_json === 'string' ? JSON.parse(script.raw_json) : script.raw_json)
    : null;
  const getPhaseItem = (pNum: number): ScriptPhaseItem | undefined => {
    return scriptData?.phases?.find((sp) => sp.phase_number === pNum);
  };

  const getPhaseDuration = (phase: Phase): { duration: number; isEstimated: boolean } => {
    const phasePrompts = veoPrompts.filter(
      (vp) => vp.phase_number === phase.phase_number && vp.project_id === id
    );

    if (phasePrompts.length > 0) {
      const total = phasePrompts.reduce((sum, vp) => {
        const d = typeof vp.raw_json === 'object' && vp.raw_json !== null
          ? (vp.raw_json as any).duration_seconds
          : (() => {
              try {
                return JSON.parse(vp.raw_json).duration_seconds;
              } catch {
                return 0;
              }
            })();
        return sum + (Number(d) || 0);
      }, 0);
      return { duration: total, isEstimated: false };
    } else {
      const wc = phase.narration_word_count || computeWordCount(phase.narration_text ?? phase.phase_content ?? '', activeProject?.narration_language || 'English');
      const estimated = Math.round(wc / 1.8);
      return { duration: estimated, isEstimated: true };
    }
  };

  const [currentHash, setCurrentHash] = useState(window.location.hash);

  const handleFixWithAI = async () => {
    if (!id) return;
    incrementHookRewriteAttempts();
    try {
      await invokeAgent(id, 'ScriptAgent', () => scriptApi.regenerateWithSuggestions(id, scriptTone));
    } catch (err: any) {
      toast.error(err.message || 'Failed to rewrite hook narration.');
    }
  };

  useEffect(() => {
    if (id) {
      fetchProjectDetails(id);
      resetHookRewriteAttempts();
    }
  }, [id, fetchProjectDetails, resetHookRewriteAttempts]);

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (currentHash && phases.length > 0) {
      const element = document.getElementById(currentHash.substring(1));
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
      }
    }
  }, [currentHash, phases]);

  const [isReScoring, setIsReScoring] = useState(false);

  const handleReScore = async () => {
    if (!id) return;
    setIsReScoring(true);
    try {
      await scriptApi.getHookScore(id, true);
      toast.success('Hook score calculated successfully!');
      await fetchProjectDetails(id);
    } catch (err: any) {
      toast.error(err.message || 'Failed to calculate hook score');
    } finally {
      setIsReScoring(false);
    }
  };

  const [isReAnalyzing, setIsReAnalyzing] = useState(false);

  const handleReAnalyze = async () => {
    if (!id) return;
    setIsReAnalyzing(true);
    try {
      await invokeAgent(id, 'StoryAnalyzerAgent', async () => {
        await storyAnalysisApi.generateStoryAnalysis(id);
      });
    } catch (err: any) {
      toast.error(err.message || 'Failed to run story analysis');
    } finally {
      setIsReAnalyzing(false);
    }
  };

  const [applyingIssueKeys, setApplyingIssueKeys] = useState<string[]>([]);
  const [correctedIssueKeys, setCorrectedIssueKeys] = useState<string[]>([]);
  const [isApplyingAll, setIsApplyingAll] = useState(false);
  const [isRechecking, setIsRechecking] = useState(false);

  const handleApplyFix = async (issue: any) => {
    if (!id) return;
    const issueKey = `${issue.phase_number}-${issue.claim}-${issue.explanation}`;
    setApplyingIssueKeys((prev) => [...prev, issueKey]);
    try {
      await credibilityReviewApi.applyCredibilityFix(id, issue.phase_number, [issue]);
      toast.success(`Applied fix for Phase ${issue.phase_number}`);
      setCorrectedIssueKeys((prev) => [...prev, issueKey]);
      setTimeout(() => {
        setCorrectedIssueKeys((prev) => prev.filter((k) => k !== issueKey));
      }, 2000);
      await fetchProjectDetails(id);
    } catch (err: any) {
      toast.error(err.message || 'Failed to apply credibility fix');
    } finally {
      setApplyingIssueKeys((prev) => prev.filter((k) => k !== issueKey));
    }
  };

  const handleApplyAll = async () => {
    if (!id) return;
    setIsApplyingAll(true);
    try {
      await invokeAgent(id, 'CredibilityReviewerAgent', async () => {
        await credibilityReviewApi.applyAllCredibilityFixes(id);
      });
      toast.success('Applied all credibility fixes and re-ran review!');
      await fetchProjectDetails(id);
    } catch (err: any) {
      toast.error(err.message || 'Failed to apply all fixes');
    } finally {
      setIsApplyingAll(false);
    }
  };

  const handleReRunCredibility = async () => {
    if (!id) return;
    setIsRechecking(true);
    try {
      await invokeAgent(id, 'CredibilityReviewerAgent', async () => {
        await credibilityReviewApi.generateCredibilityReview(id);
      });
      await fetchProjectDetails(id);
    } catch (err: any) {
      toast.error(err.message || 'Failed to re-run credibility review');
    } finally {
      setIsRechecking(false);
    }
  };

  const handleEditStart = (pNum: number, title: string, content: string, narration: string) => {
    setEditingPhaseNumber(pNum);
    setEditTitle(title);
    setEditContent(content);
    setEditNarration(narration);
  };

  const handleEditSave = async (pNum: number) => {
    if (!id) return;
    try {
      const wc = computeWordCount(editNarration, activeProject?.narration_language || 'English');
      await updatePhase(pNum, {
        title: editTitle,
        content: editContent,
        narration_text: editNarration,
        narration_word_count: wc,
      });
      toast.success(`Phase ${pNum} script updated!`);
      setEditingPhaseNumber(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update phase');
    }
  };

  const handleRegeneratePhase = async (pNum: number) => {
    if (!id) return;
    setRegenTarget(null);
    
    await invokeAgent(id, `ScriptAgent_Phase${pNum}`, async () => {
      await scriptApi.regeneratePhase(id, pNum, scriptTone);
    });
  };

  const handleGenerateScenes = async (pNum: number) => {
    if (!id) return;
    await invokeAgent(id, `SceneAgent_Phase${pNum}`, async () => {
      await scenesApi.generateScenes(id, { phaseNumber: pNum });
    });
    toast.success(`Scenes generated for Phase ${pNum}!`);
    navigate(`/projects/${id}/scenes`);
  };

  const executeApproval = async (shouldApprove: boolean) => {
    if (!script) return;
    try {
      const res = await approveScript(shouldApprove);
      toast.success(shouldApprove ? 'Script approved! Scenes generation unlocked.' : 'Script approval revoked.');
      if (shouldApprove && res && res.warnings && res.warnings.length > 0) {
        res.warnings.forEach((warn: string) => {
          toast(warn, { icon: '⚠️', duration: 6000 });
        });
      }
      if (shouldApprove) {
        navigate(`/projects/${id}/scenes`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve script');
    }
  };

  const handleApproveToggle = async () => {
    if (!script) return;
    const isApprovedNow = script.approved === 1;

    // Check if hook is borderline and we are approving
    const phase1 = phases.find((p) => p.phase_number === 1);
    const hookPassed = phase1 ? phase1.hook_score_passed === 1 : false;
    const hookBorderline = phase1 ? phase1.hook_score_borderline === 1 : false;

    if (!isApprovedNow && hookBorderline && !hookPassed) {
      setIsBorderlineOpen(true);
      return;
    }

    await executeApproval(!isApprovedNow);
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

  // Render loading state for the whole script run
  const isGeneratingFullScript = activeAgentRun && activeAgentRun.agentName === 'ScriptAgent';

  // Calculate stats
  const totalDuration = phases.reduce((acc: number, p: Phase) => {
    return acc + getPhaseDuration(p).duration;
  }, 0);
  const averageViralRating = phases.length > 0 
    ? (phases.reduce((acc: number, p: Phase) => {
        const item = getPhaseItem(p.phase_number);
        return acc + (item?.viral_hook_rating || 0);
      }, 0) / phases.length).toFixed(1)
    : '0';

  const typeColorMap: Record<string, 'gray' | 'blue' | 'purple' | 'amber' | 'emerald'> = {
    hook: 'amber',
    build_up: 'blue',
    escalation: 'purple',
    climax: 'emerald',
    outro: 'gray',
  };

  return (
    <div className="space-y-8 select-none pb-48">
      <PageHeader
        title="Script Workspace"
        description="Write and optimize the 10-phase structural narrative. Every phase acts as a pacing block, enforcing viewer retention beats."
        actions={
          <div className="flex items-center gap-3">
            {script && phases.length > 0 && (
              <Button
                onClick={handleCopyFullScript}
                className="flex items-center gap-1.5 cursor-pointer border-[#6C63FF]/30 text-[#6C63FF] hover:bg-[#6C63FF]/10"
                variant="secondary"
              >
                <Copy className="w-4 h-4" />
                <span>Copy Full Script</span>
              </Button>
            )}
            {!script && (
              <Button
                onClick={async () => {
                  if (id) {
                    await invokeAgent(id, 'ScriptAgent', () => scriptApi.generateScript(id, scriptTone));
                  }
                }}
                disabled={!hasApiKey || !!activeAgentRun}
                className="flex items-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>Generate Narration Script</span>
              </Button>
            )}
          </div>
        }
      />

      {isGeneratingFullScript ? (
        <div className="space-y-4">
          <div className="p-4 bg-[#6C63FF]/5 border border-[#6C63FF]/15 rounded-xl">
            <span className="text-xs font-bold uppercase tracking-wider text-[#6C63FF]">
              Script Generator Agent is drafting the 10-phase outline...
            </span>
          </div>
          <StreamingText text={activeAgentRun.progressText} title="Script Generator stream" />
        </div>
      ) : phases.length === 0 ? (
        /* Empty State & Slider Panel */
        <div className="space-y-6 max-w-2xl mx-auto">
          <Card className="p-6 space-y-6 bg-[#111118] border border-[#2A2A38] rounded-xl shadow-lg">
            <div className="border-b border-[#2A2A38] pb-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Script Tone Settings</h3>
              <p className="text-xs text-gray-500 mt-1">Configure narrative pacing, emotional register, and narration style before generation.</p>
            </div>
            
            <div className="space-y-6">
              {/* Pacing */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-bold uppercase">
                  <span className="text-gray-400">Pacing</span>
                  <Badge variant="blue">{scriptTone.pacing}/10</Badge>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={scriptTone.pacing}
                  onChange={(e) => setScriptTone({ pacing: Number(e.target.value) })}
                  className="w-full h-1 bg-[#1A1A2E] rounded-lg appearance-none cursor-pointer accent-[#6C63FF] border border-[#2A2A38]"
                />
                <div className="flex justify-between text-[10px] text-gray-500 font-medium">
                  <span>Slow Burn</span>
                  <span>Fast Cut</span>
                </div>
              </div>

              {/* Emotional Intensity */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-bold uppercase">
                  <span className="text-gray-400">Emotional Intensity</span>
                  <Badge variant="blue">{scriptTone.emotional_intensity}/10</Badge>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={scriptTone.emotional_intensity}
                  onChange={(e) => setScriptTone({ emotional_intensity: Number(e.target.value) })}
                  className="w-full h-1 bg-[#1A1A2E] rounded-lg appearance-none cursor-pointer accent-[#6C63FF] border border-[#2A2A38]"
                />
                <div className="flex justify-between text-[10px] text-gray-500 font-medium">
                  <span>Neutral</span>
                  <span>Dramatic</span>
                </div>
              </div>

              {/* Narration Style */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-bold uppercase">
                  <span className="text-gray-400">Narration Style</span>
                  <Badge variant="blue">{scriptTone.narration_style}/10</Badge>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={scriptTone.narration_style}
                  onChange={(e) => setScriptTone({ narration_style: Number(e.target.value) })}
                  className="w-full h-1 bg-[#1A1A2E] rounded-lg appearance-none cursor-pointer accent-[#6C63FF] border border-[#2A2A38]"
                />
                <div className="flex justify-between text-[10px] text-gray-500 font-medium">
                  <span>Documentary</span>
                  <span>Storytelling</span>
                </div>
              </div>

              {/* Target Audience */}
              <div className="space-y-2 border-t border-[#2A2A38] pt-4">
                <label className="text-xs font-bold uppercase text-gray-400">Target Audience</label>
                <select
                  value={scriptTone.target_audience || 'auto'}
                  onChange={(e) => setScriptTone({ target_audience: e.target.value as any })}
                  className="w-full bg-[#1A1A2E] border border-[#2A2A38] text-white text-xs rounded-lg p-2.5 outline-none focus:border-[#6C63FF] cursor-pointer"
                >
                  <option value="auto">Auto (AI Decides)</option>
                  <option value="gen_z">Gen Z (Fast attention, tech metaphors)</option>
                  <option value="millennial">Millennial (Analytical, nostalgic)</option>
                  <option value="gen_x">Gen X (Direct, detail-oriented)</option>
                  <option value="general">General (Broad audience)</option>
                </select>
              </div>

              {/* Engagement Controls */}
              <div className="border-t border-[#2A2A38] pt-4 space-y-4">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Engagement Features</h4>
                
                {/* Hook Auto-Regen */}
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400 font-semibold uppercase">Hook Auto-Regen</span>
                  <select
                    value={scriptTone.hook_regenerate || 'auto'}
                    onChange={(e) => setScriptTone({ hook_regenerate: e.target.value as any })}
                    className="bg-[#1A1A2E] border border-[#2A2A38] text-white text-xs rounded-lg p-1.5 outline-none focus:border-[#6C63FF] cursor-pointer w-32"
                  >
                    <option value="auto">Auto</option>
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </select>
                </div>

                {/* Pre-Climax Spike */}
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400 font-semibold uppercase">Pre-Climax Spike</span>
                  <select
                    value={scriptTone.pre_climax_spike || 'auto'}
                    onChange={(e) => setScriptTone({ pre_climax_spike: e.target.value as any })}
                    className="bg-[#1A1A2E] border border-[#2A2A38] text-white text-xs rounded-lg p-1.5 outline-none focus:border-[#6C63FF] cursor-pointer w-32"
                  >
                    <option value="auto">Auto</option>
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </select>
                </div>

                {/* Long Open Loop */}
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400 font-semibold uppercase">Long Open Loop</span>
                  <select
                    value={scriptTone.long_open_loop || 'auto'}
                    onChange={(e) => setScriptTone({ long_open_loop: e.target.value as any })}
                    className="bg-[#1A1A2E] border border-[#2A2A38] text-white text-xs rounded-lg p-1.5 outline-none focus:border-[#6C63FF] cursor-pointer w-32"
                  >
                    <option value="auto">Auto</option>
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </select>
                </div>
              </div>
            </div>
          </Card>

          <EmptyState
            title="No Script Outline Generated"
            description={`Your Production Bible is locked. Click generate to have the Script Agent write a full ${phaseCount}-phase narration outline.`}
            actionLabel="Generate Script"
            onAction={async () => {
              if (id) {
                await invokeAgent(id, 'ScriptAgent', () => scriptApi.generateScript(id, scriptTone));
              }
            }}
            icon={FileText}
          />
        </div>
      ) : (
        /* Phases List */
        <div className="space-y-6 pb-20">
          {/* Project Profile & Settings Bar */}
          <Card className="p-4 bg-[#111118]/80 border border-[#2A2A38] rounded-xl flex flex-wrap items-center justify-between gap-4 text-sans">
            <div className="flex items-center gap-6">
              <div className="space-y-1">
                <span className="text-[9px] uppercase tracking-wider text-gray-500 font-bold">Content Type</span>
                <p className="text-xs text-gray-300 font-mono capitalize">{activeProject?.content_type || 'auto'}</p>
              </div>
              <div className="w-px h-8 bg-[#2A2A38]/50 hidden sm:block" />
              <div className="space-y-1">
                <span className="text-[9px] uppercase tracking-wider text-gray-500 font-bold">Target Duration</span>
                <p className="text-xs text-gray-300 font-mono">{(activeProject as any)?.target_duration_minutes ?? 8} min</p>
              </div>
              <div className="w-px h-8 bg-[#2A2A38]/50 hidden sm:block" />
              <div className="space-y-1">
                <span className="text-[9px] uppercase tracking-wider text-gray-500 font-bold">Language</span>
                <p className="text-xs text-gray-300 font-mono capitalize">{activeProject?.narration_language || 'English'}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold uppercase text-gray-400">Content Profile:</span>
              <select
                value={activeProject?.content_profile || 'viral_story'}
                onChange={async (e) => {
                  if (id) {
                    try {
                      await updateProject(id, { content_profile: e.target.value });
                      toast.success(`Project content profile updated to ${e.target.value}.`);
                    } catch (err: any) {
                      toast.error(`Failed to update content profile: ${err.message}`);
                    }
                  }
                }}
                className="bg-[#1A1A2E] border border-[#2A2A38] text-white text-xs rounded-lg p-2.5 outline-none focus:border-[#6C63FF] cursor-pointer w-48 font-semibold"
              >
                <option value="viral_story">Viral Story</option>
                <option value="documentary">Documentary</option>
                <option value="tutorial">Tutorial</option>
                <option value="listicle">Listicle</option>
                <option value="narrative_fiction">Narrative Fiction</option>
                <option value="episodic_animated_story">Episodic Animated Story</option>
                <option value="kids_educational_story">Kids Educational / Cartoon Story</option>
                <option value="historical_deep_dive">Historical Deep-Dive / Mini-Doc</option>
                <option value="vlog_day_in_life">Vlog / Day-in-the-Life</option>
              </select>
            </div>
          </Card>

          {storyAnalysis && (
            <Card className="p-6 bg-[#111118]/80 border border-[#2A2A38] rounded-xl space-y-6 text-sans">
              <div className="flex justify-between items-center border-b border-[#2A2A38]/50 pb-4">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Audience Retention Curve Prediction</h3>
                  <p className="text-xs text-gray-500 mt-1">AI-simulated retention drops, engagement peaks, and rehook efficiency.</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isReAnalyzing}
                  onClick={handleReAnalyze}
                  className="h-8 px-3 text-xs uppercase font-bold tracking-wider flex items-center gap-1.5 border-[#6C63FF]/30 text-[#6C63FF] hover:bg-[#6C63FF]/10 cursor-pointer"
                >
                  <RotateCcw className={cn("w-3.5 h-3.5", isReAnalyzing && "animate-spin")} />
                  <span>{isReAnalyzing ? 'Analyzing...' : 'Re-analyze'}</span>
                </Button>
              </div>

              {/* Retention Sparkline Graph */}
              <div className="relative bg-black/40 p-4 rounded-lg border border-[#2A2A38]/30">
                <div className="h-44 w-full flex items-end relative">
                  {/* Y-axis Labels */}
                  <div className="absolute left-1 top-0 bottom-0 flex flex-col justify-between text-[10px] font-mono text-gray-500 pointer-events-none select-none z-10">
                    <span>10 (95%+)</span>
                    <span>5 (60%)</span>
                    <span>0 (&lt;30%)</span>
                  </div>

                  {/* Horizontal gridlines */}
                  <div className="absolute left-16 right-0 top-0 h-0 border-t border-[#2A2A38]/20" />
                  <div className="absolute left-16 right-0 top-[50%] h-0 border-t border-[#2A2A38]/20" />
                  <div className="absolute left-16 right-0 bottom-0 h-0 border-t border-[#2A2A38]/20" />

                  {/* Sparkline SVG */}
                  <div className="flex-1 h-36 ml-16 relative">
                    <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                      {/* Grid Lines inside SVG */}
                      <line x1="0" y1="0" x2="100" y2="0" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                      <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                      <line x1="0" y1="100" x2="100" y2="100" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />

                      {(() => {
                        const analyses = [...storyAnalysis.phase_analyses].sort((a, b) => a.phase_number - b.phase_number);
                        const points = analyses.map((p, idx) => {
                          const x = (idx / Math.max(1, analyses.length - 1)) * 100;
                          const y = 100 - ((p.retention_score || 0) / 10) * 100;
                          return { x, y, score: p.retention_score };
                        });

                        return (
                          <>
                            {/* SVG Line Segments with color mapping */}
                            {points.map((pt, idx) => {
                              if (idx === 0) return null;
                              const prev = points[idx - 1];
                              const score = pt.score || 0;
                              let color = '#ef4444'; // red
                              if (score >= 7) color = '#10b981'; // green
                              else if (score >= 5) color = '#f59e0b'; // amber

                              return (
                                <line
                                  key={idx}
                                  x1={prev.x}
                                  y1={prev.y}
                                  x2={pt.x}
                                  y2={pt.y}
                                  stroke={color}
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                />
                              );
                            })}

                            {/* Data points */}
                            {points.map((pt, idx) => {
                              const score = pt.score || 0;
                              let color = '#ef4444';
                              if (score >= 7) color = '#10b981';
                              else if (score >= 5) color = '#f59e0b';

                              return (
                                <g key={idx} className="group cursor-pointer">
                                  <circle
                                    cx={pt.x}
                                    cy={pt.y}
                                    r="2.5"
                                    fill={color}
                                    stroke="#111118"
                                    strokeWidth="0.75"
                                  />
                                </g>
                              );
                            })}
                          </>
                        );
                      })()}
                    </svg>

                    {/* Labels under the points */}
                    <div className="absolute left-0 right-0 -bottom-8 flex justify-between text-[10px] font-mono text-gray-500 select-none">
                      {storyAnalysis.phase_analyses.map((p) => (
                        <span key={p.phase_number} className="text-center" style={{ width: `${100 / storyAnalysis.phase_analyses.length}%` }}>
                          P{p.phase_number}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Spacer for bottom labels */}
                <div className="h-4" />
              </div>

              {/* Performance Badges and Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-[#2A2A38]/50 pt-4">
                <div className="bg-[#161622] p-3 rounded-lg border border-[#2B2B3C]/50 flex flex-col justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Overall Retention</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-2xl font-black font-mono text-emerald-400">
                      {storyAnalysis.overall_retention_score ? storyAnalysis.overall_retention_score.toFixed(1) : '0.0'}
                    </span>
                    <span className="text-xs text-gray-500 font-bold">/ 10</span>
                  </div>
                </div>

                <div className="bg-[#161622] p-3 rounded-lg border border-[#2B2B3C]/50 flex flex-col justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Dropout Risk Blocks</span>
                  <div className="text-sm font-bold font-mono text-amber-500 mt-1">
                    {storyAnalysis.dropout_risk_phases && storyAnalysis.dropout_risk_phases.length > 0 ? (
                      <span>Phases: {storyAnalysis.dropout_risk_phases.join(', ')}</span>
                    ) : (
                      <span className="text-gray-500">No high-risk phases</span>
                    )}
                  </div>
                </div>

                <div className="bg-[#161622] p-3 rounded-lg border border-[#2B2B3C]/50 flex flex-col justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Peak Moment Block</span>
                  <div className="text-sm font-bold font-mono text-purple-400 mt-1">
                    Phase {storyAnalysis.peak_moment_phase || 'N/A'}
                  </div>
                </div>
              </div>

              {storyAnalysis.summary && (
                <div className="bg-black/35 p-3 rounded-lg border border-[#2A2A38]/30">
                  <p className="text-xs text-gray-300 italic font-medium leading-relaxed">
                    "{storyAnalysis.summary}"
                  </p>
                </div>
              )}
            </Card>
          )}

          {credibilityReview && (
            <Card className="p-6 bg-[#111118]/80 border border-[#2A2A38] rounded-xl space-y-6 text-sans">
              <div className="flex justify-between items-center border-b border-[#2A2A38]/50 pb-4">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Script Credibility Review</h3>
                  <p className="text-xs text-gray-500 mt-1">AI-assisted fact-checking, consistency verification, and technical step auditing.</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 bg-[#161622] px-3 py-1.5 rounded-lg border border-[#2B2B3C]/50">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Credibility Score:</span>
                    <span className={cn(
                      "text-sm font-black font-mono ml-1",
                      credibilityReview.overall_credibility_score >= 8 ? "text-emerald-400" :
                      credibilityReview.overall_credibility_score >= 5 ? "text-amber-400" : "text-rose-400"
                    )}>
                      {credibilityReview.overall_credibility_score.toFixed(1)}
                    </span>
                    <span className="text-[10px] text-gray-500 font-bold">/ 10</span>
                  </div>
                </div>
              </div>

              {(credibilityReview.needs_recheck || (credibilityReview as any).stale) && (
                <div className="bg-amber-500/10 border border-amber-500/20 p-3.5 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-amber-300">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>Corrections applied — re-run the credibility review to verify.</span>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isRechecking || !!activeAgentRun}
                    onClick={handleReRunCredibility}
                    className="h-7 px-3 text-[10px] uppercase font-bold tracking-wider border-amber-500/30 text-amber-400 hover:bg-amber-500/10 shrink-0 cursor-pointer"
                  >
                    {isRechecking ? 'Re-running...' : 'Re-run Review'}
                  </Button>
                </div>
              )}

              {credibilityReview.summary && (
                <div className="bg-black/35 p-3 rounded-lg border border-[#2A2A38]/30">
                  <p className="text-xs text-gray-300 italic font-medium leading-relaxed">
                    "{credibilityReview.summary}"
                  </p>
                </div>
              )}

              {/* Collapsible List of Issues */}
              <div className="space-y-3">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Flagged Issues ({credibilityReview.issues.length})</span>
                  {credibilityReview.issues.length > 0 && (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={isApplyingAll || !!activeAgentRun || !credibilityReview.issues.some((i: any) => i.suggested_correction)}
                      onClick={handleApplyAll}
                      className="h-7 px-2.5 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1 cursor-pointer bg-[#6C63FF] hover:bg-[#5b52e6]"
                    >
                      {isApplyingAll ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Applying...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3 h-3" />
                          <span>Apply All Corrections</span>
                        </>
                      )}
                    </Button>
                  )}
                </div>
                {credibilityReview.issues.length === 0 ? (
                  <div className="text-xs text-gray-500 bg-emerald-500/5 border border-emerald-500/10 p-3 rounded-lg flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span>No credibility issues found. Factual and logical consistency is airtight!</span>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                    {credibilityReview.issues.map((issue, idx) => (
                      <div key={idx} className="bg-[#161622]/60 border border-[#2B2B3C]/50 rounded-lg p-4 space-y-2">
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-mono bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full border border-purple-500/20">
                              Phase {issue.phase_number}
                            </span>
                            <span className={cn(
                              "text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border",
                              issue.severity === 'high' ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
                              issue.severity === 'medium' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                              "bg-blue-500/10 text-blue-400 border-blue-500/20"
                            )}>
                              {issue.severity} severity
                            </span>
                            <span className="text-[10px] font-mono bg-gray-500/10 text-gray-300 px-2 py-0.5 rounded-full border border-gray-500/20">
                              {issue.issue_type.replace(/_/g, ' ')}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Flagged Claim:</div>
                          <p className="text-xs text-rose-300/90 italic bg-rose-950/20 p-2 rounded border border-rose-500/10">
                            "{issue.claim}"
                          </p>
                        </div>

                        <div className="space-y-1">
                          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Explanation:</div>
                          <p className="text-xs text-gray-300 leading-relaxed">
                            {issue.explanation}
                          </p>
                        </div>

                        {issue.suggested_correction && (() => {
                          const issueKey = `${issue.phase_number}-${issue.claim}-${issue.explanation}`;
                          const isApplying = applyingIssueKeys.includes(issueKey);
                          const isCorrected = correctedIssueKeys.includes(issueKey);

                          return (
                            <div className="space-y-2 pt-2 border-t border-[#2A2A38]/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                              <div className="space-y-1 flex-1">
                                <div className="text-[10px] text-gray-500 uppercase tracking-wider">Suggested Correction:</div>
                                <p className="text-xs text-emerald-400 bg-emerald-950/15 p-2 rounded border border-emerald-500/10 font-sans">
                                  {issue.suggested_correction}
                                </p>
                              </div>
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={isApplying || isCorrected || !!activeAgentRun}
                                onClick={() => handleApplyFix(issue)}
                                className={cn(
                                  "h-8 px-3 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5 cursor-pointer self-end sm:self-center shrink-0",
                                  isCorrected
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                    : "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                                )}
                              >
                                {isApplying ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                                    <span>Applying...</span>
                                  </>
                                ) : isCorrected ? (
                                  <>
                                    <CheckCircle className="w-3 h-3 text-emerald-400" />
                                    <span>Corrected!</span>
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="w-3 h-3 text-emerald-400" />
                                    <span>Apply Fix</span>
                                  </>
                                )}
                              </Button>
                            </div>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}

          {phases.map((p: Phase) => {
            const isEditing = editingPhaseNumber === p.phase_number;
            const isPhaseRegenerating = activeAgentRun && activeAgentRun.agentName === `ScriptAgent_Phase${p.phase_number}`;
            const isHighlighted = currentHash === `#phase-${p.phase_number}`;
            const displayContent = resolveBibleRefs(p.phase_content, productionBible);
            const activeItem = getPhaseItem(p.phase_number);
            const locationName = productionBible?.location_roster
              ?.find(l => l.id === activeItem?.location_id_primary)
              ?.name ?? activeItem?.location_id_primary ?? 'LOC_001';
            const charNames = activeItem?.character_ids_active && activeItem.character_ids_active.length > 0
              ? activeItem.character_ids_active.map((id: string) => 
                  productionBible?.character_roster?.find(c => c.id === id)?.name ?? id
                ).join(', ')
              : 'No characters active';

            return (
              <Card
                id={`phase-${p.phase_number}`}
                key={p.phase_number}
                className={cn(
                  "space-y-4 border-[#2A2A38] bg-[#111118]/60 relative transition-all duration-300",
                  isHighlighted && "border-[#6C63FF] shadow-lg shadow-[#6C63FF]/10 ring-1 ring-[#6C63FF]"
                )}
              >
                {/* Visual line loading indicator during phase regeneration */}
                {isPhaseRegenerating && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center p-4 z-10 rounded-xl">
                    <Loader2 className="w-8 h-8 animate-spin text-[#6C63FF]" />
                    <span className="text-xs font-mono font-bold text-gray-400 mt-2">Regenerating Phase {p.phase_number}...</span>
                  </div>
                )}

                {/* Phase header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#2A2A38]/30 pb-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-xs font-bold font-mono text-gray-500 uppercase tracking-wider">
                      Phase {p.phase_number}
                    </span>
                    <Badge variant={typeColorMap[p.phase_type] || 'gray'}>
                      {p.phase_type}
                    </Badge>
                    {p.rehook_required === 1 && (() => {
                      if (p.rehook_validated === 1) {
                        return <Badge variant="emerald">Re-hook: {p.rehook_type || 'detected'}</Badge>;
                      }
                      if (p.rehook_validated === 0) {
                        return <Badge variant="danger">Re-hook: Not detected — regenerate</Badge>;
                      }
                      return <Badge variant="amber">Re-hook Required</Badge>;
                    })()}
                    {isEditing ? (
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="bg-black border border-[#2A2A38] px-3 py-1 text-sm font-bold text-white rounded focus:outline-none focus:border-[#6C63FF]"
                      />
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        <h4 className="font-bold text-sm text-white">{p.phase_title}</h4>
                        {p.rehook_required === 1 && p.rehook_type && (
                          <div className="mt-1">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold font-mono tracking-wide bg-purple-500/10 text-purple-400 border border-purple-500/20">
                              {p.rehook_type}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Retention/Story indicators */}
                    {storyAnalysis && (() => {
                      const pa = storyAnalysis.phase_analyses.find((item) => item.phase_number === p.phase_number);
                      if (!pa) return null;
                      return (
                        <div className="flex items-center gap-1.5 ml-2">
                          {pa.emotional_intensity >= 8 && (
                            <span title={`High emotional intensity: ${pa.emotional_intensity}/10`}>
                              <Flame className="w-4 h-4 text-orange-500 fill-orange-500/20" />
                            </span>
                          )}
                          {pa.retention_score < 5 && (
                            <span title={`Low retention score warning: ${pa.retention_score}/10`}>
                              <AlertTriangle className="w-4 h-4 text-amber-500 fill-amber-500/10" />
                            </span>
                          )}
                          {pa.rehook_present && (
                            <span title="Re-hook element present">
                              <Check className="w-4 h-4 text-emerald-500 stroke-[3px]" />
                            </span>
                          )}
                        </div>
                      );
                    })()}

                    {/* Word Count Health Badge */}
                    {(() => {
                      if (isPhaseRegenerating) {
                        return (
                          <span
                            className="ml-auto shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wide whitespace-nowrap"
                            style={{ backgroundColor: LOADING_BADGE_STYLE.bg, color: LOADING_BADGE_STYLE.fg }}
                          >
                            Generating…
                          </span>
                        );
                      }
                      const liveCount = isEditing
                        ? computeWordCount(editNarration, activeProject?.narration_language || 'English')
                        : (p.narration_word_count ?? computeWordCount(p.narration_text ?? p.phase_content ?? '', activeProject?.narration_language || 'English'));
                      const badge = getWordCountHealth(liveCount, p.phase_number);
                      return (
                        <div className="ml-auto shrink-0 flex items-center gap-2">
                          {p.rehook_required === 1 && (() => {
                            if (p.rehook_validated === 1) {
                              return (
                                <span title={`Re-hook validated: ${p.rehook_type}`} className="inline-flex items-center text-emerald-450 bg-emerald-500/10 p-1 rounded-full border border-emerald-500/20">
                                  <Check className="w-3 h-3" />
                                </span>
                              );
                            }
                            if (p.rehook_validated === 0) {
                              return (
                                <span title="Re-hook validation failed" className="inline-flex items-center text-rose-450 bg-rose-500/10 p-1 rounded-full border border-rose-500/20">
                                  <AlertTriangle className="w-3 h-3 text-rose-400" />
                                </span>
                              );
                            }
                            return (
                              <span title="Re-hook validation pending" className="inline-flex items-center text-amber-500 bg-amber-500/10 p-1 rounded-full border border-amber-500/20">
                                <AlertTriangle className="w-3 h-3 text-amber-400" />
                              </span>
                            );
                          })()}
                          <span
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wide whitespace-nowrap"
                            style={{ backgroundColor: badge.bg, color: badge.fg }}
                          >
                            {badge.label}
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-gray-400 font-mono">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-[#6C63FF]" />
                      <span>{charNames}</span>
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-700" />
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#6C63FF]" />
                      <span>{locationName}</span>
                    </span>
                  </div>
                </div>

                {/* Content block */}
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">
                      Visual Action Beat
                    </label>
                    {isEditing ? (
                      <Textarea
                        value={editContent}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditContent(e.target.value)}
                        className="min-h-[85px] font-sans text-sm text-gray-300"
                      />
                    ) : (
                      <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
                        {displayContent}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#6C63FF] uppercase tracking-widest block flex items-center gap-1.5">
                      <span>Spoken Voiceover Narration</span>
                    </label>
                    {isEditing ? (
                      <Textarea
                        value={editNarration}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditNarration(e.target.value)}
                        className="min-h-[100px] font-sans text-sm text-gray-300 italic border-[#6C63FF]/30 focus:border-[#6C63FF]"
                        dir={direction}
                      />
                    ) : (
                      <p 
                        dir={direction}
                        className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap italic bg-black/35 p-3 rounded-lg border border-[#2A2A38]/30 font-medium"
                      >
                        "{resolveBibleRefs(p.narration_text ?? '', productionBible)}"
                      </p>
                    )}
                  </div>
                </div>

                {/* Hook Score Panel (Phase 1 Card only) */}
                {p.phase_number === 1 && !isPhaseRegenerating && (() => {
                  const profile = resolveContentProfile(activeProject?.content_profile || 'viral_story');
                  const score = p.hook_score;
                  const passed = p.hook_score_passed === 1;
                  const hookBorderline = p.hook_score_borderline === 1;
                  let bd: any = null;
                  if (p.hook_score_breakdown) {
                    try {
                      bd = typeof p.hook_score_breakdown === 'string' ? JSON.parse(p.hook_score_breakdown) : p.hook_score_breakdown;
                    } catch (e) {}
                  }

                  return (
                    <div className="mt-4 p-4 bg-[#161622] border border-[#2B2B3C] rounded-xl space-y-4">
                      <div className="flex items-center justify-between border-b border-[#2A2A38]/50 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Hook Quality Score</span>
                          {score !== null && score !== undefined && (
                            <span className={cn(
                              "text-xs px-2.5 py-0.5 rounded-full font-bold font-mono",
                              passed ? "bg-emerald-950/55 text-emerald-400 border border-emerald-500/30" :
                              hookBorderline ? "bg-amber-950/55 text-amber-400 border border-amber-500/30" :
                              "bg-rose-950/55 text-rose-400 border border-rose-500/30"
                            )}>
                              {passed ? 'Passed ✓' : hookBorderline ? 'Borderline ⚠' : 'Failed ✗'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {score !== null && score !== undefined && !passed && bd && bd.suggestions && bd.suggestions.length > 0 && (
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={hookRewriteLoading || !!activeAgentRun}
                              onClick={handleFixWithAI}
                              className="h-7 px-2.5 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1 cursor-pointer bg-[#6C63FF] hover:bg-[#5b52e6]"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>Fix with AI {hookRewriteAttempts > 1 ? `(attempt ${hookRewriteAttempts})` : ''} ↗</span>
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={isReScoring || hookRewriteLoading || !!activeAgentRun}
                            onClick={handleReScore}
                            className="h-7 px-2.5 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1 border-[#6C63FF]/30 text-[#6C63FF] hover:bg-[#6C63FF]/10 cursor-pointer"
                          >
                            <RotateCcw className={cn("w-3 h-3", isReScoring && "animate-spin")} />
                            <span>{isReScoring ? 'Scoring...' : 'Re-score'}</span>
                          </Button>
                        </div>
                      </div>

                      {hookRewriteLoading ? (
                        <div className="flex flex-col items-center justify-center py-6 gap-3">
                          <Loader2 className="w-5 h-5 animate-spin text-[#6C63FF]" />
                          <span className="text-xs font-mono font-bold text-gray-400">Rewriting hook using scorer feedback…</span>
                        </div>
                      ) : score === null || score === undefined ? (
                        <p className="text-xs text-gray-500 italic">No score calculated yet. Click Re-score to analyze.</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                          {/* Large Score Badge */}
                          <div className="md:col-span-3 flex flex-col items-center justify-center p-3 bg-black/40 rounded-lg border border-[#2A2A38]/30">
                            <span className={cn(
                              "text-3xl font-black font-mono",
                              passed ? "text-emerald-400" : hookBorderline ? "text-amber-400" : "text-rose-400"
                            )}>
                              {score.toFixed(1)}
                            </span>
                            <span className="text-[9px] uppercase tracking-wider text-gray-500 mt-1 font-bold">Overall Hook Score</span>
                          </div>

                          {/* Criterion Bars */}
                          <div className="md:col-span-9 space-y-2.5">
                            {(() => {
                              const colorMap: Record<string, string> = {
                                pattern_interrupt: 'bg-amber-500',
                                stakes_clarity: 'bg-blue-500',
                                curiosity_gap: 'bg-purple-500',
                                scroll_stop_power: 'bg-emerald-500',
                              };
                              return profile.hookCriteria.map((criterion) => {
                                const value = bd ? (bd[criterion.key] || 0) : 0;
                                const color = colorMap[criterion.key] || 'bg-gray-500';
                                return (
                                  <div key={criterion.key} className="space-y-1">
                                    <div className="flex justify-between text-[10px] font-bold">
                                      <span className="text-gray-400">{criterion.label}</span>
                                      <span className="text-gray-300">{value}/10</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden border border-[#2A2A38]/20">
                                      <div
                                        className={cn("h-full rounded-full transition-all duration-500", color)}
                                        style={{ width: `${value * 10}%` }}
                                      />
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      )}

                      {!hookRewriteLoading && bd && (
                        <div className="space-y-2 border-t border-[#2A2A38]/50 pt-3">
                          <p className="text-xs text-gray-300 italic font-medium font-sans">
                            "{bd.feedback}"
                          </p>
                          {!passed && bd.suggestions && bd.suggestions.length > 0 && (
                            <div className="space-y-2">
                              <div className="space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">Suggested rewrites to improve score:</span>
                                <ul className="list-disc list-inside text-xs text-gray-400 space-y-1 pl-1">
                                  {bd.suggestions.map((suggestion: string, idx: number) => (
                                    <li key={idx} className="leading-relaxed">{suggestion}</li>
                                  ))}
                                </ul>
                              </div>
                              <p className="text-[10px] text-gray-500 italic">
                                Rewrites Phase 1 narration using the scorer's specific suggestions above.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Card footer: Ratings and actions */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-3 border-t border-[#2A2A38]/30 text-xs">
                  {/* Stats info */}
                  <div className="flex items-center gap-4 text-gray-500 font-mono text-[10px]">
                    <div>
                      Pacing Rating: <span className="text-white font-bold">{getPhaseItem(p.phase_number)?.viral_hook_rating || 7}/10</span>
                    </div>
                    <div>
                      {(() => {
                        const { duration, isEstimated } = getPhaseDuration(p);
                        return isEstimated ? (
                          <>
                            Duration: <span className="text-white font-bold">~{duration}s (est.)</span>
                          </>
                        ) : (
                          <>
                            Duration: <span className="text-white font-bold">{duration}s</span>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div className="flex items-center gap-2">
                    {isEditing ? (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleEditSave(p.phase_number)}
                        className="flex items-center gap-1.5 cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Save Edits</span>
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleEditStart(p.phase_number, p.phase_title, p.phase_content, p.narration_text ?? '')}
                          className="flex items-center gap-1.5 cursor-pointer"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRegenTarget(p.phase_number)}
                          className="flex items-center gap-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/20 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Regenerate</span>
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleGenerateScenes(p.phase_number)}
                          disabled={!!activeAgentRun}
                          className={cn(
                            "flex items-center gap-1.5 cursor-pointer",
                            p.scenes_generated === 0
                              ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                              : "border-[#6C63FF]/30 text-[#6C63FF] hover:bg-[#6C63FF]/10"
                          )}
                        >
                          <Clapperboard className="w-3.5 h-3.5" />
                          <span>{p.scenes_generated === 0 ? "Regenerate Scenes" : "Generate Scenes"}</span>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* STICKY VALIDATION WARNINGS */}
      {script && phases.length > 0 && script.approved !== 1 && (() => {
        const profile = resolveContentProfile(activeProject?.content_profile || 'viral_story');
        const borderlineMin = profile.hookThreshold - 0.5;
        const tooShortPhases = phases.filter((p: Phase) => {
          const wc = p.narration_word_count ?? computeWordCount(p.narration_text ?? p.phase_content ?? '', activeProject?.narration_language || 'English');
          return p.phase_number === 1 ? wc < 60 : wc < 120;
        });
        const flaggedCount = tooShortPhases.length;
        const warningText = flaggedCount === 1
          ? `1 phase has narration under the minimum word count and will produce too few scenes. Regenerate or edit the flagged phase before approving.`
          : `${flaggedCount} phases have narration under the minimum word count and will produce too few scenes. Regenerate or edit the flagged phases before approving.`;
        const phase1 = phases.find((p) => p.phase_number === 1);
        const hookPassed = phase1 ? phase1.hook_score_passed === 1 : false;
        const hookBorderline = phase1 ? phase1.hook_score_borderline === 1 : false;
        const missingRehookPhases = phases.filter(p => p.rehook_required === 1 && p.rehook_validated !== 1);

        if (tooShortPhases.length === 0 && (hookPassed || hookBorderline) && missingRehookPhases.length === 0) return null;

        return (
          <div className="sticky bottom-20 z-40 mx-auto max-w-4xl w-full space-y-2 pointer-events-auto">
            {tooShortPhases.length > 0 && (
              <div
                className="px-4 py-2.5 rounded-lg text-xs font-medium flex items-center gap-2 shadow-lg"
                style={{ backgroundColor: 'var(--color-background-danger)', color: 'var(--color-text-danger)' }}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span>{warningText}</span>
              </div>
            )}
            {!hookPassed && !hookBorderline && (
              <div
                className="px-4 py-2.5 rounded-lg text-xs font-medium flex items-center gap-2 shadow-lg"
                style={{ backgroundColor: 'var(--color-background-danger)', color: 'var(--color-text-danger)' }}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span>Phase 1 hook score has not passed the minimum threshold ({borderlineMin.toFixed(1)}). Score or regenerate Phase 1 before approving.</span>
              </div>
            )}
            {hookBorderline && !hookPassed && (
              <div
                className="px-4 py-2.5 rounded-lg text-xs font-medium flex items-center gap-2 shadow-lg"
                style={{ backgroundColor: 'var(--color-background-warning)', color: 'var(--color-text-warning)' }}
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Phase 1 hook score is borderline ({phase1?.hook_score?.toFixed(1)}). You can approve anyway, but consider strengthening it.</span>
              </div>
            )}
            {missingRehookPhases.length > 0 && (
              <div
                className="px-4 py-2.5 rounded-lg text-xs font-medium flex items-center gap-2 shadow-lg"
                style={{ backgroundColor: 'var(--color-background-danger)', color: 'var(--color-text-danger)' }}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span>{missingRehookPhases.length} phase{missingRehookPhases.length !== 1 ? 's' : ''} are missing validated re-hook beats (phases {plan.rehookPhases.join(', ')}). Regenerate flagged phases before approving.</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* STICKY BOTTOM APPROVAL BAR */}
      {script && phases.length > 0 && (() => {
        const tooShortPhases = phases.filter((p: Phase) => {
          const wc = p.narration_word_count ?? computeWordCount(p.narration_text ?? p.phase_content ?? '', activeProject?.narration_language || 'English');
          return p.phase_number === 1 ? wc < 60 : wc < (plan.wordsPerPhase >= 120 ? 120 : 60);
        });
        const phase1 = phases.find((p) => p.phase_number === 1);
        const hookPassed = phase1 ? phase1.hook_score_passed === 1 : false;
        const hookBorderline = phase1 ? phase1.hook_score_borderline === 1 : false;

        // Check if any required re-hook is missing or not validated
        const missingRehookPhases = phases.filter(p => p.rehook_required === 1 && p.rehook_validated !== 1);
        const isApprovalBlocked = (tooShortPhases.length > 0 || (!hookPassed && !hookBorderline) || missingRehookPhases.length > 0) && script.approved !== 1;

        return (
          <div className="fixed bottom-0 left-64 right-0 z-40 bg-[#111118] border-t border-[#2A2A38] px-6 py-4 shadow-2xl backdrop-blur-md bg-opacity-95 text-sans">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6 text-xs font-mono text-gray-400">
                <div>
                  Total Phases: <span className="text-white font-bold">{phaseCount} Blocks</span>
                </div>
                <div>
                  Est. Duration: <span className="text-white font-bold">{formatDuration(totalDuration)}</span>
                </div>
                <div>
                  Avg Viral Pacing: <span className="text-white font-bold">{averageViralRating}/10</span>
                </div>
              </div>

              <Button
                variant={script.approved === 1 ? 'outline' : 'primary'}
                onClick={handleApproveToggle}
                disabled={isApprovalBlocked}
                title={!hookPassed && !hookBorderline && script.approved !== 1 ? "Phase 1 hook must score 6.5 or above before the script can be approved." : undefined}
                className="flex items-center gap-1.5 cursor-pointer"
              >
                {script.approved === 1 ? (
                  <>
                    <Check className="w-4 h-4 text-green-400" />
                    <span className="text-green-400 font-bold">Script Approved ✓</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Approve Script & Proceed</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        );
      })()}

      {/* REGENERATE PHASE WARNING DIALOG */}
      <ConfirmDialog
        isOpen={regenTarget !== null}
        onClose={() => setRegenTarget(null)}
        onConfirm={() => regenTarget && handleRegeneratePhase(regenTarget)}
        title="Regenerate Script Phase"
        message={`Are you sure you want to regenerate Phase ${regenTarget}? This will delete all generated storyboard scenes and Veo prompts belonging to this phase, requiring you to recreate them.`}
        confirmLabel="Regenerate Phase"
        variant="danger"
      />

      {/* BORDERLINE HOOK WARNING DIALOG */}
      {(() => {
        const phase1 = phases.find((p) => p.phase_number === 1);
        const scoreVal = phase1?.hook_score?.toFixed(1) ?? 'N/A';
        return (
          <ConfirmDialog
            isOpen={isBorderlineOpen}
            onClose={() => setIsBorderlineOpen(false)}
            onConfirm={async () => {
              setIsBorderlineOpen(false);
              await executeApproval(true);
            }}
            title="Hook Score is Borderline"
            message={`Hook score is borderline (${scoreVal}). Approve anyway?`}
            confirmLabel="Approve Anyway"
            variant="warning"
          />
        );
      })()}
    </div>
  );
};

export default ScriptWorkspace;
