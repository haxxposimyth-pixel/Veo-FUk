import React from 'react';
import { useProjectStore } from '../../store/project.store';
import { Badge } from '../ui/Badge';
import { Video, Languages, LayoutGrid } from 'lucide-react';

export const TopBar: React.FC = () => {
  const activeProject = useProjectStore((s) => s.activeProject);

  // Status index for progress bar
  const statusIndex: Record<string, number> = {
    setup: 1,
    bible: 2,
    script: 3,
    scenes: 4,
    prompts: 5,
    complete: 6,
  };

  const currentStep = activeProject ? statusIndex[activeProject.status] || 1 : 0;
  const progressPercent = Math.min(100, Math.max(0, (currentStep / 6) * 100));

  return (
    <header className="h-16 border-b border-[#2A2A38] bg-[#111118]/85 backdrop-blur-md px-6 flex items-center justify-between z-10 shrink-0 select-none">
      <div className="flex items-center gap-4">
        {activeProject ? (
          <div className="flex items-center gap-3">
            <h1 className="font-display font-extrabold text-sm text-white tracking-wide truncate max-w-sm">
              {activeProject.title}
            </h1>
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge variant="gray" className="flex items-center gap-1 font-mono">
                <LayoutGrid className="w-3 h-3 text-[#6C63FF]" />
                <span>{activeProject.aspect_ratio}</span>
              </Badge>
              <Badge variant="gray" className="flex items-center gap-1 font-mono">
                <Languages className="w-3 h-3 text-[#6C63FF]" />
                <span>{activeProject.narration_language}</span>
              </Badge>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Video className="w-4 h-4 text-[#6C63FF]" />
            <h1 className="font-display font-extrabold text-xs text-gray-400 tracking-wider uppercase">
              Dashboard / Creative Suite
            </h1>
          </div>
        )}
      </div>

      {activeProject && (
        <div className="flex items-center gap-4 max-w-[200px] w-full">
          <div className="w-full bg-[#1A1A24] h-1.5 rounded-full overflow-hidden border border-[#2A2A38]/30">
            <div
              style={{ width: `${progressPercent}%` }}
              className="bg-[#6C63FF] h-full rounded-full transition-all duration-500 shadow-md shadow-[#6C63FF]/30"
            />
          </div>
          <span className="text-[10px] font-bold text-gray-400 font-mono shrink-0 whitespace-nowrap">
            {Math.round(progressPercent)}%
          </span>
        </div>
      )}
    </header>
  );
};
export default TopBar;
