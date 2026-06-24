import React, { useState } from 'react';
import { AlertCircle, RotateCcw, Eye, EyeOff } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';

interface AgentErrorCardProps {
  title: string;
  message: string;
  rawDetails?: string;
  onRetry: () => void;
}

export const AgentErrorCard: React.FC<AgentErrorCardProps> = ({
  title,
  message,
  rawDetails,
  onRetry,
}) => {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <Card className="border-rose-500/40 bg-rose-500/5 shadow-lg shadow-rose-950/5 space-y-4 max-w-xl mx-auto">
      <div className="flex items-start gap-3.5">
        <div className="p-2 bg-rose-500/10 text-rose-450 border border-rose-500/20 rounded-lg shrink-0">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div className="space-y-1 overflow-hidden">
          <h4 className="text-sm font-bold text-white uppercase tracking-wider">{title}</h4>
          <p className="text-xs text-rose-300 leading-relaxed font-semibold break-words">{message}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button variant="danger" size="sm" onClick={onRetry} className="flex items-center gap-1.5 cursor-pointer">
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Retry Operation</span>
        </Button>

        {rawDetails && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowRaw(!showRaw)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white cursor-pointer"
          >
            {showRaw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{showRaw ? 'Hide Raw Data' : 'View Raw Data'}</span>
          </Button>
        )}
      </div>

      {showRaw && rawDetails && (
        <pre className="p-3 bg-black border border-[#2A2A38] text-[10px] text-gray-400 rounded-lg font-mono overflow-auto max-h-40 whitespace-pre-wrap select-text">
          {rawDetails}
        </pre>
      )}
    </Card>
  );
};
export default AgentErrorCard;
