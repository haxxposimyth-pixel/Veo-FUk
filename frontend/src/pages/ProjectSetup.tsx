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
import { CinematicConfigurationFields } from '../components/project/CinematicFields';

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

const REGIONS = [
  { value: 'auto', label: 'Auto (match language)' },
  { value: 'United States', label: 'United States' },
  { value: 'India', label: 'India' },
  { value: 'United Kingdom', label: 'United Kingdom' },
  { value: 'Canada', label: 'Canada' },
  { value: 'Australia', label: 'Australia' },
  { value: 'Japan', label: 'Japan' },
  { value: 'South Korea', label: 'South Korea' },
  { value: 'China', label: 'China' },
  { value: 'Spain', label: 'Spain' },
  { value: 'France', label: 'France' },
  { value: 'Germany', label: 'Germany' },
  { value: 'Brazil', label: 'Brazil' },
  { value: 'Mexico', label: 'Mexico' },
  { value: 'Middle East', label: 'Middle East' },
  { value: 'Indonesia', label: 'Indonesia' },
  { value: 'Russia', label: 'Russia' },
  { value: 'Thailand', label: 'Thailand' },
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

const TONE_OPTIONS = ['High-energy', 'Dark', 'Heroic', 'Emotional', 'Mysterious', 'Brutal combat', 'Adventure'];

export const ProjectSetup: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const { activeProject, fetchProjectDetails, updateProject } = useProject();
  const { invokeAgent, isRunning } = useAgent();
  const settings = useSettingsStore((s) => s.settings);

  console.log('[ProjectSetup debug] Render:', { id, activeProjectId: activeProject?.id, activeProjectTopic: activeProject?.topic, isRunning, hasApiKey: !!settings?.apiKey });

  // Mode selection state
  const [projectMode, setProjectMode] = useState<'viral' | 'cinematic'>('viral');

  // Form states
  const [topic, setTopic] = useState('');
  const [visualStyleSelect, setVisualStyleSelect] = useState('Cinematic Realism');
  const [customStyle, setCustomStyle] = useState('');
  const [language, setLanguage] = useState('English');
  const [region, setRegion] = useState('auto');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [contentType, setContentType] = useState('auto');
  const [youtubeTranscript, setYoutubeTranscript] = useState('');
  const [targetDurationMinutes, setTargetDurationMinutes] = useState(8);

  // Movie-specific states
  const [movieGenre, setMovieGenre] = useState('Sci-fi');
  const [customMovieGenre, setCustomMovieGenre] = useState('');
  const [movieFormat, setMovieFormat] = useState<'single_movie' | 'episode_series' | 'season_based_series'>('single_movie');
  const [movieDuration, setMovieDuration] = useState(10);
  const [movieVisualStyle, setMovieVisualStyle] = useState('Cinematic realism');
  const [customMovieVisualStyle, setCustomMovieVisualStyle] = useState('');
  const [movieTones, setMovieTones] = useState<string[]>(['High-energy']);
  const [storyEngineFocus, setStoryEngineFocus] = useState({
    combat: true,
    world_exploration: false,
    monster_action: false,
    hero_journey: false,
    season_continuity: false
  });
  const [heroIdea, setHeroIdea] = useState('');
  const [villainIdea, setVillainIdea] = useState('');
  const [worldIdea, setWorldIdea] = useState('');
  const [creatureIdea, setCreatureIdea] = useState('');
  const [seasonNumber, setSeasonNumber] = useState<number>(1);
  const [episodeNumber, setEpisodeNumber] = useState<number>(1);

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
    if (activeProject && activeProject.id === id && !isInitialized) {
      const isCinematic = activeProject.content_profile === 'cinematic_series';
      setProjectMode(isCinematic ? 'cinematic' : 'viral');

      setTopic(activeProject.topic);
      setLanguage(activeProject.narration_language);
      setRegion(activeProject.region || 'auto');
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

      if (activeProject.movie_config) {
        const mc = activeProject.movie_config;
        setMovieFormat(mc.format || 'single_movie');
        
        const knownGenres = ['Sci-fi', 'Ancient Empire', 'Fantasy War', 'Monster/Giant Beast', 'Alien Planet', 'Post-apocalyptic', 'Mythic Action'];
        if (knownGenres.includes(mc.genre)) {
          setMovieGenre(mc.genre);
          setCustomMovieGenre('');
        } else {
          setMovieGenre('Custom');
          setCustomMovieGenre(mc.genre || '');
        }

        setMovieTones(mc.tone || []);
        if (mc.story_engine_focus) {
          setStoryEngineFocus({
            combat: !!mc.story_engine_focus.combat,
            world_exploration: !!mc.story_engine_focus.world_exploration,
            monster_action: !!mc.story_engine_focus.monster_action,
            hero_journey: !!mc.story_engine_focus.hero_journey,
            season_continuity: !!mc.story_engine_focus.season_continuity
          });
        }
        setHeroIdea(mc.hero_idea || '');
        setVillainIdea(mc.villain_idea || '');
        setWorldIdea(mc.world_idea || '');
        setCreatureIdea(mc.creature_idea || '');
        
        setMovieDuration((activeProject as any).target_duration_minutes ?? 10);
        const knownMovieStyles = ['Cinematic realism', 'Sci-fi noir', 'Dark fantasy', 'Ancient epic', '3D animated', 'Anime-inspired'];
        if (knownMovieStyles.includes(activeProject.visual_style)) {
          setMovieVisualStyle(activeProject.visual_style);
          setCustomMovieVisualStyle('');
        } else {
          setMovieVisualStyle('Custom');
          setCustomMovieVisualStyle(activeProject.visual_style || '');
        }
        setSeasonNumber(mc.season_number ?? 1);
        setEpisodeNumber(mc.episode_number ?? 1);
      }
      setIsInitialized(true);
    }
  }, [activeProject, isInitialized, id]);

  const finalGenre = movieGenre === 'Custom' ? customMovieGenre : movieGenre;
  const finalVisualStyle = movieVisualStyle === 'Custom' ? customMovieVisualStyle : movieVisualStyle;

  const movieConfigPayload = {
    format: movieFormat,
    genre: finalGenre,
    tone: movieTones,
    story_engine_focus: storyEngineFocus,
    season_number: seasonNumber,
    episode_number: episodeNumber,
    hero_idea: heroIdea,
    villain_idea: villainIdea,
    world_idea: worldIdea,
    creature_idea: creatureIdea || undefined
  };

  const activeStyle = visualStyleSelect === 'Custom' ? customStyle : visualStyleSelect;

  const brief = activeProject?.concept_brief ? (() => {
    try {
      return JSON.parse(activeProject.concept_brief);
    } catch {
      return null;
    }
  })() : null;

  // Configure auto-save payload
  const autoSavePayload = projectMode === 'cinematic'
    ? {
        topic,
        visual_style: finalVisualStyle,
        narration_language: language,
        region: region,
        aspect_ratio: aspectRatio,
        content_type: 'narrative',
        content_profile: 'cinematic_series',
        youtube_transcript: youtubeTranscript || undefined,
        target_duration_minutes: movieDuration,
        movie_config: movieConfigPayload,
      }
    : {
        topic,
        visual_style: activeStyle,
        narration_language: language,
        region: region,
        aspect_ratio: aspectRatio,
        content_type: contentType,
        youtube_transcript: youtubeTranscript || undefined,
        target_duration_minutes: targetDurationMinutes,
        movie_config: undefined,
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
          latest.target_duration_minutes !== (activeProject as any).target_duration_minutes ||
          JSON.stringify(latest.movie_config) !== JSON.stringify(activeProject.movie_config);

        if (hasChanged) {
          await updateProject(id, latest);
        }
      }
    },
    1500
  );

  const handleGenerateStoryPlan = async () => {
    if (!id) return;

    if (projectMode === 'cinematic') {
      const finalGenre = movieGenre === 'Custom' ? customMovieGenre : movieGenre;
      if (!finalGenre || finalGenre.trim().length === 0) {
        toast.error('Please specify a genre.');
        return;
      }
      if (!movieFormat) {
        toast.error('Please specify a format.');
        return;
      }
      if (!topic || topic.length < 10) {
        toast.error('Please write a descriptive Core Story Idea (minimum 10 characters).');
        return;
      }
      if (!heroIdea || heroIdea.trim().length === 0) {
        toast.error('Please describe your Main Hero.');
        return;
      }
      if (!villainIdea || villainIdea.trim().length === 0) {
        toast.error('Please describe your Main Villain/Threat.');
        return;
      }
      if (!worldIdea || worldIdea.trim().length === 0) {
        toast.error('Please describe your World/Universe.');
        return;
      }
      if (!finalVisualStyle || finalVisualStyle.trim().length === 0) {
        toast.error('Please choose or write a visual style.');
        return;
      }
    } else {
      if (!topic || topic.length < 10) {
        toast.error('Please write a descriptive topic (minimum 10 characters).');
        return;
      }

      if (!activeStyle) {
        toast.error('Please choose or write a visual style.');
        return;
      }
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
          {/* Mode Selector */}
          <Card className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Project Mode
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setProjectMode('viral')}
                className={`p-4 border rounded-xl flex flex-col items-start gap-2 text-left transition-all duration-200 cursor-pointer ${
                  projectMode === 'viral'
                    ? 'border-[#6C63FF] bg-[#6C63FF]/10 text-white shadow-lg'
                    : 'border-[#2A2A38] bg-black/20 text-gray-400 hover:border-gray-500'
                }`}
              >
                <span className="text-sm font-bold text-white">Viral Video / Documentary</span>
                <span className="text-xs text-gray-400">Short-form contents, social media explainer, listicles, or tutorials.</span>
              </button>

              <button
                type="button"
                onClick={() => setProjectMode('cinematic')}
                className={`p-4 border rounded-xl flex flex-col items-start gap-2 text-left transition-all duration-200 cursor-pointer ${
                  projectMode === 'cinematic'
                    ? 'border-[#6C63FF] bg-[#6C63FF]/10 text-white shadow-lg'
                    : 'border-[#2A2A38] bg-black/20 text-gray-400 hover:border-gray-500'
                }`}
              >
                <span className="text-sm font-bold text-white">Movie / Cinematic Series</span>
                <span className="text-xs text-gray-400">High-energy episodic cinema, deep lore, character conflicts, and high stakes.</span>
              </button>
            </div>
          </Card>

          {projectMode === 'viral' ? (
            <>
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
            </>
          ) : (
            <>
              {/* Movie Configuration Card */}
              <Card className="space-y-4 animate-fade-in">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Movie / Cinematic Configuration
                </h3>
                <CinematicConfigurationFields
                  movieGenre={movieGenre}
                  setMovieGenre={setMovieGenre}
                  customMovieGenre={customMovieGenre}
                  setCustomMovieGenre={setCustomMovieGenre}
                  movieFormat={movieFormat}
                  setMovieFormat={setMovieFormat}
                  movieDuration={movieDuration}
                  setMovieDuration={setMovieDuration}
                  movieVisualStyle={movieVisualStyle}
                  setMovieVisualStyle={setMovieVisualStyle}
                  customMovieVisualStyle={customMovieVisualStyle}
                  setCustomMovieVisualStyle={setCustomMovieVisualStyle}
                  seasonNumber={seasonNumber}
                  setSeasonNumber={setSeasonNumber}
                  episodeNumber={episodeNumber}
                  setEpisodeNumber={setEpisodeNumber}
                />
              </Card>

              {/* Tone and Story Focus Card */}
              <Card className="space-y-4 animate-fade-in">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Tone & Narrative Focus
                </h3>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2.5">
                    Movie Tone (Select all that apply)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {TONE_OPTIONS.map((t) => {
                      const selected = movieTones.includes(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => {
                            if (selected) {
                              setMovieTones(movieTones.filter((x) => x !== t));
                            } else {
                              setMovieTones([...movieTones, t]);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                            selected
                              ? 'border-[#6C63FF] bg-[#6C63FF]/15 text-[#8F88FF]'
                              : 'border-[#2A2A38] bg-black/20 text-gray-400 hover:border-gray-500'
                          }`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
                    Story-Engine Focus (Toggles)
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.keys(storyEngineFocus).map((focusKey) => {
                      const labelMap: Record<string, string> = {
                        combat: 'Combat Focus',
                        world_exploration: 'World Exploration',
                        monster_action: 'Monster Action',
                        hero_journey: "Hero's Journey",
                        season_continuity: 'Season Continuity'
                      };
                      const checked = (storyEngineFocus as any)[focusKey];
                      return (
                        <label
                          key={focusKey}
                          className="flex items-center gap-3 p-2.5 rounded-lg border border-[#2A2A38] bg-[#0E0E14]/40 hover:bg-[#12121A]/80 transition-colors cursor-pointer select-none"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setStoryEngineFocus({
                                ...storyEngineFocus,
                                [focusKey]: e.target.checked
                              });
                            }}
                            className="w-4 h-4 rounded border-gray-700 bg-black text-[#6C63FF] focus:ring-[#6C63FF] focus:ring-opacity-25"
                          />
                          <span className="text-xs font-semibold text-gray-300">{labelMap[focusKey] || focusKey}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </Card>

              {/* Story Seeds Card */}
              <Card className="space-y-4 animate-fade-in">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Cinematic Story Seeds
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                      Core Story Idea / Premise (minimum 10 characters)
                    </label>
                    <Textarea
                      placeholder="e.g. In a post-apocalyptic desert, a lone technician discovers a buried spaceship that holds the key to restoring the oceans..."
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      className="min-h-[100px]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                      Main Hero / Protagonist
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Kaelen, a weary engineer who carries a deep regret from the collapse..."
                      value={heroIdea}
                      onChange={(e) => setHeroIdea(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#0A0A0F] border border-[#2A2A38] rounded-lg text-sm text-white focus:outline-none focus:border-[#6C63FF] focus:ring-1 focus:ring-[#6C63FF] transition-all placeholder-gray-600"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                      Main Villain / Antagonist / Threat
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. The Iron Vanguard, an authoritarian faction hunting for the ship's engine core..."
                      value={villainIdea}
                      onChange={(e) => setVillainIdea(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#0A0A0F] border border-[#2A2A38] rounded-lg text-sm text-white focus:outline-none focus:border-[#6C63FF] focus:ring-1 focus:ring-[#6C63FF] transition-all placeholder-gray-600"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                      World / Setting / Lore
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. A harsh desert wasteland covered in metal wreckage, where radioactive storms rage..."
                      value={worldIdea}
                      onChange={(e) => setWorldIdea(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#0A0A0F] border border-[#2A2A38] rounded-lg text-sm text-white focus:outline-none focus:border-[#6C63FF] focus:ring-1 focus:ring-[#6C63FF] transition-all placeholder-gray-600"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                      Main Creature / Monster (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Dune Leviathans, massive subterranean worms attracted to heat and engines..."
                      value={creatureIdea}
                      onChange={(e) => setCreatureIdea(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#0A0A0F] border border-[#2A2A38] rounded-lg text-sm text-white focus:outline-none focus:border-[#6C63FF] focus:ring-1 focus:ring-[#6C63FF] transition-all placeholder-gray-600"
                    />
                  </div>
                </div>
              </Card>
            </>
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

          {/* Target Region */}
          <Card className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Target Region
            </h3>
            <Select
              options={REGIONS}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            />
          </Card>

          {projectMode === 'viral' && (
            <>
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
            </>
          )}

          {projectMode === 'cinematic' && (
            /* YouTube Transcript Paste (Optional) - moved to right side in movie mode to keep UI tidy */
            <Card className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  YouTube Transcript Reference (Optional)
                </h3>
                <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-450 border border-purple-500/20 shrink-0">
                  Transcript Workflow
                </span>
              </div>
              <p className="text-[11px] text-gray-500 leading-normal">
                Paste a full video transcript here to guide character extraction and lore consistency.
              </p>
              <Textarea
                placeholder="Paste the YouTube transcript text here..."
                value={youtubeTranscript}
                onChange={(e) => setYoutubeTranscript(e.target.value)}
                className="min-h-[100px] font-mono text-xs"
              />
            </Card>
          )}

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
