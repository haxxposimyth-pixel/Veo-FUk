import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProject } from '../hooks/useProject';
import { useAgent } from '../hooks/useAgent';
import { useUiStore } from '../store/ui.store';
import { useSettingsStore } from '../store/settings.store';
import { bibleApi } from '../api/bible.api';
import { scriptApi } from '../api/script.api';
import { productionBibleAgentOutputSchema } from 'shared';
import PageHeader from '../components/layout/PageHeader';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import StreamingText from '../components/agent/StreamingText';
import {
  Users,
  MapPin,
  Package,
  RotateCcw,
  BookOpen,
  ArrowRight,
  Code,
  Flame,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export const ProductionBible: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { bible, fetchProjectDetails, updateBible } = useProject();
  const { invokeAgent, isRunning } = useAgent();
  const activeAgentRun = useUiStore((s) => s.activeAgentRun);
  const settings = useSettingsStore((s) => s.settings);

  const [activeTab, setActiveTab] = useState<'characters' | 'locations' | 'objects' | 'style'>('characters');
  const [isJsonOpen, setIsJsonOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [isRegenOpen, setIsRegenOpen] = useState(false);
  const [expandedLocks, setExpandedLocks] = useState<Record<string, boolean>>({});
  const [isRepairing, setIsRepairing] = useState(false);

  const toggleLock = (charId: string) => {
    setExpandedLocks(prev => ({
      ...prev,
      [charId]: !prev[charId]
    }));
  };

  // Scroll target reference for navigation
  const charactersRef = useRef<HTMLDivElement>(null);
  const locationsRef = useRef<HTMLDivElement>(null);
  const objectsRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (id) {
      fetchProjectDetails(id);
    }
  }, [id, fetchProjectDetails]);

  // Sync JSON text when bible state updates
  useEffect(() => {
    if (bible) {
      setJsonText(JSON.stringify(bible, null, 2));
    }
  }, [bible]);

  const scrollToSection = (section: 'characters' | 'locations' | 'objects' | 'style') => {
    setActiveTab(section);
    const ref = {
      characters: charactersRef,
      locations: locationsRef,
      objects: objectsRef,
      style: styleRef,
    }[section];
    
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleJsonSave = async () => {
    if (!id) return;
    try {
      const parsed = JSON.parse(jsonText);
      // Validate schema
      const validated = productionBibleAgentOutputSchema.parse(parsed);
      await updateBible(validated as any);
      toast.success('Production Bible updated manually!');
      setIsJsonOpen(false);
    } catch (err: any) {
      if (err.errors) {
        toast.error(`Schema Validation Error: ${err.errors[0]?.path?.join('.')} - ${err.errors[0]?.message}`);
      } else {
        toast.error(`JSON Parse Error: ${err.message}`);
      }
    }
  };

  const handleRegenerateBible = async () => {
    if (!id) return;
    setIsRegenOpen(false);
    await invokeAgent(id, 'ProductionBibleAgent', async () => {
      await bibleApi.regenerateBible(id);
    });
  };

  const handleGenerateBible = async () => {
    if (!id) return;
    await invokeAgent(id, 'ProductionBibleAgent', async () => {
      await bibleApi.generateBible(id);
    });
  };

  const handleRepairObjects = async () => {
    if (!id) return;
    setIsRepairing(true);
    try {
      await invokeAgent(id, 'ProductionBibleAgent_ObjectRepair', async () => {
        const res = await bibleApi.repairObjects(id);
        if (res.addedCount > 0) {
          toast.success(`Added ${res.addedCount} new objects to registry.`);
        } else {
          toast.success(`No new objects added. Object registry already has ${res.updatedCount} items.`);
        }
        await fetchProjectDetails(id);
      });
    } catch (err: any) {
      toast.error(err.message || 'Failed to repair object registry.');
    } finally {
      setIsRepairing(false);
    }
  };

  const handleGenerateScript = async () => {
    if (!id) return;
    await invokeAgent(id, 'ScriptAgent', async () => {
      await scriptApi.generateScript(id);
    });
    navigate(`/projects/${id}/script`);
  };

  const hasApiKey = !!settings?.apiKey;

  return (
    <div className="space-y-8 select-none">
      <PageHeader
        title="Production Bible"
        description="The core blueprint of the project universe. Defines characters, locations, symbolic objects, and technical style guides that constrain subsequent agents."
        actions={
          <div className="flex items-center gap-3">
            {bible && (
              <>
                <Button variant="secondary" size="sm" onClick={() => navigate(`/projects/${id}/setup`)} className="flex items-center gap-1.5 cursor-pointer">
                  <span>Edit Setup & Topic</span>
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setIsJsonOpen(true)} className="flex items-center gap-1.5 cursor-pointer">
                  <Code className="w-3.5 h-3.5" />
                  <span>JSON Editor</span>
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setIsRegenOpen(true)} className="flex items-center gap-1.5 text-rose-400 hover:text-rose-300 cursor-pointer">
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Regenerate</span>
                </Button>
                <Button onClick={handleGenerateScript} disabled={!hasApiKey || isRunning} className="flex items-center gap-1.5 cursor-pointer">
                  <BookOpen className="w-4 h-4" />
                  <span>Generate Narration Script</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* RENDER RUNNING STREAM VIEW */}
      {activeAgentRun && activeAgentRun.agentName === 'ProductionBibleAgent' ? (
        <div className="space-y-4">
          <div className="p-4 bg-[#6C63FF]/5 border border-[#6C63FF]/15 rounded-xl flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-bold uppercase tracking-wider text-[#6C63FF]">
                Production Bible Agent is running
              </span>
              <p className="text-[11px] text-gray-400">
                Drafting setting guides, characters, objects, and visual parameters in background...
              </p>
            </div>
          </div>
          <StreamingText text={activeAgentRun.progressText} title="Bible Generator Console Stream" />
        </div>
      ) : !bible ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center p-12 border border-dashed border-[#2A2A38] rounded-xl bg-[#111118]/30 max-w-lg mx-auto space-y-4">
          <BookOpen className="w-12 h-12 text-[#6C63FF]" />
          <div className="text-center space-y-1">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Production Bible Required</h4>
            <p className="text-xs text-gray-400 leading-relaxed">
              No Production Bible exists for this project yet. Execute Agent 1 to compile the Production Bible using your approved Story Plan.
            </p>
          </div>
          <div className="flex gap-3">
            <Button onClick={handleGenerateBible} disabled={!hasApiKey || isRunning}>
              Generate Production Bible
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/projects/${id}/planning`)}>
              Back to Story Plan
            </Button>
          </div>
        </div>
      ) : (
        /* Active Display */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sticky left nav */}
          <div className="hidden lg:block space-y-2 shrink-0">
            <div className="sticky top-6 space-y-1 border border-[#2A2A38] rounded-xl p-3 bg-[#111118]/50">
              <button
                onClick={() => scrollToSection('characters')}
                className={`w-full flex items-center gap-3 px-4.5 py-3.5 rounded-lg text-xs font-bold uppercase tracking-wider text-left transition-colors cursor-pointer ${
                  activeTab === 'characters' ? 'bg-[#6C63FF]/10 text-white border border-[#6C63FF]/20' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Characters</span>
              </button>

              <button
                onClick={() => scrollToSection('locations')}
                className={`w-full flex items-center gap-3 px-4.5 py-3.5 rounded-lg text-xs font-bold uppercase tracking-wider text-left transition-colors cursor-pointer ${
                  activeTab === 'locations' ? 'bg-[#6C63FF]/10 text-white border border-[#6C63FF]/20' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <MapPin className="w-4 h-4" />
                <span>Locations</span>
              </button>

              <button
                onClick={() => scrollToSection('objects')}
                className={`w-full flex items-center gap-3 px-4.5 py-3.5 rounded-lg text-xs font-bold uppercase tracking-wider text-left transition-colors cursor-pointer ${
                  activeTab === 'objects' ? 'bg-[#6C63FF]/10 text-white border border-[#6C63FF]/20' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Package className="w-4 h-4" />
                <span>Object Registry</span>
              </button>

              <button
                onClick={() => scrollToSection('style')}
                className={`w-full flex items-center gap-3 px-4.5 py-3.5 rounded-lg text-xs font-bold uppercase tracking-wider text-left transition-colors cursor-pointer ${
                  activeTab === 'style' ? 'bg-[#6C63FF]/10 text-white border border-[#6C63FF]/20' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Flame className="w-4 h-4" />
                <span>Visual Style Lock</span>
              </button>
            </div>
          </div>

          {/* Scrollable Right Pane panels */}
          <div className="lg:col-span-3 space-y-12">
            {/* Characters Roster */}
            <div ref={charactersRef} className="space-y-4 scroll-mt-6">
              <h3 className="text-sm font-bold uppercase tracking-widest text-[#6C63FF] border-b border-[#2A2A38] pb-2">
                Characters Roster
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bible.character_roster?.map((char) => (
                  <Card key={char.id} className="space-y-3">
                    <div className="flex items-center justify-between border-b border-[#2A2A38]/40 pb-2">
                      <h4 className="font-bold text-sm text-white">{char.name}</h4>
                      <Badge variant="blue">{char.id}</Badge>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <p className="text-[11px] text-gray-500 uppercase tracking-widest font-bold">Role</p>
                      <p className="text-gray-300 font-semibold">{char.role}</p>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <p className="text-[11px] text-gray-500 uppercase tracking-widest font-bold">Description</p>
                      <p className="text-gray-400 leading-relaxed">{char.physical_description}</p>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <p className="text-[11px] text-gray-500 uppercase tracking-widest font-bold">Costume</p>
                      <p className="text-gray-400 leading-relaxed">{char.costume_description}</p>
                    </div>
                    {char.appearance_lock && (
                      <div className="pt-2 border-t border-[#2A2A38]/40">
                        <button
                          onClick={() => toggleLock(char.id)}
                          className="w-full flex items-center justify-between text-[11px] text-gray-400 hover:text-white uppercase tracking-widest font-bold py-1 cursor-pointer"
                        >
                          <span>Appearance Lock</span>
                          <span>{expandedLocks[char.id] ? '▼' : '▶'}</span>
                        </button>
                        {expandedLocks[char.id] && (
                          <div className="mt-2 space-y-2.5 text-xs text-gray-300 pl-1">
                            <div className="grid grid-cols-3 gap-2">
                              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Ethnicity</span>
                              <span className="col-span-2 text-gray-300 font-semibold">{char.appearance_lock.ethnicity}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Age</span>
                              <span className="col-span-2 text-gray-300 font-semibold">{char.appearance_lock.approximate_age}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Gender</span>
                              <span className="col-span-2 text-gray-300 font-semibold">{char.appearance_lock.gender}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Skin Tone</span>
                              <span className="col-span-2 text-gray-300 font-semibold">{char.appearance_lock.skin_tone}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Hair</span>
                              <span className="col-span-2 text-gray-300 font-semibold">{char.appearance_lock.hair}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Eyes</span>
                              <span className="col-span-2 text-gray-300 font-semibold">{char.appearance_lock.eyes}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Face Structure</span>
                              <span className="col-span-2 text-gray-300 font-semibold">{char.appearance_lock.face_structure}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Features</span>
                              <span className="col-span-2 text-gray-300 font-semibold">{char.appearance_lock.distinguishing_features}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Clothing</span>
                              <span className="col-span-2 text-gray-300 font-semibold">{char.appearance_lock.primary_clothing}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Colors</span>
                              <div className="col-span-2 flex flex-wrap gap-1.5 items-center">
                                {char.appearance_lock.clothing_colors?.map((color: string, idx: number) => (
                                  <div key={idx} className="flex items-center gap-1 bg-black/30 border border-[#2A2A38]/30 px-1.5 py-0.5 rounded text-[10px]">
                                    <div
                                      style={{ backgroundColor: color }}
                                      className="w-2.5 h-2.5 rounded-sm border border-white/20"
                                    />
                                    <span className="text-gray-400 font-mono">{color}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Era</span>
                              <span className="col-span-2 text-gray-300 font-semibold">{char.appearance_lock.clothing_era}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Accessories</span>
                              <span className="col-span-2 text-gray-300 font-semibold">{char.appearance_lock.accessories}</span>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[10px] text-rose-400 uppercase tracking-widest font-bold">Forbidden Changes</p>
                              <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {char.appearance_lock.forbidden_appearance_changes?.map((change: string, idx: number) => (
                                  <span key={idx} className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded text-[10px] font-semibold">
                                    {change}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>

            {/* Locations Roster */}
            <div ref={locationsRef} className="space-y-4 scroll-mt-6">
              <h3 className="text-sm font-bold uppercase tracking-widest text-[#6C63FF] border-b border-[#2A2A38] pb-2">
                Locations Roster
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bible.location_roster?.map((loc) => (
                  <Card key={loc.id} className="space-y-3">
                    <div className="flex items-center justify-between border-b border-[#2A2A38]/40 pb-2">
                      <h4 className="font-bold text-sm text-white">{loc.name}</h4>
                      <Badge variant="purple">{loc.id}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Type</p>
                        <p className="text-gray-300 font-semibold mt-0.5">{loc.type}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Default Time</p>
                        <p className="text-gray-300 font-semibold mt-0.5">{loc.time_of_day_default}</p>
                      </div>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Atmosphere</p>
                      <p className="text-gray-400 leading-relaxed">{loc.atmosphere}</p>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Visual Signature</p>
                      <p className="text-gray-400 leading-relaxed font-mono bg-black/45 p-2 rounded border border-[#2A2A38]/20">{loc.visual_signature}</p>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            <div ref={objectsRef} className="space-y-4 scroll-mt-6">
              <div className="flex items-center justify-between border-b border-[#2A2A38] pb-2">
                <h3 className="text-sm font-bold uppercase tracking-widest text-[#6C63FF]">
                  Object Registry
                </h3>
                {bible && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleRepairObjects}
                    disabled={!hasApiKey || isRunning || isRepairing}
                    className="flex items-center gap-1.5 cursor-pointer text-xs h-7 py-1 px-3"
                  >
                    {isRepairing ? (
                      <span className="w-3 h-3 border-2 border-t-transparent border-white rounded-full animate-spin" />
                    ) : (
                      <Flame className="w-3.5 h-3.5 text-rose-400" />
                    )}
                    <span>Repair Registry</span>
                  </Button>
                )}
              </div>
              <div className="border border-[#2A2A38] rounded-xl overflow-hidden bg-[#111118]/50">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-[#1A1A24]/60 border-b border-[#2A2A38] text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">
                    <tr>
                      <th className="px-5 py-3">ID</th>
                      <th className="px-5 py-3">Name</th>
                      <th className="px-5 py-3">Description</th>
                      <th className="px-5 py-3">Symbolic Meaning</th>
                      <th className="px-5 py-3">Screen Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2A2A38]/40">
                    {bible.object_registry?.map((obj) => (
                      <tr key={obj.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-5 py-4 font-mono font-bold text-[#6C63FF]">{obj.id}</td>
                        <td className="px-5 py-4 font-bold text-white">{obj.name}</td>
                        <td className="px-5 py-4 text-gray-400 leading-relaxed">{obj.description}</td>
                        <td className="px-5 py-4 text-gray-300 font-semibold">{obj.symbolic_meaning}</td>
                        <td className="px-5 py-4 text-gray-400 font-mono">{obj.screen_time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Visual Style Lock */}
            <div ref={styleRef} className="space-y-4 scroll-mt-6">
              <h3 className="text-sm font-bold uppercase tracking-widest text-[#6C63FF] border-b border-[#2A2A38] pb-2">
                Visual Style Lock
              </h3>
              {bible.visual_style_lock && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left block: Swatches and rules */}
                  <Card className="space-y-5">
                    {/* Swatches */}
                    <div className="space-y-2">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Color Palette</p>
                      <div className="flex gap-2">
                        {bible.visual_style_lock.color_palette?.map((color, idx) => (
                          <div key={idx} className="flex flex-col items-center gap-1 font-mono text-[9px] text-gray-500">
                            <div
                              style={{ backgroundColor: color }}
                              className="w-10 h-10 rounded border border-[#2A2A38]/30 shadow-md"
                              title={color}
                            />
                            <span>{color}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Color Mood</p>
                        <p className="text-gray-300 mt-1 font-semibold">{bible.visual_style_lock.color_mood}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Film Grain</p>
                        <p className="text-gray-300 mt-1 font-semibold">{bible.visual_style_lock.film_grain ? 'Enabled (Film Feel)' : 'Disabled (Clean Digitized)'}</p>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Camera Style</p>
                      <p className="text-gray-400 leading-relaxed font-semibold">{bible.visual_style_lock.camera_movement_style}</p>
                    </div>

                    <div className="space-y-2 text-xs">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Lighting Style</p>
                      <p className="text-gray-400 leading-relaxed font-semibold">{bible.visual_style_lock.lighting_style}</p>
                    </div>
                  </Card>

                  {/* Right block: Exclusions and Veo style tokens */}
                  <Card className="space-y-5">
                    {/* Veo Style Tokens */}
                    <div className="space-y-2.5">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Veo Style Tokens</p>
                      <div className="flex flex-wrap gap-2">
                        {bible.visual_style_lock.veo_style_tokens?.map((token, idx) => (
                          <Badge key={idx} variant="emerald">
                            {token}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Exclusions */}
                    <div className="space-y-2.5">
                      <p className="text-[10px] text-rose-400 uppercase tracking-widest font-bold">Forbidden Elements</p>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {bible.visual_style_lock.forbidden_elements?.map((el, idx) => (
                          <span key={idx} className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded text-[10px] font-semibold">
                            {el}
                          </span>
                        ))}
                      </div>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* JSON TEXT EDITOR MODAL */}
      <Modal isOpen={isJsonOpen} onClose={() => setIsJsonOpen(false)} title="Raw JSON Configuration Editor" size="xl">
        <div className="space-y-4">
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            className="w-full h-96 p-4 bg-black border border-[#2A2A38] text-[#6C63FF] text-xs font-mono rounded-lg focus:outline-none focus:border-[#6C63FF]"
          />
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsJsonOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleJsonSave}>
              Save & Validate Configuration
            </Button>
          </div>
        </div>
      </Modal>

      {/* REGENERATION CONFIRMATION */}
      <ConfirmDialog
        isOpen={isRegenOpen}
        onClose={() => setIsRegenOpen(false)}
        onConfirm={handleRegenerateBible}
        title="Regenerate Production Bible"
        message="Are you sure you want to regenerate the Production Bible? This will overwrite character profiles, location guides, and style settings, requiring subsequent stages of script, scenes, and prompts to be completely regenerated."
        confirmLabel="Regenerate Bible"
        variant="danger"
      />
    </div>
  );
};
export default ProductionBible;
