import React from 'react';
import { useUiStore } from '../../store/ui.store';
import { Loader2, Square } from 'lucide-react';
import Button from '../ui/Button';

export const AgentStatusBar: React.FC = () => {
  const activeAgentRun = useUiStore((s) => s.activeAgentRun);
  const stopAgentRun = useUiStore((s) => s.stopAgentRun);

  if (!activeAgentRun) return null;

  const minutes = Math.floor(activeAgentRun.timerSeconds / 60);
  const seconds = activeAgentRun.timerSeconds % 60;
  const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#111118] border-t border-[#2A2A38] px-6 py-4 flex items-center justify-between shadow-2xl">
      <div className="flex items-center gap-4 max-w-[50%]">
        <div className="p-2 bg-[#6C63FF]/10 text-[#6C63FF] border border-[#6C63FF]/20 rounded-lg animate-pulse shrink-0">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
        
        <div className="space-y-1 overflow-hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#6C63FF]">
              {activeAgentRun.agentName}
            </span>
            <span className="text-[10px] text-gray-500 font-mono animate-pulse">
              ACTIVE
            </span>
          </div>
          <p className="text-xs text-gray-400 truncate font-mono">
            {activeAgentRun.progressText.split('\n').filter(Boolean).pop() || 'Analyzing universe guidelines and generating content...'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-6 text-xs text-gray-400 font-mono">
          <div>
            Tokens: <span className="text-white font-bold">{activeAgentRun.tokens}</span>
          </div>
          <div>
            Time: <span className="text-white font-bold">{timeStr}</span>
          </div>
        </div>

        <Button
          variant="danger"
          size="sm"
          onClick={() => {
            stopAgentRun();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer"
        >
          <Square className="w-3.5 h-3.5 fill-current" />
          <span>Stop</span>
        </Button>
      </div>
    </div>
  );
};
export default AgentStatusBar;
