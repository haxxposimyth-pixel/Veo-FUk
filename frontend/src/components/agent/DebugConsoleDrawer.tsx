import React, { useState, useEffect } from 'react';
import { useUiStore } from '../../store/ui.store';
import { settingsApi } from '../../api/settings.api';
import { useClipboard } from '../../hooks/useClipboard';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import {
  Terminal,
  X,
  RefreshCw,
  Search,
  Copy,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export const DebugConsoleDrawer: React.FC = () => {
  const isDebugOpen = useUiStore((s) => s.isDebugOpen);
  const toggleDebug = useUiStore((s) => s.toggleDebug);
  const { copy } = useClipboard();

  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'success' | 'failed'>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await settingsApi.getAgentLogs(50);
      setLogs(data);
    } catch (err: any) {
      toast.error('Failed to load debug logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isDebugOpen) {
      fetchLogs();
      // Set up a polling interval to get live logs during execution
      const interval = setInterval(fetchLogs, 5000);
      return () => clearInterval(interval);
    }
  }, [isDebugOpen]);

  const handleCopy = async (text: string, label: string) => {
    await copy(text);
    toast.success(`${label} copied!`);
  };

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.agent_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.model_used.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.error_message && log.error_message.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus =
      filterStatus === 'all' ||
      (filterStatus === 'success' && log.status === 'success') ||
      (filterStatus === 'failed' && log.status === 'failed');

    return matchesSearch && matchesStatus;
  });

  if (!isDebugOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-[#0B0B10] border-l border-[#2A2A38] shadow-2xl flex flex-col animate-slide-in select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A38] bg-[#111118]">
        <div className="flex items-center gap-2.5">
          <Terminal className="w-5 h-5 text-[#6C63FF]" />
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-wider">Agent Debug Console</h2>
            <p className="text-[10px] text-gray-500 font-mono">Monitor API payloads & pipeline exceptions</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="p-2 text-gray-400 hover:text-white hover:bg-[#20202F] rounded-lg transition-all cursor-pointer"
            title="Refresh logs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => toggleDebug(false)}
            className="p-2 text-gray-400 hover:text-white hover:bg-[#20202F] rounded-lg transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="px-6 py-3 border-b border-[#2A2A38] bg-[#0A0A0F] flex flex-col md:flex-row md:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            placeholder="Filter by agent, model, error..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#12121A] border border-[#2A2A38] rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#6C63FF]"
          />
        </div>
        {/* Status Tab Filters */}
        <div className="flex bg-[#12121A] border border-[#2A2A38] rounded-lg p-0.5 text-xs font-mono shrink-0">
          {(['all', 'success', 'failed'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1 rounded-md uppercase tracking-wider text-[10px] font-bold cursor-pointer transition-all ${
                filterStatus === status
                  ? 'bg-[#6C63FF] text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Logs Viewport */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {loading && logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-500">
            <RefreshCw className="w-8 h-8 animate-spin text-[#6C63FF] mb-2" />
            <span className="text-xs font-mono">Loading telemetry logs...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 border border-dashed border-[#2A2A38] rounded-xl bg-black/10 text-gray-500">
            <Terminal className="w-8 h-8 text-gray-600 mb-2" />
            <span className="text-xs font-mono">No telemetry matching criteria found.</span>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isExpanded = expandedLogId === log.id;
            const logDate = new Date(log.created_at).toLocaleTimeString();
            const isSuccess = log.status === 'success';

            return (
              <Card
                key={log.id}
                className={`border transition-all duration-150 p-4 relative ${
                  isSuccess
                    ? 'border-[#2A2A38]/60 bg-[#111118]/50'
                    : 'border-rose-950 bg-rose-950/5'
                }`}
              >
                {/* collapsed layout */}
                <div
                  onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                  className="flex items-start justify-between gap-4 cursor-pointer"
                >
                  <div className="space-y-1 overflow-hidden pr-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-white font-mono uppercase">
                        {log.agent_name}
                      </span>
                      <span className="text-[9px] text-gray-500 font-mono">
                        {logDate}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-gray-400 font-mono">
                      <span>Model: <span className="text-gray-300">{log.model_used}</span></span>
                      <span>•</span>
                      <span>Duration: <span className="text-gray-300">{log.duration_ms ?? 0}ms</span></span>
                      {log.output_tokens > 0 && (
                        <>
                          <span>•</span>
                          <span>Tokens: <span className="text-gray-300">I:{log.input_tokens}/O:{log.output_tokens}</span></span>
                        </>
                      )}
                    </div>
                  </div>

                  <Badge variant={isSuccess ? 'emerald' : 'danger'} className="shrink-0">
                    {log.status}
                  </Badge>
                </div>

                {/* expanded prompt & payload details */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-[#2A2A38]/30 space-y-4 animate-fade-in text-xs font-mono">
                    {/* Error message card */}
                    {log.error_message && (
                      <div className="p-3 bg-rose-950/20 border border-rose-900/40 rounded-lg text-rose-350 flex items-start justify-between gap-3 leading-relaxed">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold text-[10px] uppercase tracking-wider">Exception Thrown</p>
                            <p className="mt-0.5">{log.error_message}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleCopy(log.error_message, 'Error message')}
                          className="flex items-center gap-1 text-[10px] text-rose-450 hover:text-white hover:bg-rose-500/10 px-2 py-0.5 rounded cursor-pointer transition-all shrink-0 border border-rose-500/15"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Copy Error</span>
                        </button>
                      </div>
                    )}

                    {/* Input Prompt */}
                    {log.input_prompt && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">1. Generated Input Prompt (Recipe)</span>
                          <button
                            onClick={() => handleCopy(log.input_prompt, 'Prompt')}
                            className="flex items-center gap-1 text-[10px] text-[#6C63FF] hover:text-white hover:bg-[#6C63FF]/10 px-2 py-0.5 rounded cursor-pointer transition-all"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Copy Prompt</span>
                          </button>
                        </div>
                        <pre className="p-3 bg-black border border-[#2A2A38] text-[10px] text-gray-400 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-48 leading-normal select-text">
                          {log.input_prompt}
                        </pre>
                      </div>
                    )}

                    {/* Output Response */}
                    {log.output_response && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">2. Model Raw JSON Response</span>
                          <button
                            onClick={() => handleCopy(log.output_response, 'JSON Response')}
                            className="flex items-center gap-1 text-[10px] text-[#6C63FF] hover:text-white hover:bg-[#6C63FF]/10 px-2 py-0.5 rounded cursor-pointer transition-all"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Copy Response</span>
                          </button>
                        </div>
                        <pre className="p-3 bg-black border border-[#2A2A38] text-[10px] text-gray-400 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-48 leading-normal select-text">
                          {log.output_response}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};

export default DebugConsoleDrawer;
