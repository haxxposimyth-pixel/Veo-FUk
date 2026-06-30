import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '../store/project.store';
import { useSettingsStore } from '../store/settings.store';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { projectCreateSchema, isProfileTypeCoherent } from 'shared';
import {
  Film,
  Plus,
  Search,
  Video,
  Clapperboard,
  Database,
  Trash2,
  Calendar,
  Copy,
  Cpu,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Input from '../components/ui/Input';
import Textarea from '../components/ui/Textarea';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import { formatRelativeDate } from '../utils/format';
import { toast } from 'react-hot-toast';
import Select from '../components/ui/Select';
import { projectsApi } from '../api/projects.api';
import { customStylesApi } from '../api/customstyles.api';
import { CinematicConfigurationFields } from '../components/project/CinematicFields';

const PRESET_STYLES = [
  { value: 'Cinematic Realism', label: 'Cinematic Realism' },
  { value: 'Anime Epic', label: 'Anime Epic' },
  { value: 'Documentary Gritty', label: 'Documentary Gritty' },
  { value: 'Painterly Fantasy', label: 'Painterly Fantasy' },
  { value: 'Sci-Fi Noir', label: 'Sci-Fi Noir' },
  { value: 'Architectural Minimalism', label: 'Architectural Minimalism' },
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

const PROFILE_LABELS: Record<string, string> = {
  auto: 'Auto',
  viral_story: 'Viral Story',
  documentary: 'Documentary',
  industry_profile: 'Industry Profile',
  product_showcase: 'Product Showcase',
  tutorial: 'Tutorial',
  listicle: 'Listicle',
  narrative_fiction: 'Narrative Fiction',
  cinematic_series: 'Movie / Cinematic Series',
  episodic_animated_story: 'Episodic Animated Story',
  kids_educational_story: 'Kids Educational / Cartoon Story',
  historical_deep_dive: 'Historical Deep-Dive / Mini-Doc',
  vlog_day_in_life: 'Vlog / Day-in-the-Life',
};

const TYPE_LABELS: Record<string, string> = {
  auto: 'Auto',
  documentary: 'Documentary / Explainer',
  narrative: 'Narrative (characters)',
  presenter: 'Presenter / Talking-head',
  montage: 'Montage / B-Roll Driven',
};

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const projects = useProjectStore((s) => s.projects);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const createProject = useProjectStore((s) => s.createProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const duplicateProject = useProjectStore((s) => s.duplicateProject);
  const selectProject = useProjectStore((s) => s.selectProject);
  
  const stats = useSettingsStore((s) => s.stats);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const settings = useSettingsStore((s) => s.settings);

  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const formatModelName = (modelName: string) => {
    if (!modelName) return 'Unknown Model';
    return modelName
      .replace('models/', '')
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const handleDuplicate = async (projectId: string, title: string) => {
    try {
      const duplicated = await duplicateProject(projectId);
      toast.success(`Visual universe duplicated from "${title}"!`);
      selectProject(duplicated.id);
      navigate(`/projects/${duplicated.id}/bible`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to duplicate project');
    }
  };

  // Load projects and settings on mount
  useEffect(() => {
    fetchProjects();
    fetchSettings();
  }, [fetchProjects, fetchSettings]);

  // State for brief generation
  const [brief, setBrief] = useState<any>(null);
  const [briefLoadingState, setBriefLoadingState] = useState<'idle' | 'researching' | 'writing' | 'failed'>('idle');
  const [blueprintExpanded, setBlueprintExpanded] = useState(false);
  const [briefStyle, setBriefStyle] = useState<any>(null);
  const [showStyleOverride, setShowStyleOverride] = useState(false);
  const [styleCollapsed, setStyleCollapsed] = useState(false);
  const [customStyles, setCustomStyles] = useState<any[]>([]);

  useEffect(() => {
    if (isCreateOpen) {
      customStylesApi.getAll().then((res) => {
        setCustomStyles(res);
      }).catch(err => console.error('Failed to load custom styles', err));
    }
  }, [isCreateOpen]);

  // React Hook Form for creation
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(projectCreateSchema),
    defaultValues: {
      title: '',
      topic: '',
      visual_style: settings?.defaultVisualStyle || 'Cinematic Realism',
      style_id: '',
      narration_language: settings?.defaultLanguage || 'English',
      region: 'auto',
      aspect_ratio: (settings?.defaultAspectRatio || '16:9') as any,
      content_type: 'auto',
      content_profile: 'viral_story',
      concept_brief: '',
    },
  });

  const [movieGenre, setMovieGenre] = useState('Sci-fi');
  const [customMovieGenre, setCustomMovieGenre] = useState('');
  const [movieFormat, setMovieFormat] = useState<'single_movie' | 'episode_series' | 'season_based_series'>('single_movie');
  const [movieDuration, setMovieDuration] = useState(10);
  const [movieVisualStyle, setMovieVisualStyle] = useState('Cinematic realism');
  const [customMovieVisualStyle, setCustomMovieVisualStyle] = useState('');
  const [seasonNumber, setSeasonNumber] = useState<number>(1);
  const [episodeNumber, setEpisodeNumber] = useState<number>(1);

  const watchTitle = watch('title');
  const selectedProfile = watch('content_profile') || 'viral_story';
  const selectedType = watch('content_type') || 'auto';
  const isCoherent = isProfileTypeCoherent(selectedProfile, selectedType);

  useEffect(() => {
    if (selectedProfile === 'cinematic_series') {
      const finalStyle = movieVisualStyle === 'Custom' ? customMovieVisualStyle : movieVisualStyle;
      setValue('visual_style', finalStyle || 'Cinematic realism');
    }
  }, [selectedProfile, movieVisualStyle, customMovieVisualStyle, setValue]);

  const handleGenerateBrief = async () => {
    if (!watchTitle || watchTitle.trim() === '') {
      toast.error('Please enter a title seed first.');
      return;
    }
    setBriefLoadingState('researching');
    
    // Simulate research step transition for UI progression
    const timer = setTimeout(() => {
      setBriefLoadingState('writing');
    }, 2000);

    try {
      const language = watch('narration_language') || settings?.defaultLanguage || 'English';
      const region = watch('region') || 'auto';
      const response = await projectsApi.generateConcept({
        title: watchTitle,
        language,
        region,
        content_profile: watch('content_profile') || 'viral_story',
        content_type: watch('content_type') || 'auto',
      });

      clearTimeout(timer);

      if (response && response.success && response.brief) {
        const generatedBrief = response.brief;
        setValue('topic', generatedBrief.project_topic);
        
        const userProfile = watch('content_profile') || 'viral_story';
        const userType = watch('content_type') || 'auto';

        if (userProfile === 'auto') {
          setValue('content_type', generatedBrief.content_type || 'documentary');
          setValue('content_profile', generatedBrief.content_profile || 'viral_story');
        } else {
          if (userType === 'auto') {
            setValue('content_type', generatedBrief.content_type || 'documentary');
          }
        }

        const finalBrief = {
          ...generatedBrief,
          content_type: watch('content_type'),
          content_profile: watch('content_profile')
        };
        setBrief(finalBrief);
        setValue('concept_brief', JSON.stringify(finalBrief));
        
        if (response.style) {
          setBriefStyle(response.style);
          setValue('visual_style', response.style.visual_style);
          setValue('style_id', response.style.style_id || '');
        }

        toast.success('Concept brief generated!');
        setBriefLoadingState('idle');
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err: any) {
      clearTimeout(timer);
      setBriefLoadingState('failed');
      toast.error(err.message || 'Failed to generate brief');
    }
  };

  const handleTitleChipClick = async (chosenTitle: string) => {
    setValue('title', chosenTitle);
    if (!brief) return;

    setBriefLoadingState('writing');
    try {
      const language = watch('narration_language') || settings?.defaultLanguage || 'English';
      const region = watch('region') || 'auto';
      const response = await projectsApi.regenerateConceptTopic({
        title: watchTitle,
        chosenTitle,
        language,
        region,
        current_content_type: brief.content_type,
        content_profile: watch('content_profile') || 'viral_story',
      });

      if (response && response.success) {
        const updatedBrief = {
          ...brief,
          content_type: response.content_type,
          project_topic: response.topic,
          engagement_blueprint: response.engagement_blueprint,
        };
        setBrief(updatedBrief);
        setValue('topic', response.topic);
        setValue('content_type', response.content_type);
        setValue('concept_brief', JSON.stringify(updatedBrief));

        if (response.style) {
          setBriefStyle(response.style);
          setValue('visual_style', response.style.visual_style);
          setValue('style_id', response.style.style_id || '');
        }

        toast.success('Topic regenerated for chosen title!');
        setBriefLoadingState('idle');
      } else {
        throw new Error('Failed to regenerate topic');
      }
    } catch (err: any) {
      setBriefLoadingState('idle');
      toast.error(err.message || 'Failed to regenerate topic');
    }
  };

  const handleCloseCreate = () => {
    setIsCreateOpen(false);
    reset();
    setBrief(null);
    setBriefStyle(null);
    setShowStyleOverride(false);
    setStyleCollapsed(false);
  };

  const handleOverrideChange = (val: string) => {
    if (!val) return;
    const parts = val.split(':');
    const type = parts[0];
    const idOrName = parts.slice(1).join(':');

    if (type === 'preset') {
      setValue('visual_style', idOrName);
      setValue('style_id', '');
      setBriefStyle({
        visual_style: idOrName,
        style_name: idOrName,
        style_id: '',
        origin: 'matched',
      });
      toast.success(`Overridden with preset style: ${idOrName}`);
    } else if (type === 'custom') {
      const matched = customStyles.find((s) => s.id === idOrName);
      if (matched) {
        setValue('visual_style', matched.description);
        setValue('style_id', matched.id);
        setBriefStyle({
          visual_style: matched.description,
          style_name: matched.name,
          style_id: matched.id,
          origin: 'matched',
        });
        toast.success(`Overridden with custom style: ${matched.name}`);
      }
    }
  };

  const onSubmit = async (data: any) => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const isCinematic = data.content_profile === 'cinematic_series';
      
      const payload: any = {
        ...data,
        content_type: isCinematic ? 'narrative' : (data.content_type || 'auto'),
        content_profile: data.content_profile || undefined,
      };

      if (isCinematic) {
        const finalGenre = movieGenre === 'Custom' ? customMovieGenre : movieGenre;
        const finalStyle = movieVisualStyle === 'Custom' ? customMovieVisualStyle : movieVisualStyle;
        payload.visual_style = finalStyle;
        payload.target_duration_minutes = movieDuration;
        payload.movie_config = {
          format: movieFormat,
          genre: finalGenre,
          tone: ['High-energy'],
          story_engine_focus: {
            combat: true,
            world_exploration: false,
            monster_action: false,
            hero_journey: false,
            season_continuity: false
          },
          season_number: seasonNumber,
          episode_number: episodeNumber,
        };
      }

      const newProject = await createProject(payload);
      toast.success(`Project "${newProject.title}" created!`);
      setIsCreateOpen(false);
      reset();
      setBrief(null);
      setBriefStyle(null);
      setShowStyleOverride(false);
      setStyleCollapsed(false);
      // Select the project in the store and navigate to its setup page
      selectProject(newProject.id);
      navigate(`/projects/${newProject.id}/setup`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteProject(deleteTarget.id);
      toast.success(`Project "${deleteTarget.title}" deleted.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete project');
    } finally {
      setDeleteTarget(null);
    }
  };

  // Filter projects by search
  const filteredProjects = projects.filter(
    (p) =>
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.topic.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCardClick = (projectId: string) => {
    selectProject(projectId);
    const project = projects.find((p) => p.id === projectId);
    if (!project) {
      navigate(`/projects/${projectId}/setup`);
      return;
    }

    switch (project.status) {
      case 'setup':
        navigate(`/projects/${projectId}/setup`);
        break;
      case 'planning':
        navigate(`/projects/${projectId}/planning`);
        break;
      case 'bible':
        navigate(`/projects/${projectId}/bible`);
        break;
      case 'script':
        navigate(`/projects/${projectId}/script`);
        break;
      case 'scenes':
        navigate(`/projects/${projectId}/scenes`);
        break;
      case 'prompts':
        navigate(`/projects/${projectId}/prompts`);
        break;
      case 'complete':
        if (project.has_metadata) {
          navigate(`/projects/${projectId}/metadata`);
        } else {
          navigate(`/projects/${projectId}/export`);
        }
        break;
      default:
        navigate(`/projects/${projectId}/setup`);
        break;
    }
  };

  // Maps project status to display name and badge variant
  const statusConfig: Record<string, { label: string; variant: 'gray' | 'blue' | 'purple' | 'amber' | 'green' | 'emerald' }> = {
    setup: { label: 'Setup', variant: 'gray' },
    planning: { label: 'Story Plan', variant: 'blue' },
    bible: { label: 'Bible Lock', variant: 'blue' },
    script: { label: 'Script Sync', variant: 'purple' },
    scenes: { label: 'Scenes Drafted', variant: 'amber' },
    prompts: { label: 'Prompts Locked', variant: 'green' },
    complete: { label: 'Finished', variant: 'emerald' },
  };

  return (
    <div className="space-y-8 select-none">
      {/* Top Banner and welcome */}
      <PageHeader
        title="Viral Video Studio AI"
        description="Launch an autonomous team of multi-agents. Orchestrate the pipeline from Production Bible and scripts to storyboards and Veo technical prompts."
        actions={
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setValue('content_profile', 'cinematic_series');
                setValue('content_type', 'narrative');
                setIsCreateOpen(true);
              }}
              className="flex items-center gap-1.5 cursor-pointer bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Clapperboard className="w-4 h-4" />
              <span>New Movie / Series</span>
            </Button>
            <Button
              onClick={() => {
                setValue('content_profile', 'viral_story');
                setValue('content_type', 'auto');
                setIsCreateOpen(true);
              }}
              className="flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>New Project</span>
            </Button>
          </div>
        }
      />

      {/* Model Quota Usage Progress Card */}
      {stats?.modelUsage && (
        <Card className="bg-[#111118]/60 border border-[#2A2A38] p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg shrink-0">
                <Cpu className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Selected Model:</span>
                  <span className="text-indigo-400 font-mono bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-900/30 text-xs">
                    {formatModelName(stats.modelUsage.model)}
                  </span>
                </h4>
                <p className="text-xs text-gray-400 mt-0.5">
                  Real-time quota monitoring based on API rate limits and local agent telemetry
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-6 text-right">
              <div>
                <div className="text-sm font-bold text-white">
                  {Math.round(100 - (stats.modelUsage.tokensUsed / stats.modelUsage.tokensLimit) * 100)}%
                </div>
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  Token Quota Left
                </div>
              </div>
              <div className="border-l border-[#2A2A38] h-8" />
              <div>
                <div className="text-sm font-bold text-white">
                  {Math.round(100 - (stats.modelUsage.requestsUsed / stats.modelUsage.requestsLimit) * 100)}%
                </div>
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  Request Quota Left
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {/* Tokens Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-gray-400">Token Usage</span>
                <span className="text-gray-300 font-mono">
                  {stats.modelUsage.tokensUsed.toLocaleString()} / {stats.modelUsage.tokensLimit.toLocaleString()} tokens
                </span>
              </div>
              <div className="h-2 w-full bg-[#1A1A26] rounded-full overflow-hidden border border-[#2A2A38]/50">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(99,102,241,0.5)]" 
                  style={{ width: `${Math.min(100, (stats.modelUsage.tokensUsed / stats.modelUsage.tokensLimit) * 100)}%` }}
                />
              </div>
            </div>

            {/* Requests Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-gray-400">Request Usage (24h)</span>
                <span className="text-gray-300 font-mono">
                  {stats.modelUsage.requestsUsed} / {stats.modelUsage.requestsLimit} requests
                </span>
              </div>
              <div className="h-2 w-full bg-[#1A1A26] rounded-full overflow-hidden border border-[#2A2A38]/50">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(16,185,129,0.5)]" 
                  style={{ width: `${Math.min(100, (stats.modelUsage.requestsUsed / stats.modelUsage.requestsLimit) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* System Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card className="flex items-center gap-4 bg-[#111118]/40">
          <div className="p-3 bg-[#6C63FF]/10 text-[#6C63FF] border border-[#6C63FF]/20 rounded-xl shrink-0">
            <Video className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="text-xl font-black text-white leading-none">
              {stats?.projectCount ?? projects.length}
            </div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">
              Active Packages
            </p>
          </div>
        </Card>

        <Card className="flex items-center gap-4 bg-[#111118]/40">
          <div className="p-3 bg-green-500/10 text-green-400 border border-green-500/20 rounded-xl shrink-0">
            <Clapperboard className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xl font-black text-white leading-none">
              {stats?.totalPrompts ?? 0}
            </div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">
              Veo Prompts Locked
            </p>
          </div>
        </Card>

        <Card className="flex items-center gap-4 bg-[#111118]/40">
          <div className="p-3 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl shrink-0">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xl font-black text-white leading-none">
              {stats?.dbSize ?? '0.00 MB'}
            </div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">
              Local DB Storage
            </p>
          </div>
        </Card>
      </div>

      {/* Projects Title and Search Filter */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[#2A2A38] pb-4">
        <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400">
          Recent Projects
        </h3>
        <div className="relative w-full md:w-80">
          <input
            type="text"
            placeholder="Search projects or topics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#111118] border border-[#2A2A38] rounded-lg text-sm text-white focus:outline-none focus:border-[#6C63FF] transition-all placeholder-gray-600"
          />
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
        </div>
      </div>

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <EmptyState
          title="No Projects Found"
          description={
            searchQuery
              ? `No projects found matching "${searchQuery}". Clear your search or create a new project.`
              : 'Start your creative pipeline journey! Create your first video project to begin.'
          }
          actionLabel={searchQuery ? 'Clear Search' : 'Create First Project'}
          onAction={searchQuery ? () => setSearchQuery('') : () => setIsCreateOpen(true)}
          icon={Film}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {filteredProjects.map((p) => {
            const config = statusConfig[p.status] || { label: p.status, variant: 'gray' };
            return (
              <Card
                key={p.id}
                hoverable
                onClick={() => handleCardClick(p.id)}
                className="flex flex-col justify-between h-52 group cursor-pointer"
              >
                <div className="space-y-2.5">
                  <div className="flex justify-between items-start gap-4">
                    <h4 className="font-bold text-sm text-white group-hover:text-[#6C63FF] transition-colors truncate w-full">
                      {p.title}
                    </h4>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicate(p.id, p.title);
                        }}
                        className="p-1 text-gray-500 hover:text-emerald-500 hover:bg-emerald-950/20 rounded transition-all cursor-pointer"
                        title="Duplicate Visual Universe"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget({ id: p.id, title: p.title });
                        }}
                        className="p-1 text-gray-500 hover:text-rose-500 hover:bg-rose-950/20 rounded transition-all cursor-pointer"
                        title="Delete project"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">
                    {p.topic}
                  </p>
                </div>

                <div className="space-y-3 pt-3 border-t border-[#2A2A38]/50">
                  <div className="flex items-center justify-between text-[10px] text-gray-500 font-mono">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-[#6C63FF]" />
                      <span>{formatRelativeDate(p.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={p.content_profile === 'cinematic_series' ? 'purple' : 'gray'}>
                        {p.content_profile === 'cinematic_series' ? 'Movie Series' : 'Viral Video'}
                      </Badge>
                      <Badge variant={config.variant}>{config.label}</Badge>
                      {p.has_metadata === 1 && (
                        <Badge variant="brand" className="text-[9px] py-0 px-1 font-semibold">SEO Meta</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* CREATE PROJECT MODAL */}
      <Modal isOpen={isCreateOpen} onClose={handleCloseCreate} title="Create New Project" size="xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Input
                label="Project Title / Seed"
                placeholder="e.g. Quantum Supremacy Explained"
                error={errors.title?.message}
                {...register('title')}
              />
            </div>
            {selectedProfile !== 'cinematic_series' && (
              <Button
                type="button"
                variant="outline"
                disabled={briefLoadingState !== 'idle' || !watchTitle || watchTitle.trim() === ''}
                onClick={handleGenerateBrief}
                className="h-10 border-[#3A3A4D] hover:bg-[#6C63FF]/20 text-white flex items-center gap-1.5 shrink-0"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Generate Brief</span>
              </Button>
            )}
          </div>

          {/* Staged Loader */}
          {briefLoadingState !== 'idle' && selectedProfile !== 'cinematic_series' && (
            <div className="p-4 bg-[#1A1A24]/60 border border-[#2A2A38] rounded-lg flex items-center gap-3">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#6C63FF] border-t-transparent"></div>
              <span className="text-xs font-bold text-gray-300">
                {briefLoadingState === 'researching' ? 'Researching facts… (Pass 1)' : 'Writing brief… (Pass 2)'}
              </span>
            </div>
          )}

          {/* Title Chips */}
          {brief && brief.titles && brief.titles.length > 0 && selectedProfile !== 'cinematic_series' && (
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">
                AI Generated Title Angles (Select one to regenerate brief details)
              </label>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1.5 bg-[#0A0A0F] rounded-lg border border-[#2A2A38]">
                {brief.titles.map((titleOption: any, i: number) => {
                  const isSelected = watchTitle === titleOption.text;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleTitleChipClick(titleOption.text)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#6C63FF]/20 border-[#6C63FF] text-white'
                          : 'bg-[#111118] border-[#2A2A38] text-gray-400 hover:border-gray-500 hover:text-white'
                      }`}
                    >
                      <span className="mr-1">{titleOption.text}</span>
                      <span className="px-1 py-0.5 rounded-md bg-[#1A1A24] text-[9px] font-mono text-amber-400 font-bold border border-[#2A2A38]">
                        ★ {titleOption.click_score}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Language & Region Selects */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Narration Language"
              options={LANGUAGES}
              error={errors.narration_language?.message}
              {...register('narration_language')}
            />
            <Select
              label="Target Region"
              options={REGIONS}
              error={errors.region?.message}
              {...register('region')}
            />
          </div>

          {/* Profile & Type Selects */}
          {selectedProfile === 'cinematic_series' ? (
            <div className="space-y-4">
              <div className="p-3 bg-purple-950/20 border border-purple-500/20 rounded-lg flex items-center justify-between text-xs text-purple-400">
                <div className="flex items-center gap-2">
                  <Clapperboard className="w-4.5 h-4.5 text-purple-500" />
                  <span className="font-bold uppercase tracking-wider">Mode: Movie / Cinematic Series</span>
                </div>
                <span className="text-[10px] bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded text-purple-300 font-bold uppercase tracking-widest">Locked</span>
              </div>
              
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

              {/* hidden fields to satisfy form fields */}
              <input type="hidden" {...register('content_profile')} />
              <input type="hidden" {...register('content_type')} />
              <input type="hidden" {...register('concept_brief')} />
              <input type="hidden" {...register('style_id')} />
              <input type="hidden" {...register('visual_style')} />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Content Profile (Format & Intent)"
                options={[
                  { value: 'auto', label: 'Auto (auto-select profile & type)' },
                  { value: 'viral_story', label: 'Viral Story (High Energy)' },
                  { value: 'documentary', label: 'Documentary (Measured)' },
                  { value: 'industry_profile', label: 'Industry Profile / Business Explainer' },
                  { value: 'product_showcase', label: 'Product / Service Showcase' },
                  { value: 'tutorial', label: 'Tutorial (Step-by-step)' },
                  { value: 'listicle', label: 'Listicle (Countdown/List)' },
                  { value: 'narrative_fiction', label: 'Narrative Fiction (Emotional Payoff)' },
                  { value: 'cinematic_series', label: 'Movie / Cinematic Series' },
                  { value: 'episodic_animated_story', label: 'Episodic Animated Story' },
                  { value: 'kids_educational_story', label: 'Kids Educational / Cartoon Story' },
                  { value: 'historical_deep_dive', label: 'Historical Deep-Dive / Mini-Doc' },
                  { value: 'vlog_day_in_life', label: 'Vlog / Day-in-the-Life' },
                ]}
                error={(errors as any).content_profile?.message}
                {...register('content_profile')}
              />
              <Select
                label="Content Type (Video Structure)"
                options={[
                  { value: 'auto', label: 'Auto (let the planner decide)' },
                  { value: 'documentary', label: 'Documentary / Explainer' },
                  { value: 'narrative', label: 'Narrative (characters)' },
                  { value: 'presenter', label: 'Presenter / Talking-head' },
                  { value: 'montage', label: 'Montage / B-Roll Driven' },
                ]}
                error={errors.content_type?.message}
                {...register('content_type')}
              />

              {!isCoherent && (
                <div className="md:col-span-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
                  <span className="font-semibold text-amber-400">⚠️ Incoherent Combination:</span> The selected Content Profile (<strong>{PROFILE_LABELS[selectedProfile] || selectedProfile}</strong>) is not typically paired with the Video Structure (<strong>{TYPE_LABELS[selectedType] || selectedType}</strong>). This may lead to unexpected results during generation.
                </div>
              )}
              
              {/* hidden field to persist the brief */}
              <input type="hidden" {...register('concept_brief')} />
              <input type="hidden" {...register('style_id')} />
              {!briefStyle && <input type="hidden" {...register('visual_style')} />}
            </div>
          )}

          <Textarea
            label={selectedProfile === 'cinematic_series' ? 'Core Story Idea (this episode)' : 'Video Topic & Goal Description'}
            placeholder={
              selectedProfile === 'cinematic_series'
                ? 'e.g. In a post-apocalyptic desert, a lone technician discovers a buried spaceship that holds the key to restoring the oceans...'
                : 'e.g. A suspenseful science video showing the history and future of quantum supremacy. Make it look like a neon-cyberpunk movie with high stakes narrative. Keep narration simple.'
            }
            error={errors.topic?.message}
            className="h-40 font-mono text-xs leading-relaxed"
            {...register('topic')}
          />

          {/* Visual Style Card */}
          {briefStyle && selectedProfile !== 'cinematic_series' && (
            <div className="border border-[#2A2A38] rounded-lg overflow-hidden bg-[#111118]">
              <div className="flex items-center justify-between px-4 py-3 bg-[#1A1A24]/40 border-b border-[#2A2A38]">
                <div className="flex items-center gap-2">
                  <Film className="w-4 h-4 text-[#6C63FF]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-white">Visual Style Selection</span>
                </div>
                {briefStyle.origin === 'matched' ? (
                  <Badge variant="green" className="text-[10px] font-semibold py-0.5 px-2">
                    ✓ Matched from library
                  </Badge>
                ) : (
                  <Badge variant="purple" className="text-[10px] font-semibold py-0.5 px-2">
                    ✨ New style created & saved
                  </Badge>
                )}
              </div>
              
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-300">{briefStyle.style_name}</span>
                  <button
                    type="button"
                    onClick={() => setShowStyleOverride(!showStyleOverride)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer underline decoration-dotted"
                  >
                    Pick from library / preset
                  </button>
                </div>

                {showStyleOverride && (
                  <div className="bg-[#0A0A0F] p-3 rounded-lg border border-[#2A2A38] space-y-3">
                    <Select
                      label="Override Style"
                      options={[
                        { value: '', label: '-- Select style to override --' },
                        ...PRESET_STYLES.map(s => ({ value: `preset:${s.value}`, label: `Preset: ${s.label}` })),
                        ...customStyles.map(s => ({ value: `custom:${s.id}`, label: `Library: ${s.name}` }))
                      ]}
                      value={briefStyle.style_id ? `custom:${briefStyle.style_id}` : PRESET_STYLES.some(p => p.value === briefStyle.style_name) ? `preset:${briefStyle.style_name}` : ''}
                      onChange={(e) => handleOverrideChange(e.target.value)}
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Style Description (Veo 3.1 compatible)</label>
                    <button
                      type="button"
                      onClick={() => setStyleCollapsed(!styleCollapsed)}
                      className="text-xs text-gray-400 hover:text-white flex items-center gap-1 cursor-pointer font-semibold"
                    >
                      {styleCollapsed ? 'Show Description' : 'Hide Description'}
                    </button>
                  </div>
                  {!styleCollapsed && (
                    <Textarea
                      placeholder="Describe the Veo 3.1 style..."
                      className="h-28 font-mono text-xs leading-relaxed mt-1"
                      error={errors.visual_style?.message}
                      {...register('visual_style')}
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Collapsible Engagement Blueprint */}
          {brief && brief.engagement_blueprint && selectedProfile !== 'cinematic_series' && (
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

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={handleCloseCreate}>
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating} isLoading={isCreating}>
              {isCreating ? 'Creating...' : 'Create & Proceed'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* DELETE CONFIRMATION DIALOG */}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Video Project"
        message={`Are you sure you want to permanently delete the project "${deleteTarget?.title}"? This will delete all generated production assets, scripts, scenes, and prompts, and cannot be undone.`}
        confirmLabel="Delete Project"
        variant="danger"
      />
    </div>
  );
};
export default Dashboard;
