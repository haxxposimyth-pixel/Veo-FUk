import React, { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';

interface StreamingTextProps {
  text: string;
  title?: string;
}

export const StreamingText: React.FC<StreamingTextProps> = ({ text, title = 'Agent Stream Output' }) => {
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [text]);

  return (
    <div className="bg-[#0A0A0F] border border-[#2A2A38] rounded-xl overflow-hidden shadow-xl flex flex-col h-64 w-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#2A2A38] bg-[#111118]/80 text-gray-400 shrink-0">
        <Terminal className="w-4 h-4 text-[#6C63FF] shrink-0" />
        <span className="text-xs font-mono font-bold uppercase tracking-wider text-gray-300">
          {title}
        </span>
      </div>
      
      <pre
        ref={preRef}
        className="flex-1 p-4 font-mono text-xs text-green-400 overflow-y-auto whitespace-pre-wrap selection:bg-[#6C63FF]/30 select-text"
      >
        {text || 'Awaiting agent stream content...'}
      </pre>
    </div>
  );
};
export default StreamingText;
