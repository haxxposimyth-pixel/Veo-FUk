import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProject } from '../hooks/useProject';
import { useSettingsStore } from '../store/settings.store';
import { useAgent } from '../hooks/useAgent';
import { useAutoSave } from '../hooks/useAutoSave';
import { storyPlanApi } from '../api/storyplan.api';
import PageHeader from '../components/layout/PageHeader';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Textarea from '../components/ui/Textarea';
import Select from '../components/ui/Select';
import Tooltip from '../components/ui/Tooltip';
import {
  Monitor,
  Smartphone,
  Grid,
  Compass,
  ArrowRight,
  Save,
  Trash2,
  Library,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { customStylesApi } from '../api/customstyles.api';
import type { CustomStyle, RenderFamily } from 'shared';
import { VEO_COMFORT, COMFORT_WARNING } from 'shared';


const PRESET_STYLES = [
  { value: 'Photoreal Cinematic', label: 'Photoreal Cinematic' },
  { value: 'Documentary Realism', label: 'Documentary Realism' },
  { value: 'Nature/Wildlife', label: 'Nature/Wildlife' },
  { value: 'Macro/Product', label: 'Macro/Product' },
  { value: 'Film-Noir Cinematic', label: 'Film-Noir Cinematic' },
  { value: 'Vintage Film', label: 'Vintage Film' },
  { value: 'Pixar-style 3D', label: 'Pixar-style 3D' },
  { value: 'Stylized 3D/CGI', label: 'Stylized 3D/CGI' },
  { value: 'Aerial/Drone', label: 'Aerial/Drone' },
  { value: '3D Explainer Environments', label: '3D Explainer Environments' },
  { value: 'Custom', label: 'Custom Style...' },
];


const LANGUAGES = [
  { value: 'English', label: 'English' },
  { value: 'Spanish', label: 'Spanish (Español)' },
  { value: 'French', label: 'French (Français)' },
  { value: 'German', label: 'German (Deutsch)' },
  { value: 'Italian', label: 'Italian (Italiano)' },
  { value: 'Portuguese', label: 'Portuguese (Português)' },
  { value: 'Dutch', label: 'Dutch (Nederlands)' },
  { value: 'Russian', label: 'Russian (Русский)' },
  { value: 'Chinese', label: 'Chinese (中文)' },
  { value: 'Japanese', label: 'Japanese (日本語)' },
  { value: 'Korean', label: 'Korean (한국어)' },
  { value: 'Arabic', label: 'Arabic (العربية)' },
  { value: 'Hindi', label: 'Hindi (हिन्दी)' },
  { value: 'Bengali', label: 'Bengali (বাংলা)' },
  { value: 'Turkish', label: 'Turkish (Türkçe)' },
  { value: 'Vietnamese', label: 'Vietnamese (Tiếng Việt)' },
  { value: 'Polish', label: 'Polish (Polski)' },
  { value: 'Swedish', label: 'Swedish (Svenska)' },
  { value: 'Norwegian', label: 'Norwegian (Norsk)' },
  { value: 'Danish', label: 'Danish (Dansk)' },
];

const VIDEO_TYPES = [
  { value: 'auto', label: 'Auto (let the planner decide)' },
  { value: 'narrative', label: 'Narrative (story with characters)' },
  { value: 'documentary', label: 'Documentary / Explainer (no characters)' },
  { value: 'presenter', label: 'Presenter / Talking-head (one narrator)' },
];

const DURATION_OPTIONS = [
  { value: '8', label: '8 minutes (10 Blocks)' },
  { value: '10', label: '10 minutes (12 Blocks)' },
  { value: '15', label: '15 minutes (16 Blocks)' },
  { value: '30', label: '30 minutes (30 Blocks)' },
];

export const ProjectSetup: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const { activeProject, fetchProjectDetails, updateProject } = useProject();
  const { invokeAgent, isRunning } = useAgent();
  const settings = useSettingsStore((s) => s.settings);

  console.log('[ProjectSetup debug] Render:', { id, activeProjectId: activeProject?.id, activeProjectTopic: activeProject?.topic, isRunning, hasApiKey: !!settings?.apiKey });

  // Form states
  const [topic, setTopic] = useState('');
  const [visualStyleSelect, setVisualStyleSelect] = useState('Cinematic Realism');
  const [customStyle, setCustomStyle] = useState('');
  const [language, setLanguage] = useState('English');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [contentType, setContentType] = useState('auto');
  const [youtubeTranscript, setYoutubeTranscript] = useState('');
  const [targetDurationMinutes, setTargetDurationMinutes] = useState(8);

  // Custom Style Library
  const [savedStyles, setSavedStyles] = useState<CustomStyle[]>([]);
  const [saveStyleName, setSaveStyleName] = useState('');
  const [showStyleLibrary, setShowStyleLibrary] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [blueprintExpanded, setBlueprintExpanded] = useState(false);

  // Load saved custom styles
  useEffect(() => {
    customStylesApi.getAll().then(setSavedStyles).catch(() => {});
  }, []);

  // Load project details if not loaded or if ID changes
  useEffect(() => {
    if (id) {
      setIsInitialized(false);
      fetchProjectDetails(id);
    }
  }, [id, fetchProjectDetails]);

  // Set form states from loaded project details
  useEffect(() => {
    if (activeProject && !isInitialized) {
      setTopic(activeProject.topic);
      setLanguage(activeProject.narration_language);
      setAspectRatio(activeProject.aspect_ratio);
      setContentType(activeProject.content_type || 'auto');
      setYoutubeTranscript(activeProject.youtube_transcript || '');
      setTargetDurationMinutes((activeProject as any).target_duration_minutes ?? 8);
      
      const isPreset = PRESET_STYLES.some((style) => style.value === activeProject.visual_style);
      if (isPreset) {
        setVisualStyleSelect(activeProject.visual_style);
        setCustomStyle('');
      } else {
        setVisualStyleSelect('Custom');
        setCustomStyle(activeProject.visual_style);
      }
      setIsInitialized(true);
    }
  }, [activeProject, isInitialized]);

  const activeStyle = visualStyleSelect === 'Custom' ? customStyle : visualStyleSelect;

  const brief = activeProject?.concept_brief ? (() => {
    try {
      return JSON.parse(activeProject.concept_brief);
    } catch {
      return null;
    }
  })() : null;

  // Configure auto-save payload
  const autoSavePayload = {
    topic,
    visual_style: activeStyle,
    narration_language: language,
    aspect_ratio: aspectRatio,
    content_type: contentType,
    youtube_transcript: youtubeTranscript || undefined,
    target_duration_minutes: targetDurationMinutes,
  };

  // Setup auto-save hook
  const saveStatus = useAutoSave(
    autoSavePayload,
    async (latest) => {
      if (id && activeProject && isInitialized) {
        // Only trigger update if parameters differ from current project
        const hasChanged =
          latest.topic !== activeProject.topic ||
          latest.visual_style !== activeProject.visual_style ||
          latest.narration_language !== activeProject.narration_language ||
          latest.aspect_ratio !== activeProject.aspect_ratio ||
          latest.content_type !== activeProject.content_type ||
          latest.youtube_transcript !== (activeProject.youtube_transcript || undefined) ||
          latest.target_duration_minutes !== (activeProject as any).target_duration_minutes;

        if (hasChanged) {
          await updateProject(id, latest);
        }
      }
    },
    1500
  );

  const handleGenerateStoryPlan = async () => {
    if (!id) return;

    if (!topic || topic.length < 10) {
      toast.error('Please write a descriptive topic (minimum 10 characters).');
      return;
    }

    if (!activeStyle) {
      toast.error('Please choose or write a visual style.');
      return;
    }

    try {
      // Explicitly save the current project setup to avoid race condition/unmount loss
      await updateProject(id, autoSavePayload);
    } catch (err: any) {
      toast.error('Failed to save project settings before generating.');
      return;
    }

    // Trigger Story Planner Agent
    await invokeAgent(id, 'StoryPlannerAgent', async () => {
      await storyPlanApi.generateStoryPlan(id);
    });

    // Navigate to the planning workspace once done
    navigate(`/projects/${id}/planning`);
  };

  const handleSaveStyle = async () => {
    if (!customStyle || customStyle.trim().length === 0) {
      toast.error('Write a custom style description first.');
      return;
    }
    const name = saveStyleName.trim() || customStyle.slice(0, 40);
    try {
      const created = await customStylesApi.create(name, customStyle.trim());
      setSavedStyles((prev) => [created, ...prev]);
      setSaveStyleName('');
      toast.success(`Style "${name}" saved to library!`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save style.');
    }
  };

  const handleLoadStyle = (style: CustomStyle) => {
    setVisualStyleSelect('Custom');
    setCustomStyle(style.description);
    setShowStyleLibrary(false);
    toast.success(`Loaded style: ${style.name}`);
  };

  const handleDeleteStyle = async (id: string) => {
    try {
      await customStylesApi.delete(id);
      setSavedStyles((prev) => prev.filter((s) => s.id !== id));
      toast.success('Style deleted.');
    } catch {
      toast.error('Failed to delete style.');
    }
  };

  const hasApiKey = !!settings?.apiKey;

  return (
    <div className="space-y-8 select-none">
      <PageHeader
        title="Project Setup"
        description="Configure narration language, aspect ratio, and style settings. All changes are saved automatically in real-time."
        actions={
          <div className="flex items-center gap-3">
            {saveStatus === 'saving' && (
              <span className="text-xs text-gray-500 font-bold tracking-wider animate-pulse uppercase">
                Saving...
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="text-xs text-emerald-500 font-bold tracking-wider uppercase">
                Saved ✓
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="text-xs text-rose-500 font-bold tracking-wider uppercase">
                Save Error!
              </span>
            )}

            {activeProject?.status && activeProject.status !== 'setup' ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => navigate(`/projects/${id}/planning`)}
                  className="flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Story Plan</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
                {activeProject.status !== 'planning' && (
                  <Button
                    onClick={() => navigate(`/projects/${id}/bible`)}
                    className="flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Proceed to Bible</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ) : (
              <Tooltip content="Set API Key in Settings to enable generation" disabled={hasApiKey}>
                <div className="relative">
                  <Button
                    onClick={handleGenerateStoryPlan}
                    isLoading={isRunning || !isInitialized}
                    disabled={!hasApiKey || isRunning || !isInitialized}
                    className="flex items-center gap-1.5 cursor-pointer"
                  >
                    <Compass className="w-4 h-4" />
                    <span>Generate Story Plan</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </Tooltip>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Topic & Style parameters */}
        <div className="lg:col-span-2 space-y-6">
          {/* Topic description */}
          <Card className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Video Topic & Core Narrative Theme
            </h3>
            <Textarea
              placeholder="Provide a detailed topic descriptions, facts, or instructions for the video..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="min-h-[140px]"
            />
          </Card>

          {/* YouTube Transcript Paste */}
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                YouTube Transcript Reference (Optional)
              </h3>
              <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-450 border border-purple-500/20 shrink-0">
                Transcript Workflow
              </span>
            </div>
            <p className="text-[11px] text-gray-500 leading-normal">
              Paste a full video transcript here. The system will extract characters, locations, symbolic objects, and key narrative pacing directly from this source to guide prompt generation.
            </p>
            <Textarea
              placeholder="Paste the YouTube transcript text here..."
              value={youtubeTranscript}
              onChange={(e) => setYoutubeTranscript(e.target.value)}
              className="min-h-[140px] font-mono text-xs"
            />
          </Card>

          {/* Visual Style Selection */}
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                Visual Style Profile
              </h3>
              {savedStyles.length > 0 && (
                <button
                  onClick={() => setShowStyleLibrary(!showStyleLibrary)}
                  className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-all cursor-pointer"
                >
                  <Library className="w-3 h-3" />
                  Style Library ({savedStyles.length})
                </button>
              )}
            </div>

            {/* Saved Style Library Dropdown */}
            {showStyleLibrary && savedStyles.length > 0 && (
              <div className="bg-[#0A0A0F] border border-[#2A2A38] rounded-lg p-3 space-y-2 animate-fade-in max-h-52 overflow-y-auto">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                  Saved Styles — click to load
                </p>
                {savedStyles.map((style) => (
                  <div
                    key={style.id}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-[#12121A] border border-[#2A2A38] hover:border-[#6C63FF]/40 hover:bg-[#6C63FF]/5 transition-all group"
                  >
                    <button
                      onClick={() => handleLoadStyle(style)}
                      className="flex-1 text-left cursor-pointer min-w-0"
                    >
                      <p className="text-xs font-semibold text-white truncate">{style.name}</p>
                      <p className="text-[10px] text-gray-500 truncate mt-0.5">{style.description}</p>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteStyle(style.id); }}
                      className="p-1.5 rounded text-gray-600 hover:text-rose-400 hover:bg-rose-500/10 transition-all opacity-0 group-hover:opacity-100 cursor-pointer shrink-0"
                      title="Delete style"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Select
                  label="Preset Style Selection"
                  options={PRESET_STYLES}
                  value={visualStyleSelect}
                  onChange={(e) => setVisualStyleSelect(e.target.value)}
                />
                {(() => {
                  if (visualStyleSelect !== 'Custom') {
                    // LOCKED_CORE mapping helper to match family
                    const coreMapping: Record<string, RenderFamily> = {
                      'Photoreal Cinematic': 'photoreal_cinematic',
                      'Documentary Realism': 'documentary_realism',
                      'Nature/Wildlife': 'documentary_realism',
                      'Macro/Product': 'photoreal_cinematic',
                      'Film-Noir Cinematic': 'photoreal_cinematic',
                      'Vintage Film': 'photoreal_cinematic',
                      'Pixar-style 3D': 'pixar_3d',
                      'Stylized 3D/CGI': 'stylized_3d',
                      'Aerial/Drone': 'photoreal_cinematic',
                      '3D Explainer Environments': 'stylized_3d',
                    };
                    const family = coreMapping[visualStyleSelect];
                    if (family) {
                      const comfort = VEO_COMFORT[family];
                      const badge = comfort === 'comfortable' ? '✅ Comfortable' : comfort === 'workable' ? '⚠️ Workable' : '❌ Avoid';
                      const warningMsg = comfort !== 'comfortable' ? COMFORT_WARNING(family) : '';
                      return (
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center gap-1.5 text-xs text-gray-400 font-mono">
                            <span>Veo Comfort:</span>
                            <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                              comfort === 'comfortable' ? 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/20' :
                              comfort === 'workable' ? 'bg-amber-500/10 text-amber-450 border border-amber-500/20' :
                              'bg-rose-500/10 text-rose-450 border border-rose-500/20'
                            }`}>{badge}</span>
                          </div>
                          {warningMsg && (
                            <p className="text-[11px] font-bold text-amber-400 bg-amber-500/5 border border-amber-500/10 rounded p-2 mt-1.5 leading-normal">
                              {warningMsg}
                            </p>
                          )}
                        </div>
                      );
                    }
                  }
                  return null;
                })()}
              </div>

              {visualStyleSelect === 'Custom' && (
                <div className="animate-fade-in">
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                    Custom Visual Style description
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 1970s Polaroid film, warm pastel tones, hazy glow"
                    value={customStyle}
                    onChange={(e) => setCustomStyle(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#0A0A0F] border border-[#2A2A38] rounded-lg text-sm text-white focus:outline-none focus:border-[#6C63FF] focus:ring-1 focus:ring-[#6C63FF] transition-all placeholder-gray-600"
                    required
                  />
                  {(() => {
                    // Try to guess family from description using keywords
                    const text = customStyle.toLowerCase();
                    let guess: RenderFamily = 'photoreal_cinematic';
                    if (/2d vector|corporate memphis|flat vector/i.test(text)) {
                      guess = 'flat_2d_vector';
                    } else if (/motion graphics|infographic animation|after effects/i.test(text)) {
                      guess = 'motion_graphics';
                    } else if (/pixel art|8-bit|16-bit|retro pixel/i.test(text)) {
                      guess = 'pixel_art';
                    } else if (/claymation|stopmotion|stop-motion|clay shader/i.test(text)) {
                      guess = 'claymation_stopmotion';
                    } else if (/anime|manga|2d hand-drawn|cel-shaded/i.test(text)) {
                      guess = 'anime_2d';
                    } else if (/painterly|watercolor|storybook|fantasy painting/i.test(text)) {
                      guess = 'painterly_watercolor';
                    } else if (/comic|graphic novel|sketch|hand-drawn ink/i.test(text)) {
                      guess = 'comic_graphic_novel';
                    } else if (/pixar|3d animation|3d animated|character rendering/i.test(text)) {
                      guess = 'pixar_3d';
                    } else if (/stylized 3d|cgi|render|octane|digital art|infographic 3d/i.test(text)) {
                      guess = 'stylized_3d';
                    } else if (/documentary|vérité|verite|handheld|observational|wildlife|nature/i.test(text)) {
                      guess = 'documentary_realism';
                    }

                    const comfort = VEO_COMFORT[guess];
                    const badge = comfort === 'comfortable' ? '✅ Comfortable' : comfort === 'workable' ? '⚠️ Workable' : '❌ Avoid';
                    const warningMsg = comfort !== 'comfortable' ? COMFORT_WARNING(guess) : '';
                    return (
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-gray-400 font-mono">
                          <span>Detected Veo Comfort:</span>
                          <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                            comfort === 'comfortable' ? 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/20' :
                            comfort === 'workable' ? 'bg-amber-500/10 text-amber-450 border border-amber-500/20' :
                            'bg-rose-500/10 text-rose-450 border border-rose-500/20'
                          }`}>{badge}</span>
                        </div>
                        {warningMsg && (
                          <p className="text-[11px] font-bold text-amber-400 bg-amber-500/5 border border-amber-500/10 rounded p-2 mt-1.5 leading-normal">
                            {warningMsg}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>


            {/* Save Custom Style Button */}
            {visualStyleSelect === 'Custom' && customStyle.trim().length > 0 && (
              <div className="flex items-center gap-3 pt-1 animate-fade-in">
                <input
                  type="text"
                  placeholder="Style name (optional, auto-generated if empty)"
                  value={saveStyleName}
                  onChange={(e) => setSaveStyleName(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[#0A0A0F] border border-[#2A2A38] rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder-gray-600"
                />
                <button
                  onClick={handleSaveStyle}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save to Library
                </button>
              </div>
            )}
          </Card>

          {/* Collapsible Engagement Blueprint */}
          {brief && brief.engagement_blueprint && (
            <div className="border border-[#2A2A38] rounded-lg overflow-hidden bg-[#111118]">
              <button
                type="button"
                onClick={() => setBlueprintExpanded(!blueprintExpanded)}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#1A1A24]/40 hover:bg-[#1A1A24]/60 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#6C63FF]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-white">Engagement Blueprint Preview</span>
                </div>
                {blueprintExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>
              
              {blueprintExpanded && (
                <div className="p-4 space-y-3.5 border-t border-[#2A2A38] text-xs leading-relaxed text-gray-300 font-mono">
                  <div>
                    <span className="font-bold text-white block">Core Curiosity Question:</span>
                    <p className="mt-0.5 text-gray-400">{brief.engagement_blueprint.core_curiosity_question}</p>
                  </div>
                  <div>
                    <span className="font-bold text-white block">Hook Strategy:</span>
                    <p className="mt-0.5 text-gray-400">{brief.engagement_blueprint.hook_strategy}</p>
                  </div>
                  <div>
                    <span className="font-bold text-white block">Open Loops:</span>
                    <ul className="list-disc pl-4 mt-0.5 space-y-1 text-gray-400">
                      {brief.engagement_blueprint.open_loops.map((loop: string, idx: number) => (
                        <li key={idx}>{loop}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span className="font-bold text-white block">Escalation Logic:</span>
                    <p className="mt-0.5 text-gray-400">{brief.engagement_blueprint.escalation_logic}</p>
                  </div>
                  <div>
                    <span className="font-bold text-white block">Emotional Driver:</span>
                    <p className="mt-0.5 text-gray-400">{brief.engagement_blueprint.emotional_driver}</p>
                  </div>
                  <div>
                    <span className="font-bold text-white block">Payoff:</span>
                    <p className="mt-0.5 text-gray-400">{brief.engagement_blueprint.payoff}</p>
                  </div>
                  {brief.thumbnail_concept && (
                    <div>
                      <span className="font-bold text-white block">Thumbnail Concept:</span>
                      <p className="mt-0.5 text-gray-400">{brief.thumbnail_concept}</p>
                    </div>
                  )}
                  {brief.keywords && brief.keywords.length > 0 && (
                    <div>
                      <span className="font-bold text-white block mb-1">Keywords / SEO Tags:</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {brief.keywords.map((kw: string, idx: number) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded bg-indigo-950/40 text-indigo-400 border border-indigo-900/30 text-[10px] font-semibold"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Language & Aspect Ratios */}
        <div className="space-y-6">
          {/* Narration Language */}
          <Card className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Narration Language
            </h3>
            <Select
              options={LANGUAGES}
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            />
          </Card>

          {/* Video Type */}
          <Card className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Video Type
            </h3>
            <Select
              options={VIDEO_TYPES}
              value={contentType}
              onChange={(e) => setContentType(e.target.value)}
            />
          </Card>

          {/* Target Duration */}
          <Card className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Target Duration
            </h3>
            <Select
              options={DURATION_OPTIONS}
              value={String(targetDurationMinutes)}
              onChange={(e) => setTargetDurationMinutes(parseInt(e.target.value, 10))}
            />
          </Card>

          {/* Aspect Ratio Box Radios */}
          <Card className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Aspect Ratio & Layout Preview
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {/* 16:9 Landscape */}
              <button
                onClick={() => setAspectRatio('16:9')}
                className={`p-3 border rounded-lg flex flex-col items-center gap-1.5 cursor-pointer transition-all duration-200 ${
                  aspectRatio === '16:9'
                    ? 'border-[#6C63FF] bg-[#6C63FF]/10 text-white font-bold'
                    : 'border-[#2A2A38] bg-black/20 text-gray-400 hover:border-gray-500'
                }`}
              >
                <Monitor className="w-4 h-4" />
                <span className="text-[10px] uppercase tracking-wider font-mono">16:9</span>
              </button>

              {/* 9:16 Portrait */}
              <button
                onClick={() => setAspectRatio('9:16')}
                className={`p-3 border rounded-lg flex flex-col items-center gap-1.5 cursor-pointer transition-all duration-200 ${
                  aspectRatio === '9:16'
                    ? 'border-[#6C63FF] bg-[#6C63FF]/10 text-white font-bold'
                    : 'border-[#2A2A38] bg-black/20 text-gray-400 hover:border-gray-500'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span className="text-[10px] uppercase tracking-wider font-mono">9:16</span>
              </button>

              {/* 1:1 Square */}
              <button
                onClick={() => setAspectRatio('1:1')}
                className={`p-3 border rounded-lg flex flex-col items-center gap-1.5 cursor-pointer transition-all duration-200 ${
                  aspectRatio === '1:1'
                    ? 'border-[#6C63FF] bg-[#6C63FF]/10 text-white font-bold'
                    : 'border-[#2A2A38] bg-black/20 text-gray-400 hover:border-gray-500'
                }`}
              >
                <Grid className="w-4 h-4" />
                <span className="text-[10px] uppercase tracking-wider font-mono">1:1</span>
              </button>
            </div>

            {/* Visual Preview Box */}
            <div className="flex items-center justify-center p-6 bg-[#0A0A0F] border border-[#2A2A38] rounded-lg h-36">
              <div
                className={`border-2 border-[#6C63FF]/40 bg-[#6C63FF]/10 flex items-center justify-center text-[10px] font-mono text-[#6C63FF] font-bold uppercase tracking-wider transition-all duration-300 rounded shadow-inner shadow-[#6C63FF]/10 ${
                  aspectRatio === '16:9'
                    ? 'w-44 h-24'
                    : aspectRatio === '9:16'
                      ? 'w-16 h-28'
                      : 'w-24 h-24'
                }`}
              >
                {aspectRatio}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
export default ProjectSetup;
