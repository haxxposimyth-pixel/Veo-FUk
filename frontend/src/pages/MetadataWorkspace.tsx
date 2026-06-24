import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAgent } from '../hooks/useAgent';
import { metadataApi } from '../api/metadata.api';
import PageHeader from '../components/layout/PageHeader';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { toast } from 'react-hot-toast';
import { Copy, RefreshCw, Plus, Trash2, Check } from 'lucide-react';
import { useClipboard } from '../hooks/useClipboard';

export const MetadataWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { copy } = useClipboard();
  const { isRunning, invokeAgent } = useAgent();

  const [metadata, setMetadata] = useState<any | null>(null);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);

  // Edit fields
  const [description, setDescription] = useState('');
  const [chapters, setChapters] = useState<Array<{ timestamp: string; label: string }>>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [thumbnailHook, setThumbnailHook] = useState('');

  const loadMetadata = async () => {
    if (!id) return;
    setIsLoadingMetadata(true);
    try {
      const res = await metadataApi.getMetadata(id);
      setMetadata(res);
      setDescription(res.description);
      setChapters(res.chapters ? (typeof res.chapters === 'string' ? JSON.parse(res.chapters) : res.chapters) : []);
      setTags(res.tags ? (typeof res.tags === 'string' ? JSON.parse(res.tags) : res.tags) : []);
      setHashtags(res.hashtags ? (typeof res.hashtags === 'string' ? JSON.parse(res.hashtags) : res.hashtags) : []);
      setThumbnailHook(res.thumbnail_hook);
    } catch (e) {
      setMetadata(null);
    } finally {
      setIsLoadingMetadata(false);
    }
  };

  useEffect(() => {
    loadMetadata();
  }, [id]);

  const handleGenerate = async () => {
    if (!id) return;
    await invokeAgent(id, 'TitleMetadataAgent', async () => {
      await metadataApi.generateMetadata(id);
    });
    await loadMetadata();
  };

  const handleRegenerateTitles = async () => {
    if (!id) return;
    await invokeAgent(id, 'TitleMetadataAgent_Titles', async () => {
      await metadataApi.regenerateTitles(id);
    });
    await loadMetadata();
  };

  const handleSave = async (updatedFields: any) => {
    if (!id) return;
    try {
      const res = await metadataApi.updateMetadata(id, updatedFields);
      setMetadata(res);
      setDescription(res.description);
      setChapters(res.chapters ? (typeof res.chapters === 'string' ? JSON.parse(res.chapters) : res.chapters) : []);
      setTags(res.tags ? (typeof res.tags === 'string' ? JSON.parse(res.tags) : res.tags) : []);
      setHashtags(res.hashtags ? (typeof res.hashtags === 'string' ? JSON.parse(res.hashtags) : res.hashtags) : []);
      setThumbnailHook(res.thumbnail_hook);
    } catch (e: any) {
      toast.error(e.message || 'Failed to save metadata');
    }
  };

  const handleTitleSelect = (titleText: string) => {
    handleSave({ selected_title: titleText });
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value);
  };

  const handleDescriptionBlur = () => {
    handleSave({ description });
  };

  const handleChapterChange = (index: number, field: 'timestamp' | 'label', val: string) => {
    const next = [...chapters];
    next[index] = { ...next[index], [field]: val };
    setChapters(next);
  };

  const handleChapterBlur = () => {
    handleSave({ chapters });
  };

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newTag.trim()) {
      const next = [...tags, newTag.trim()];
      setTags(next);
      setNewTag('');
      handleSave({ tags: next });
    }
  };

  const handleRemoveTag = (index: number) => {
    const next = tags.filter((_, i) => i !== index);
    setTags(next);
    handleSave({ tags: next });
  };

  const handleHashtagChange = (index: number, val: string) => {
    const next = [...hashtags];
    next[index] = val.startsWith('#') ? val : '#' + val;
    setHashtags(next);
  };

  const handleHashtagBlur = () => {
    handleSave({ hashtags });
  };

  const handleThumbnailHookChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value.length <= 30) {
      setThumbnailHook(e.target.value);
    }
  };

  const handleThumbnailHookBlur = () => {
    handleSave({ thumbnail_hook: thumbnailHook });
  };

  // Copy helpers
  const handleCopySelectedTitle = () => {
    if (!metadata) return;
    const activeTitle = metadata.selected_title || (metadata.raw_json ? JSON.parse(metadata.raw_json).titles?.[0]?.text : '');
    copy(activeTitle);
    toast.success('Title copied to clipboard');
  };

  const handleCopyDescription = () => {
    if (!metadata) return;
    const chaptersText = chapters.map((c) => `${c.timestamp} ${c.label}`).join('\n');
    const finalDesc = description.includes('[CHAPTERS]')
      ? description.replace('[CHAPTERS]', chaptersText)
      : description + '\n\n' + chaptersText;
    copy(finalDesc);
    toast.success('Description copied to clipboard');
  };

  const handleCopyChapters = () => {
    const chaptersText = chapters.map((c) => `${c.timestamp} ${c.label}`).join('\n');
    copy(chaptersText);
    toast.success('Chapters copied to clipboard');
  };

  const handleCopyTags = () => {
    copy(tags.join(', '));
    toast.success('Tags copied to clipboard');
  };

  const handleCopyHashtags = () => {
    copy(hashtags.join(' '));
    toast.success('Hashtags copied to clipboard');
  };

  const getWordCount = (text: string) => {
    return text.trim().split(/\s+/).filter(Boolean).length;
  };

  const getTitleBadgeColor = (len: number) => {
    if (len <= 60 && len > 54) return 'amber';
    if (len > 60) return 'red';
    return 'green';
  };

  if (isLoadingMetadata) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <RefreshCw className="w-8 h-8 animate-spin text-[#6C63FF]" />
        <span className="text-xs text-gray-400 font-mono">Loading YouTube SEO Metadata...</span>
      </div>
    );
  }

  const rawJsonData = metadata && metadata.raw_json ? JSON.parse(metadata.raw_json) : null;

  return (
    <div className="space-y-8 select-none">
      <PageHeader
        title="YouTube SEO Metadata"
        description="Optimize titles, draft descriptions, format video chapters, and organize semantic tags to maximize click-through rate and findability."
        actions={
          metadata ? (
            <Button
              onClick={handleGenerate}
              isLoading={isRunning}
              variant="secondary"
              className="flex items-center gap-1.5 border border-[#2A2A38] text-white hover:bg-[#1E1E2A]"
            >
              <RefreshCw className="w-4 h-4 animate-spin-slow" />
              <span>Regenerate All</span>
            </Button>
          ) : (
            <Button
              onClick={handleGenerate}
              isLoading={isRunning}
              className="flex items-center gap-1.5 bg-[#6C63FF] hover:bg-[#7D75FF] text-white font-bold"
            >
              <Plus className="w-4 h-4" />
              <span>Generate Metadata</span>
            </Button>
          )
        }
      />

      {!metadata ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed bg-black/5 border-[#2A2A38]">
          <h3 className="font-bold text-sm text-white mb-2">No SEO Metadata Generated Yet</h3>
          <p className="text-xs text-gray-400 max-w-md mb-6">
            Invoke the TitleMetadataAgent to analyze your script topic, Bible locks, and narrative flow to produce titles, descriptions, and tags.
          </p>
          <Button onClick={handleGenerate} isLoading={isRunning} className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            <span>Generate Metadata</span>
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* LEFT COLUMN: Titles, Description, Chapters (60%) */}
          <div className="lg:col-span-3 space-y-8">
            {/* Titles Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">Title Selector (Select 1 of 8)</h3>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={handleRegenerateTitles} className="text-xs text-purple-400 hover:text-purple-300">
                    <RefreshCw className="w-3 h-3 mr-1" /> Regenerate Titles
                  </Button>
                  <Button variant="secondary" size="sm" onClick={handleCopySelectedTitle} className="text-xs">
                    <Copy className="w-3 h-3 mr-1" /> Copy Title
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {rawJsonData?.titles?.map((title: any, index: number) => {
                  const isSelected = metadata.selected_title === title.text || (!metadata.selected_title && index === 0);
                  const titleLen = title.text.length;
                  const variant = getTitleBadgeColor(titleLen);

                  return (
                    <div
                      key={index}
                      onClick={() => handleTitleSelect(title.text)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 relative ${
                        isSelected
                          ? 'bg-[#6C63FF]/10 border-[#6C63FF] shadow-md shadow-[#6C63FF]/5'
                          : 'bg-[#111118]/70 border-[#2A2A38]/80 hover:bg-[#1E1E2A]/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-xs text-white font-medium pr-10">{title.text}</span>
                        {isSelected && (
                          <div className="p-1 bg-[#6C63FF] text-white rounded-full absolute top-4 right-4">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-[#1A1A24] border border-[#2A2A38] text-gray-400">
                          {title.structure_type.replace(/_/g, ' ')}
                        </span>
                        <Badge variant={variant as any} className="text-[9px]">
                          {titleLen} Chars
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Description Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">YouTube Description</h3>
                <Button variant="secondary" size="sm" onClick={handleCopyDescription} className="text-xs">
                  <Copy className="w-3 h-3 mr-1" /> Copy Description
                </Button>
              </div>

              <div className="space-y-1.5">
                <textarea
                  value={description}
                  onChange={handleDescriptionChange}
                  onBlur={handleDescriptionBlur}
                  className="w-full h-80 px-4 py-3 bg-[#111118]/80 border border-[#2A2A38] rounded-xl text-xs text-gray-300 focus:outline-none focus:border-[#6C63FF] leading-relaxed resize-none font-mono"
                  placeholder="Draft descriptions..."
                />
                <div className="flex justify-between items-center text-[10px] text-gray-500 font-mono">
                  <span>Target: 250–350 words</span>
                  <span>Word count: {getWordCount(description)} words</span>
                </div>
              </div>
            </div>

            {/* Chapters Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">Chapters / Timestamps</h3>
                <Button variant="secondary" size="sm" onClick={handleCopyChapters} className="text-xs">
                  <Copy className="w-3 h-3 mr-1" /> Copy Chapters
                </Button>
              </div>

              <div className="bg-[#111118]/60 border border-[#2A2A38]/85 rounded-xl p-4 space-y-3">
                {chapters.map((ch, idx) => (
                  <div key={idx} className="flex gap-4 items-center">
                    <input
                      type="text"
                      value={ch.timestamp}
                      onChange={(e) => handleChapterChange(idx, 'timestamp', e.target.value)}
                      onBlur={handleChapterBlur}
                      className="w-20 px-3 py-1.5 bg-black border border-[#2A2A38] rounded-lg text-xs font-mono text-center text-white focus:outline-none focus:border-[#6C63FF]"
                    />
                    <input
                      type="text"
                      value={ch.label}
                      onChange={(e) => handleChapterChange(idx, 'label', e.target.value)}
                      onBlur={handleChapterBlur}
                      className="flex-1 px-3 py-1.5 bg-black border border-[#2A2A38] rounded-lg text-xs text-white focus:outline-none focus:border-[#6C63FF]"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Tags, Hashtags, Thumbnail Hook (40%) */}
          <div className="lg:col-span-2 space-y-8">
            {/* Thumbnail Hook Section */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">Thumbnail Text Hook</h3>
              <Card className="bg-[#111118]/60 border-[#2A2A38]/90 p-5 space-y-4">
                <div className="p-4 bg-black/60 rounded-lg border border-purple-500/10 text-center font-display text-base font-black text-purple-400 tracking-wide select-text">
                  "{thumbnailHook}"
                </div>
                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={thumbnailHook}
                    onChange={handleThumbnailHookChange}
                    onBlur={handleThumbnailHookBlur}
                    className="w-full px-3 py-2 bg-black border border-[#2A2A38] rounded-lg text-xs text-white focus:outline-none focus:border-[#6C63FF]"
                  />
                  <div className="flex justify-between items-center text-[9px] text-gray-500 font-mono">
                    <span>Limit: Max 30 chars</span>
                    <span>{thumbnailHook.length}/30 characters</span>
                  </div>
                </div>
              </Card>
            </div>

            {/* Tags Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">Video Tags ({tags.length})</h3>
                <Button variant="secondary" size="sm" onClick={handleCopyTags} className="text-xs">
                  <Copy className="w-3 h-3 mr-1" /> Copy Tags
                </Button>
              </div>

              <Card className="bg-[#111118]/60 border-[#2A2A38]/90 p-4 space-y-3">
                <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto pr-1">
                  {tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 text-[10px] font-bold bg-[#1A1A24] text-gray-300 border border-[#2A2A38] px-2 py-1 rounded-lg hover:border-rose-500/30 hover:text-rose-400 transition-colors group cursor-pointer"
                      onClick={() => handleRemoveTag(idx)}
                    >
                      <span>{tag}</span>
                      <Trash2 className="w-3 h-3 opacity-30 group-hover:opacity-100 transition-opacity" />
                    </span>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={handleAddTag}
                    placeholder="Press enter to add tag..."
                    className="w-full px-3 py-2 bg-black border border-[#2A2A38] rounded-lg text-xs text-white focus:outline-none focus:border-[#6C63FF]"
                  />
                </div>
              </Card>
            </div>

            {/* Hashtags Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">Hashtags</h3>
                <Button variant="secondary" size="sm" onClick={handleCopyHashtags} className="text-xs">
                  <Copy className="w-3 h-3 mr-1" /> Copy Hashtags
                </Button>
              </div>

              <Card className="bg-[#111118]/60 border-[#2A2A38]/90 p-4 space-y-3">
                <div className="space-y-3">
                  {hashtags.map((hash, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <span className="text-xs font-mono text-purple-400">#</span>
                      <input
                        type="text"
                        value={hash.replace('#', '')}
                        onChange={(e) => handleHashtagChange(idx, e.target.value)}
                        onBlur={handleHashtagBlur}
                        className="w-full px-3 py-1.5 bg-black border border-[#2A2A38] rounded-lg text-xs text-white focus:outline-none focus:border-[#6C63FF]"
                      />
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MetadataWorkspace;
