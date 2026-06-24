import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useProject } from '../hooks/useProject';
import { exportApi } from '../api/export.api';
import { downloadBlob } from '../utils/export';
import PageHeader from '../components/layout/PageHeader';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { Download, FileJson, FileText, Table, BookOpen, Copy } from 'lucide-react';
import { useClipboard } from '../hooks/useClipboard';
import { toast } from 'react-hot-toast';
import { projectsApi } from '../api/projects.api';

export const ExportCenter: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { activeProject, phases, scenes, veoPrompts, fetchProjectDetails } = useProject();

  // Export configs
  const [includeBible, setIncludeBible] = useState(true);
  const [includeScript, setIncludeScript] = useState(true);
  const [includeScenes, setIncludeScenes] = useState(true);
  const [includePrompts, setIncludePrompts] = useState(true);
  const [includeMetadata, setIncludeMetadata] = useState(true);

  const [format, setFormat] = useState<'json' | 'markdown' | 'txt' | 'csv'>('markdown');
  const [isExporting, setIsExporting] = useState(false);
  const { copy } = useClipboard();

  const [integrityReport, setIntegrityReport] = useState<any | null>(null);

  useEffect(() => {
    if (id) {
      projectsApi.getIntegrity(id)
        .then(setIntegrityReport)
        .catch(err => console.error('Failed to load integrity', err));
    }
  }, [id]);

  const handleCopyAll = async () => {
    if (veoPrompts.length === 0) {
      toast.error('No prompts available to copy.');
      return;
    }

    // Sort prompts by prompt_number ASC
    const sortedPrompts = [...veoPrompts].sort((a, b) => {
      const aData = typeof a.raw_json === 'string' ? JSON.parse(a.raw_json) : a.raw_json;
      const bData = typeof b.raw_json === 'string' ? JSON.parse(b.raw_json) : b.raw_json;
      const aNum = Number(aData.prompt_number) || 0;
      const bNum = Number(bData.prompt_number) || 0;
      return aNum - bNum;
    });

    const text = sortedPrompts
      .map(p => {
        const pData = typeof p.raw_json === 'string' ? JSON.parse(p.raw_json) : p.raw_json;
        return (pData.veo_full_prompt || '').replace(/\[WARNING:.*\]/g, '').trim();
      })
      .filter(Boolean)
      .join('\n\n');

    await copy(text);
    if (integrityReport && integrityReport.verdict === 'issues') {
      toast.error('This project has unresolved integrity issues.', { id: 'integrity-warn' });
    } else {
      toast.success('All Veo Prompts copied to clipboard!');
    }
  };

  useEffect(() => {
    if (id) {
      fetchProjectDetails(id);
    }
  }, [id, fetchProjectDetails]);

  const handleDownload = async () => {
    if (!id || !activeProject) return;

    const includeList: string[] = [];
    if (includeBible) includeList.push('bible');
    if (includeScript) includeList.push('script');
    if (includeScenes) includeList.push('scenes');
    if (includePrompts) includeList.push('prompts');
    if (includeMetadata) includeList.push('metadata');

    if (includeList.length === 0) {
      toast.error('Please select at least one component to include in the export.');
      return;
    }

    setIsExporting(true);
    try {
      const blob = await exportApi.exportProject(id, format, includeList);
      
      // Filename formatting
      const dateStr = new Date().toISOString().split('T')[0];
      const titleSafe = activeProject.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const ext = {
        json: 'json',
        markdown: 'md',
        txt: 'txt',
        csv: 'csv',
      }[format];
      const filename = `viral-video-studio_${titleSafe}_${dateStr}.${ext}`;

      downloadBlob(blob, filename);
      if (integrityReport && integrityReport.verdict === 'issues') {
        toast.error('This project has unresolved integrity issues.', { id: 'integrity-warn' });
      } else {
        toast.success('Project package downloaded successfully!');
      }
    } catch (err: any) {
      toast.error(err.message || 'Export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-8 select-none max-w-4xl mx-auto">
      <PageHeader
        title="Export Center"
        description="Compile your video production asset workbook. Export narration scripts, characters roster, and technical prompts to external video and audio generation tools."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Config Panel */}
        <div className="md:col-span-2 space-y-6">
          {/* Include Components */}
          <Card className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 border-b border-[#2A2A38]/30 pb-2">
              Select Assets to Include
            </h3>
            
            <div className="space-y-3">
              <label className="flex items-center gap-3 p-3 bg-[#0A0A0F]/65 border border-[#2A2A38]/30 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeBible}
                  onChange={(e) => setIncludeBible(e.target.checked)}
                  className="rounded text-[#6C63FF] focus:ring-[#6C63FF] h-4 w-4 bg-[#0A0A0F] border-[#2A2A38]"
                />
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-white block">Production Bible</span>
                  <span className="text-[10px] text-gray-500">Character, location records, and visual palette settings</span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-[#0A0A0F]/65 border border-[#2A2A38]/30 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeScript}
                  onChange={(e) => setIncludeScript(e.target.checked)}
                  className="rounded text-[#6C63FF] focus:ring-[#6C63FF] h-4 w-4 bg-[#0A0A0F] border-[#2A2A38]"
                />
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-white block">10-Phase Script</span>
                  <span className="text-[10px] text-gray-500"> Narration voice overlay scripts and visual events mapping</span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-[#0A0A0F]/65 border border-[#2A2A38]/30 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeScenes}
                  onChange={(e) => setIncludeScenes(e.target.checked)}
                  className="rounded text-[#6C63FF] focus:ring-[#6C63FF] h-4 w-4 bg-[#0A0A0F] border-[#2A2A38]"
                />
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-white block">Storyboard Scenes</span>
                  <span className="text-[10px] text-gray-500">Scenic framing breakdowns, dialogue, and emotional beats</span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-[#0A0A0F]/65 border border-[#2A2A38]/30 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={includePrompts}
                  onChange={(e) => setIncludePrompts(e.target.checked)}
                  className="rounded text-[#6C63FF] focus:ring-[#6C63FF] h-4 w-4 bg-[#0A0A0F] border-[#2A2A38]"
                />
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-white block">Veo Video Prompts</span>
                  <span className="text-[10px] text-gray-500">Technical camera directions, lens specifications, noise, and avoid tags</span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-[#0A0A0F]/65 border border-[#2A2A38]/30 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeMetadata}
                  onChange={(e) => setIncludeMetadata(e.target.checked)}
                  className="rounded text-[#6C63FF] focus:ring-[#6C63FF] h-4 w-4 bg-[#0A0A0F] border-[#2A2A38]"
                />
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-white block">YouTube Metadata</span>
                  <span className="text-[10px] text-gray-500">Optimized titles, descriptions, chapters formatting, and tags</span>
                </div>
              </label>
            </div>
          </Card>

          {/* Export Formats */}
          <Card className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 border-b border-[#2A2A38]/30 pb-2">
              Select Package format
            </h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Markdown */}
              <button
                onClick={() => setFormat('markdown')}
                className={`p-4 border rounded-xl flex flex-col items-center gap-2 cursor-pointer transition-all duration-200 ${
                  format === 'markdown'
                    ? 'border-[#6C63FF] bg-[#6C63FF]/10 text-white font-bold'
                    : 'border-[#2A2A38] bg-black/20 text-gray-400 hover:border-gray-500'
                }`}
              >
                <BookOpen className="w-5 h-5 text-[#6C63FF]" />
                <span className="text-[10px] uppercase tracking-wider">Markdown (.md)</span>
              </button>

              {/* JSON */}
              <button
                onClick={() => setFormat('json')}
                className={`p-4 border rounded-xl flex flex-col items-center gap-2 cursor-pointer transition-all duration-200 ${
                  format === 'json'
                    ? 'border-[#6C63FF] bg-[#6C63FF]/10 text-white font-bold'
                    : 'border-[#2A2A38] bg-black/20 text-gray-400 hover:border-gray-500'
                }`}
              >
                <FileJson className="w-5 h-5 text-[#6C63FF]" />
                <span className="text-[10px] uppercase tracking-wider">JSON (.json)</span>
              </button>

              {/* TXT */}
              <button
                onClick={() => setFormat('txt')}
                className={`p-4 border rounded-xl flex flex-col items-center gap-2 cursor-pointer transition-all duration-200 ${
                  format === 'txt'
                    ? 'border-[#6C63FF] bg-[#6C63FF]/10 text-white font-bold'
                    : 'border-[#2A2A38] bg-black/20 text-gray-400 hover:border-gray-500'
                }`}
              >
                <FileText className="w-5 h-5 text-[#6C63FF]" />
                <span className="text-[10px] uppercase tracking-wider">Text Script (.txt)</span>
              </button>

              {/* CSV */}
              <button
                onClick={() => setFormat('csv')}
                className={`p-4 border rounded-xl flex flex-col items-center gap-2 cursor-pointer transition-all duration-200 ${
                  format === 'csv'
                    ? 'border-[#6C63FF] bg-[#6C63FF]/10 text-white font-bold'
                    : 'border-[#2A2A38] bg-black/20 text-gray-400 hover:border-gray-500'
                }`}
              >
                <Table className="w-5 h-5 text-[#6C63FF]" />
                <span className="text-[10px] uppercase tracking-wider">Prompts Sheet (.csv)</span>
              </button>
            </div>
          </Card>
        </div>

        {/* Right Column: Stats & Download */}
        <div className="space-y-6">
          <Card className="bg-[#111118]/40 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 border-b border-[#2A2A38]/30 pb-2">
              Package Summary
            </h3>
            
            <div className="space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Narration Script:</span>
                <span className="text-white font-mono">{phases.length > 0 ? '10 Blocks (100%)' : 'Not generated'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Storyboard Scenes:</span>
                <span className="text-white font-mono">{scenes.length} Frames</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Technical Prompts:</span>
                <span className="text-white font-mono">{veoPrompts.length} Prompts</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">YouTube Metadata:</span>
                <span className="text-white font-mono">{(activeProject as any)?.has_metadata ? 'Generated' : 'Not generated'}</span>
              </div>
            </div>

            <Button
              onClick={handleDownload}
              isLoading={isExporting}
              className="w-full flex items-center justify-center gap-2 py-3 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download production package</span>
            </Button>

            <Button
              variant="secondary"
              onClick={handleCopyAll}
              disabled={veoPrompts.length === 0}
              className="w-full flex items-center justify-center gap-2 py-3 cursor-pointer mt-2"
            >
              <Copy className="w-4 h-4" />
              <span>Copy All Prompts</span>
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
};
export default ExportCenter;
