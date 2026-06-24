import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProject } from '../hooks/useProject';
import { useAgent } from '../hooks/useAgent';
import { useUiStore } from '../store/ui.store';
import { useSettingsStore } from '../store/settings.store';
import { storyPlanApi } from '../api/storyplan.api';
import PageHeader from '../components/layout/PageHeader';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Textarea from '../components/ui/Textarea';
import Input from '../components/ui/Input';
import StreamingText from '../components/agent/StreamingText';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { scriptApi } from '../api/script.api';
import { resolveBibleRefs } from '../utils/resolveBibleRefs';
import {
  Sparkles,
  ListCollapse,
  Users,
  MapPin,
  Package,
  CheckCircle,
  Save,
  Plus,
  Trash2,
  Undo2,
  BookOpen,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { StoryPlanItem } from 'shared';

export const StoryPlanWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { storyPlan, bible, activeProject, script, fetchProjectDetails, updateStoryPlan, approveStoryPlan } = useProject();
  const { invokeAgent, isRunning } = useAgent();
  
  const activeAgentRun = useUiStore((s) => s.activeAgentRun);
  const settings = useSettingsStore((s) => s.settings);

  // Modal open states
  const [isScriptOpen, setIsScriptOpen] = useState(false);
  const [modalPhases, setModalPhases] = useState<any[]>([]);
  const [isScriptLoading, setIsScriptLoading] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);

  // Confirm dialog state for editing with downstream data
  const [pendingAction, setPendingAction] = useState<'save' | 'approve' | null>(null);

  const hasDownstreamData = activeProject && ['script', 'scenes', 'prompts', 'complete'].includes(activeProject.status);
  const showScriptButton = !!script;

  // Local editable form states
  const [outline, setOutline] = useState('');
  const [characters, setCharacters] = useState<StoryPlanItem[]>([]);
  const [locations, setLocations] = useState<StoryPlanItem[]>([]);
  const [objects, setObjects] = useState<StoryPlanItem[]>([]);
  const [videoType, setVideoType] = useState('documentary');

  // Editable entry temp states (for adding new items)
  const [newChar, setNewChar] = useState({ name: '', concept: '' });
  const [newLoc, setNewLoc] = useState({ name: '', concept: '' });
  const [newObj, setNewObj] = useState({ name: '', concept: '' });

  const [activeTab, setActiveTab] = useState<'outline' | 'characters' | 'locations' | 'objects'>('outline');

  useEffect(() => {
    if (id) {
      fetchProjectDetails(id);
    }
  }, [id, fetchProjectDetails]);

  // Sync state from store when storyPlan changes
  useEffect(() => {
    if (storyPlan) {
      setOutline(storyPlan.story_outline || '');
      setCharacters(storyPlan.character_list || []);
      setLocations(storyPlan.location_list || []);
      setObjects(storyPlan.object_list || []);
      setVideoType(storyPlan.video_type || 'documentary');
    }
  }, [storyPlan]);

  const handleGeneratePlan = async () => {
    if (!id) return;
    await invokeAgent(id, 'StoryPlannerAgent', async () => {
      await storyPlanApi.generateStoryPlan(id);
    });
  };

  const handleGeneratePlanClick = () => {
    setShowRegenConfirm(true);
  };

  const executeRegeneratePlan = async () => {
    setShowRegenConfirm(false);
    if (!id) return;
    await invokeAgent(id, 'StoryPlannerAgent', async () => {
      await storyPlanApi.generateStoryPlan(id);
    });
  };

  const handleOpenScriptModal = async () => {
    if (!id) return;
    setIsScriptOpen(true);
    setIsScriptLoading(true);
    try {
      const scriptRes = await scriptApi.getScript(id);
      const scriptData = (typeof scriptRes.raw_json === 'string'
        ? JSON.parse(scriptRes.raw_json)
        : scriptRes.raw_json);
      setModalPhases(scriptData?.phases || []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load script narration.');
      setIsScriptOpen(false);
    } finally {
      setIsScriptLoading(false);
    }
  };

  const executeSavePlan = async () => {
    try {
      await updateStoryPlan({
        story_outline: outline,
        character_list: characters,
        location_list: locations,
        object_list: objects,
        video_type: videoType,
      });
      toast.success('Story Plan saved successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save Story Plan.');
    }
  };

  const executeApprovePlan = async () => {
    try {
      // Auto save first
      await updateStoryPlan({
        story_outline: outline,
        character_list: characters,
        location_list: locations,
        object_list: objects,
        video_type: videoType,
      });
      await approveStoryPlan(true);
      toast.success('Story Plan approved! Proceeding to Production Bible.');
      navigate(`/projects/${id}/bible`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve Story Plan.');
    }
  };

  const handleSavePlan = async () => {
    if (!id) return;
    if (hasDownstreamData) {
      setPendingAction('save');
    } else {
      await executeSavePlan();
    }
  };

  const handleApprovePlan = async () => {
    if (!id) return;
    if (hasDownstreamData) {
      setPendingAction('approve');
    } else {
      await executeApprovePlan();
    }
  };

  const confirmSaveAction = async () => {
    if (pendingAction === 'save') {
      await executeSavePlan();
    } else if (pendingAction === 'approve') {
      await executeApprovePlan();
    }
    setPendingAction(null);
  };

  // List Modification Helpers
  const addCharacter = () => {
    if (!newChar.name.trim() || !newChar.concept.trim()) return;
    setCharacters((prev) => [...prev, { name: newChar.name.trim(), concept: newChar.concept.trim() }]);
    setNewChar({ name: '', concept: '' });
  };

  const removeCharacter = (index: number) => {
    setCharacters((prev) => prev.filter((_, i) => i !== index));
  };

  const addLocation = () => {
    if (!newLoc.name.trim() || !newLoc.concept.trim()) return;
    setLocations((prev) => [...prev, { name: newLoc.name.trim(), concept: newLoc.concept.trim() }]);
    setNewLoc({ name: '', concept: '' });
  };

  const removeLocation = (index: number) => {
    setLocations((prev) => prev.filter((_, i) => i !== index));
  };

  const addObject = () => {
    if (!newObj.name.trim() || !newObj.concept.trim()) return;
    setObjects((prev) => [...prev, { name: newObj.name.trim(), concept: newObj.concept.trim() }]);
    setNewObj({ name: '', concept: '' });
  };

  const removeObject = (index: number) => {
    setObjects((prev) => prev.filter((_, i) => i !== index));
  };

  const hasApiKey = !!settings?.apiKey;

  return (
    <div className="space-y-8 select-none">
      <PageHeader
        title="Story Planning Workspace"
        description="Flesh out the narrative structure, core character profiles, and locations before detail assets are compiled."
        actions={
          <div className="flex items-center gap-3">
            {showScriptButton && (
              <Button
                variant="secondary"
                onClick={handleOpenScriptModal}
                className="flex items-center gap-1.5 cursor-pointer"
              >
                <BookOpen className="w-4 h-4" />
                <span>View Full Script</span>
              </Button>
            )}
            {storyPlan && (
              <>
                <Button variant="ghost" onClick={handleSavePlan} className="flex items-center gap-1.5 cursor-pointer">
                  <Save className="w-4 h-4" />
                  <span>Save Plan</span>
                </Button>
                <Button onClick={handleApprovePlan} className="flex items-center gap-1.5 cursor-pointer">
                  <CheckCircle className="w-4 h-4" />
                  <span>Approve & Proceed</span>
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Main content grid */}
      {!storyPlan && activeAgentRun?.agentName !== 'StoryPlannerAgent' ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center space-y-6">
          <div className="p-4 bg-[#6C63FF]/10 text-[#6C63FF] border border-[#6C63FF]/20 rounded-2xl">
            <Sparkles className="w-8 h-8 animate-pulse" />
          </div>
          <div className="max-w-md space-y-2">
            <h3 className="text-lg font-bold text-white">Generate Story Plan</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Let the Story Planner Agent read your project topic to establish a cohesive story arc, runtime expectations, characters, and key objects.
            </p>
          </div>
          <Button
            onClick={handleGeneratePlan}
            disabled={!hasApiKey || isRunning}
            className="flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Generate Plan</span>
          </Button>
        </Card>
      ) : activeAgentRun?.agentName === 'StoryPlannerAgent' ? (
        <Card className="space-y-6 p-8">
          <div className="flex items-center gap-3 border-b border-[#2A2A38] pb-4">
            <div className="w-3.5 h-3.5 rounded-full bg-[#6C63FF] animate-ping shrink-0" />
            <h4 className="font-bold text-xs uppercase tracking-widest text-gray-400">
              Story Planner Agent Streaming Outline
            </h4>
          </div>
          <StreamingText text={activeAgentRun.progressText} title="Story Planner Generator Console Stream" />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left panel: outline and list tabs */}
          <div className="lg:col-span-2 space-y-6">
            {/* Navigation tabs */}
            <div className="flex items-center gap-2 border-b border-[#2A2A38] pb-1">
              {(['outline', 'characters', 'locations', 'objects'] as const).map((tab) => {
                const config = {
                  outline: { label: 'Outline', icon: ListCollapse },
                  characters: { label: 'Characters', icon: Users },
                  locations: { label: 'Locations', icon: MapPin },
                  objects: { label: 'Objects & Props', icon: Package },
                }[tab];

                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-1.5 px-4 py-2 border-b-2 text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                      activeTab === tab
                        ? 'border-[#6C63FF] text-[#6C63FF]'
                        : 'border-transparent text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    <config.icon className="w-3.5 h-3.5" />
                    <span>{config.label}</span>
                  </button>
                );
              })}
            </div>

            {/* TAB PANES */}
            {activeTab === 'outline' && (
              <Card className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Story Outline</h3>
                <Textarea
                  value={outline}
                  onChange={(e) => setOutline(e.target.value)}
                  className="min-h-[200px]"
                />
              </Card>
            )}

            {activeTab === 'characters' && (
              <Card className="space-y-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Characters</h3>

                {/* Character list */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {characters.map((char, index) => (
                    <div key={index} className="p-4 bg-[#0A0A0F] border border-[#2A2A38] rounded-xl flex justify-between items-start gap-4">
                      <div>
                        <p className="text-sm font-bold text-white">{char.name}</p>
                        <p className="text-xs text-gray-500 mt-1 leading-relaxed">{char.concept}</p>
                      </div>
                      <button
                        onClick={() => removeCharacter(index)}
                        className="p-1 rounded text-gray-650 hover:text-rose-450 hover:bg-rose-500/10 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add character form */}
                <div className="border-t border-[#2A2A38]/50 pt-4 space-y-4">
                  <p className="text-xs font-bold uppercase text-gray-500 tracking-wider">Add New Character</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input
                      placeholder="Character Name"
                      value={newChar.name}
                      onChange={(e) => setNewChar({ ...newChar, name: e.target.value })}
                    />
                    <div className="md:col-span-2 flex items-center gap-3">
                      <input
                        type="text"
                        placeholder="Character concept, role, style..."
                        value={newChar.concept}
                        onChange={(e) => setNewChar({ ...newChar, concept: e.target.value })}
                        className="flex-1 px-4 py-2.5 bg-[#0A0A0F] border border-[#2A2A38] rounded-lg text-sm text-white focus:outline-none focus:border-[#6C63FF] transition-all placeholder-gray-600"
                      />
                      <button
                        onClick={addCharacter}
                        className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {activeTab === 'locations' && (
              <Card className="space-y-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Locations</h3>

                {/* Locations list */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {locations.map((loc, index) => (
                    <div key={index} className="p-4 bg-[#0A0A0F] border border-[#2A2A38] rounded-xl flex justify-between items-start gap-4">
                      <div>
                        <p className="text-sm font-bold text-white">{loc.name}</p>
                        <p className="text-xs text-gray-500 mt-1 leading-relaxed">{loc.concept}</p>
                      </div>
                      <button
                        onClick={() => removeLocation(index)}
                        className="p-1 rounded text-gray-650 hover:text-rose-450 hover:bg-rose-500/10 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add location form */}
                <div className="border-t border-[#2A2A38]/50 pt-4 space-y-4">
                  <p className="text-xs font-bold uppercase text-gray-500 tracking-wider">Add New Location</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input
                      placeholder="Location Name"
                      value={newLoc.name}
                      onChange={(e) => setNewLoc({ ...newLoc, name: e.target.value })}
                    />
                    <div className="md:col-span-2 flex items-center gap-3">
                      <input
                        type="text"
                        placeholder="Location type, atmosphere, lights..."
                        value={newLoc.concept}
                        onChange={(e) => setNewLoc({ ...newLoc, concept: e.target.value })}
                        className="flex-1 px-4 py-2.5 bg-[#0A0A0F] border border-[#2A2A38] rounded-lg text-sm text-white focus:outline-none focus:border-[#6C63FF] transition-all placeholder-gray-600"
                      />
                      <button
                        onClick={addLocation}
                        className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {activeTab === 'objects' && (
              <Card className="space-y-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Objects & Props</h3>

                {/* Objects list */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {objects.map((obj, index) => (
                    <div key={index} className="p-4 bg-[#0A0A0F] border border-[#2A2A38] rounded-xl flex justify-between items-start gap-4">
                      <div>
                        <p className="text-sm font-bold text-white">{obj.name}</p>
                        <p className="text-xs text-gray-500 mt-1 leading-relaxed">{obj.concept}</p>
                      </div>
                      <button
                        onClick={() => removeObject(index)}
                        className="p-1 rounded text-gray-650 hover:text-rose-450 hover:bg-rose-500/10 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add object form */}
                <div className="border-t border-[#2A2A38]/50 pt-4 space-y-4">
                  <p className="text-xs font-bold uppercase text-gray-500 tracking-wider">Add New Object</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input
                      placeholder="Object/Prop Name"
                      value={newObj.name}
                      onChange={(e) => setNewObj({ ...newObj, name: e.target.value })}
                    />
                    <div className="md:col-span-2 flex items-center gap-3">
                      <input
                        type="text"
                        placeholder="Object purpose, meaning, placement..."
                        value={newObj.concept}
                        onChange={(e) => setNewObj({ ...newObj, concept: e.target.value })}
                        className="flex-1 px-4 py-2.5 bg-[#0A0A0F] border border-[#2A2A38] rounded-lg text-sm text-white focus:outline-none focus:border-[#6C63FF] transition-all placeholder-gray-600"
                      />
                      <button
                        onClick={addObject}
                        className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Right panel: pacing settings & stats */}
          <div className="space-y-6">


            {/* Re-generate and restart plan action */}
            <Card className="space-y-3.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Re-plan Narrative</h4>
              <p className="text-[11px] text-gray-500 leading-normal">
                If the current outline is not ideal, you can run the Story Planner Agent again to construct an alternative story structure.
              </p>
              <Button
                variant="outline"
                onClick={handleGeneratePlanClick}
                disabled={isRunning}
                className="w-full flex items-center justify-center gap-1.5 cursor-pointer text-xs"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Re-generate Outline</span>
              </Button>
            </Card>
          </div>
        </div>
      )}

      <Modal
        isOpen={isScriptOpen}
        onClose={() => setIsScriptOpen(false)}
        title="Full Script Narration"
        size="lg"
      >
        {isScriptLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#6C63FF]" />
          </div>
        ) : (
          <div className="space-y-6 max-h-[70vh] pr-2">
            {modalPhases.map((phase) => {
              const displayContent = resolveBibleRefs(phase.narration_text, bible);
              return (
                <div
                  key={phase.phase_number}
                  className="p-4 bg-[#0A0A0F] border border-[#2A2A38] rounded-xl space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-[#2A2A38]/30 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold font-mono text-gray-550 uppercase tracking-wider">
                        Phase {phase.phase_number}
                      </span>
                      <h4 className="text-sm font-bold text-white">{phase.phase_title}</h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="gray">{phase.phase_type}</Badge>
                      <span className="text-[10px] text-gray-500 font-mono">
                        {phase.narration_word_count || 0} words
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {displayContent}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        onConfirm={confirmSaveAction}
        title="Warning"
        message="You have an existing script and production bible. Editing the story plan will not automatically update them. Continue anyway?"
        confirmLabel="Continue"
        cancelLabel="Cancel"
      />

      <ConfirmDialog
        isOpen={showRegenConfirm}
        onClose={() => setShowRegenConfirm(false)}
        onConfirm={executeRegeneratePlan}
        title="Confirm Re-Plan Narrative"
        message="This will replace the current plan and discard your manual edits to the outline, characters, locations, and objects. Continue?"
        confirmLabel="Continue"
        cancelLabel="Cancel"
      />
    </div>
  );
};
export default StoryPlanWorkspace;
