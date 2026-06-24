import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { projectsApi } from '../api/projects.api';
import PageHeader from '../components/layout/PageHeader';
import {
  Coins,
  Cpu,
  Layers,
  AlertTriangle,
  Sparkles,
  Database,
  RefreshCw,
  Info
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export const UsageWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [usageData, setUsageData] = useState<any>(null);

  const fetchUsage = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const response = await projectsApi.getUsage(id);
      if (response.success) {
        setUsageData(response.data);
      } else {
        toast.error('Failed to load project usage data');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error fetching usage data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsage();
  }, [id]);

  if (loading && !usageData) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0C0C12] h-full">
        <div className="flex flex-col items-center gap-3 select-none">
          <RefreshCw className="w-8 h-8 text-[#6C63FF] animate-spin" />
          <span className="text-xs text-gray-500 font-mono">Loading usage statistics...</span>
        </div>
      </div>
    );
  }

  const totals = usageData?.totals || {
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    thinkingTokens: 0,
    totalTokens: 0,
    totalCost: 0,
  };

  const byAgent = usageData?.byAgent || [];
  const byPhase = usageData?.byPhase || [];
  const byBillingSource = usageData?.byBillingSource || [];
  const estimatedPercentage = usageData?.estimatedPercentage ?? 0;

  return (
    <div className="flex-1 bg-[#0C0C12] p-8 overflow-y-auto h-full space-y-6">
      <PageHeader
        title="Usage & Cost"
        description="Monitor LLM API tokens consumed and approximate costs generated across pipeline agents."
        actions={
          <button
            onClick={fetchUsage}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#1A1A24] border border-[#2A2A38] hover:border-[#6C63FF] transition-all rounded-lg cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Stats</span>
          </button>
        }
      />

      {/* Warning alert if tokens are estimated */}
      {estimatedPercentage > 0 && (
        <div className="flex gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-xs leading-normal select-none">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Token Estimation Warning:</span> About{' '}
            <span className="font-mono font-bold text-white bg-amber-500/20 px-1 py-0.5 rounded">
              {estimatedPercentage}%
            </span>{' '}
            of logged agent calls were calculated using a fallback (1 token ≈ 4 characters) because real LLM API token counts were unavailable (e.g. from historical generation, API Studio streams, or connection errors).
          </div>
        </div>
      )}

      {/* Totals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Cost Card */}
        <div className="bg-[#111118]/60 border border-[#2A2A38] rounded-xl p-5 relative overflow-hidden select-none hover:border-[#6C63FF]/30 transition-all">
          <div className="absolute top-0 right-0 p-5 opacity-5 pointer-events-none">
            <Coins className="w-24 h-24 text-emerald-400" />
          </div>
          <div className="space-y-1.5">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              Project Cost (Vertex AI Equivalent)
            </div>
            <div className="text-3xl font-black text-emerald-400 tracking-tight font-mono">
              ${totals.totalCost.toFixed(4)}
            </div>
            <div className="text-[10px] text-gray-400 flex items-center gap-1">
              <Info className="w-3 h-3 text-[#6C63FF]" />
              <span>Free tier AI Studio runs billed at $0.00</span>
            </div>
          </div>
        </div>

        {/* Total Tokens Card */}
        <div className="bg-[#111118]/60 border border-[#2A2A38] rounded-xl p-5 relative overflow-hidden select-none hover:border-[#6C63FF]/30 transition-all">
          <div className="absolute top-0 right-0 p-5 opacity-5 pointer-events-none">
            <Cpu className="w-24 h-24 text-[#6C63FF]" />
          </div>
          <div className="space-y-1.5">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              Total Tokens Used
            </div>
            <div className="text-3xl font-black text-white tracking-tight font-mono">
              {totals.totalTokens.toLocaleString()}
            </div>
            <div className="text-[10px] text-gray-400">
              Across all execution phases
            </div>
          </div>
        </div>

        {/* Input/Output Split Card */}
        <div className="bg-[#111118]/60 border border-[#2A2A38] rounded-xl p-5 relative overflow-hidden select-none hover:border-[#6C63FF]/30 transition-all">
          <div className="absolute top-0 right-0 p-5 opacity-5 pointer-events-none">
            <Layers className="w-24 h-24 text-blue-400" />
          </div>
          <div className="space-y-1.5">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              Token Ratio (In / Out)
            </div>
            <div className="text-lg font-bold text-white font-mono flex items-baseline gap-1.5 pt-1">
              <span className="text-blue-400 font-black">{totals.inputTokens.toLocaleString()}</span>
              <span className="text-gray-600 text-xs">/</span>
              <span className="text-purple-400 font-black">{totals.outputTokens.toLocaleString()}</span>
            </div>
            <div className="text-[10px] text-gray-400">
              Input queries vs Generated candidates
            </div>
          </div>
        </div>

        {/* Special Tokens Card */}
        <div className="bg-[#111118]/60 border border-[#2A2A38] rounded-xl p-5 relative overflow-hidden select-none hover:border-[#6C63FF]/30 transition-all">
          <div className="absolute top-0 right-0 p-5 opacity-5 pointer-events-none">
            <Sparkles className="w-24 h-24 text-amber-400" />
          </div>
          <div className="space-y-1.5">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              Cached & Thinking Tokens
            </div>
            <div className="text-sm font-semibold text-white font-mono space-y-1 pt-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Cached Input:</span>
                <span className="text-amber-400 font-bold">{totals.cachedTokens.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Thinking:</span>
                <span className="text-indigo-400 font-bold">{totals.thinkingTokens.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Agent Table */}
        <div className="bg-[#111118]/60 border border-[#2A2A38] rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-[#6C63FF]" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Usage by Agent
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#2A2A38] text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                  <th className="pb-3">Agent</th>
                  <th className="pb-3 text-right">In</th>
                  <th className="pb-3 text-right">Out</th>
                  <th className="pb-3 text-right">Total</th>
                  <th className="pb-3 text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A2A38]/50 text-xs text-gray-300 font-mono">
                {byAgent.map((agent: any) => (
                  <tr key={agent.agent_name} className="hover:bg-[#1A1A24]/20 transition-all">
                    <td className="py-3 font-semibold text-white">{agent.agent_name}</td>
                    <td className="py-3 text-right">{agent.inputTokens.toLocaleString()}</td>
                    <td className="py-3 text-right">{agent.outputTokens.toLocaleString()}</td>
                    <td className="py-3 text-right text-gray-400">{agent.totalTokens.toLocaleString()}</td>
                    <td className="py-3 text-right font-bold text-emerald-400">
                      ${agent.cost.toFixed(4)}
                    </td>
                  </tr>
                ))}
                {byAgent.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-600 font-sans italic">
                      No agent logs recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* By Phase Table */}
        <div className="bg-[#111118]/60 border border-[#2A2A38] rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#6C63FF]" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Usage by Production Phase
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#2A2A38] text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                  <th className="pb-3">Phase / Stage</th>
                  <th className="pb-3 text-right">In</th>
                  <th className="pb-3 text-right">Out</th>
                  <th className="pb-3 text-right">Total</th>
                  <th className="pb-3 text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A2A38]/50 text-xs text-gray-300 font-mono">
                {byPhase.map((phase: any) => (
                  <tr key={phase.phase} className="hover:bg-[#1A1A24]/20 transition-all">
                    <td className="py-3 font-semibold text-white capitalize">
                      {phase.phase === 'foundation' ? 'Foundation (Bible/Setup)' : phase.phase}
                    </td>
                    <td className="py-3 text-right">{phase.inputTokens.toLocaleString()}</td>
                    <td className="py-3 text-right">{phase.outputTokens.toLocaleString()}</td>
                    <td className="py-3 text-right text-gray-400">{phase.totalTokens.toLocaleString()}</td>
                    <td className="py-3 text-right font-bold text-emerald-400">
                      ${phase.cost.toFixed(4)}
                    </td>
                  </tr>
                ))}
                {byPhase.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-600 font-sans italic">
                      No phase logs recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Billing Split Section */}
      <div className="bg-[#111118]/60 border border-[#2A2A38] rounded-xl p-6 space-y-4 max-w-xl">
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-[#6C63FF]" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            API Billing Source Split
          </h3>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Vertex Paid */}
            <div className="bg-[#1A1A24]/40 border border-[#2A2A38] rounded-xl p-4 space-y-1 select-none">
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Vertex AI (Paid Cloud API)
              </div>
              <div className="text-lg font-black text-white font-mono">
                {byBillingSource
                  .find((s: any) => s.billing_source === 'vertex')
                  ?.totalTokens?.toLocaleString() ?? 0}{' '}
                <span className="text-[10px] text-gray-500 font-normal">tokens</span>
              </div>
              <div className="text-xs font-bold text-emerald-400 font-mono">
                ${(byBillingSource.find((s: any) => s.billing_source === 'vertex')?.cost ?? 0).toFixed(4)}
              </div>
            </div>

            {/* AI Studio Free */}
            <div className="bg-[#1A1A24]/40 border border-[#2A2A38] rounded-xl p-4 space-y-1 select-none">
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Google AI Studio (Free Tier)
              </div>
              <div className="text-lg font-black text-white font-mono">
                {byBillingSource
                  .find((s: any) => s.billing_source === 'ai_studio')
                  ?.totalTokens?.toLocaleString() ?? 0}{' '}
                <span className="text-[10px] text-gray-500 font-normal">tokens</span>
              </div>
              <div className="text-xs font-bold text-emerald-400 font-mono">
                $0.0000
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UsageWorkspace;
