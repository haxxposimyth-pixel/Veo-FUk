import React from 'react';
import { NavLink, useParams, useNavigate } from 'react-router-dom';
import { useProjectStore } from '../../store/project.store';
import { useUiStore } from '../../store/ui.store';

import {
  Film,
  Settings,
  BookOpen,
  FileText,
  Clapperboard,
  Sparkles,
  Download,
  LayoutDashboard,
  ChevronLeft,
  Terminal,
  Coins,
} from 'lucide-react';
import { cn } from '../../utils/cn';

export const Sidebar: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const activeProject = useProjectStore((s) => s.activeProject);
  const selectProject = useProjectStore((s) => s.selectProject);

  const handleBackToDashboard = () => {
    selectProject(null);
    navigate('/');
  };

  // Status mapping for visual indicators
  const statusBadgeMap: Record<string, string> = {
    setup: 'Setup',
    planning: 'Story Plan',
    bible: 'Bible',
    script: 'Script',
    scenes: 'Scenes',
    prompts: 'Prompts',
    complete: 'Done',
  };

  return (
    <aside className="w-64 bg-[#111118] border-r border-[#2A2A38] flex flex-col h-screen overflow-hidden shrink-0">
      {/* Brand Header */}
      <div className="px-6 py-6 border-b border-[#2A2A38] bg-[#1A1A24]/30 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-[#6C63FF]/15 text-[#6C63FF] border border-[#6C63FF]/20 rounded-xl glow-brand">
            <Film className="w-5 h-5 animate-pulse" />
          </div>
          <span className="font-display text-base font-black text-white tracking-wide uppercase">
            VVS Studio
          </span>
        </div>
      </div>

      {/* Active Project Indicator */}
      {activeProject && (
        <div className="px-5 py-4 border-b border-[#2A2A38] bg-[#0A0A0F]/50 shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <button
              onClick={handleBackToDashboard}
              className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-white uppercase font-bold tracking-wider cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 font-mono">
              {statusBadgeMap[activeProject.status] || activeProject.status}
            </span>
          </div>
          <h4 className="text-xs font-bold text-white truncate" title={activeProject.title}>
            {activeProject.title}
          </h4>
        </div>
      )}

      {/* Nav List */}
      <nav className="flex-1 px-4 py-6 overflow-y-auto space-y-1">
        {/* Always visible: Dashboard */}
        <NavLink
          to="/"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer',
              isActive
                ? 'bg-[#6C63FF]/10 text-white border border-[#6C63FF]/20'
                : 'text-gray-400 hover:bg-[#1A1A24] hover:text-white border border-transparent'
            )
          }
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Dashboard</span>
        </NavLink>

        {/* Project Contextual steps */}
        {id && activeProject && (
          <div className="pt-4 space-y-1">
            <div className="px-4 pb-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
              Pipeline Stages
            </div>

            {/* Step 1: Bible Setup */}
            <NavLink
              to={`/projects/${id}/setup`}
              className={({ isActive }) =>
                cn(
                  'flex items-center justify-between px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer',
                  isActive
                    ? 'bg-[#6C63FF]/10 text-white border border-[#6C63FF]/20'
                    : 'text-gray-400 hover:bg-[#1A1A24] hover:text-white border border-transparent'
                )
              }
            >
              <div className="flex items-center gap-3">
                <Settings className="w-4 h-4" />
                <span>Project Setup</span>
              </div>
            </NavLink>

            {/* Step 1.5: Story Plan */}
            <NavLink
              to={`/projects/${id}/planning`}
              className={({ isActive }) =>
                cn(
                  'flex items-center justify-between px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer',
                  isActive
                    ? 'bg-[#6C63FF]/10 text-white border border-[#6C63FF]/20'
                    : 'text-gray-400 hover:bg-[#1A1A24] hover:text-white border border-transparent'
                )
              }
            >
              <div className="flex items-center gap-3">
                <Sparkles className="w-4 h-4 text-[#6C63FF]" />
                <span>Story Plan</span>
              </div>
            </NavLink>

            {/* Step 2: Production Bible */}
            <NavLink
              to={`/projects/${id}/bible`}
              className={({ isActive }) =>
                cn(
                  'flex items-center justify-between px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer',
                  isActive
                    ? 'bg-[#6C63FF]/10 text-white border border-[#6C63FF]/20'
                    : 'text-gray-400 hover:bg-[#1A1A24] hover:text-white border border-transparent'
                )
              }
            >
              <div className="flex items-center gap-3">
                <BookOpen className="w-4 h-4" />
                <span>Production Bible</span>
              </div>
            </NavLink>

            {/* Step 3: Narration Script */}
            <NavLink
              to={`/projects/${id}/script`}
              className={({ isActive }) =>
                cn(
                  'flex items-center justify-between px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer',
                  isActive
                    ? 'bg-[#6C63FF]/10 text-white border border-[#6C63FF]/20'
                    : 'text-gray-400 hover:bg-[#1A1A24] hover:text-white border border-transparent'
                )
              }
            >
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4" />
                <span>Script Workspace</span>
              </div>
            </NavLink>

            {/* Step 4: Scene Storyboards */}
            <NavLink
              to={`/projects/${id}/scenes`}
              className={({ isActive }) =>
                cn(
                  'flex items-center justify-between px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer',
                  isActive
                    ? 'bg-[#6C63FF]/10 text-white border border-[#6C63FF]/20'
                    : 'text-gray-400 hover:bg-[#1A1A24] hover:text-white border border-transparent'
                )
              }
            >
              <div className="flex items-center gap-3">
                <Clapperboard className="w-4 h-4" />
                <span>Scene Breakdown</span>
              </div>
            </NavLink>

            {/* Step 5: Veo Prompts */}
            <NavLink
              to={`/projects/${id}/prompts`}
              className={({ isActive }) =>
                cn(
                  'flex items-center justify-between px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer',
                  isActive
                    ? 'bg-[#6C63FF]/10 text-white border border-[#6C63FF]/20'
                    : 'text-gray-400 hover:bg-[#1A1A24] hover:text-white border border-transparent'
                )
              }
            >
              <div className="flex items-center gap-3">
                <Sparkles className="w-4 h-4" />
                <span>Veo Prompts</span>
              </div>
            </NavLink>

            {/* Step 5.5: YouTube Metadata */}
            <NavLink
              to={`/projects/${id}/metadata`}
              className={({ isActive }) =>
                cn(
                  'flex items-center justify-between px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer',
                  isActive
                    ? 'bg-[#6C63FF]/10 text-white border border-[#6C63FF]/20'
                    : 'text-gray-400 hover:bg-[#1A1A24] hover:text-white border border-transparent'
                )
              }
            >
              <div className="flex items-center gap-3">
                <Sparkles className="w-4 h-4 text-[#D97706]" />
                <span>YouTube Metadata</span>
              </div>
            </NavLink>

            {/* Step 5.6: Usage & Cost */}
            <NavLink
              to={`/projects/${id}/usage`}
              className={({ isActive }) =>
                cn(
                  'flex items-center justify-between px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer',
                  isActive
                    ? 'bg-[#6C63FF]/10 text-white border border-[#6C63FF]/20'
                    : 'text-gray-400 hover:bg-[#1A1A24] hover:text-white border border-transparent'
                )
              }
            >
              <div className="flex items-center gap-3">
                <Coins className="w-4 h-4 text-emerald-400" />
                <span>Usage & Cost</span>
              </div>
            </NavLink>

            {/* Step 6: Export Center */}
            <NavLink
              to={`/projects/${id}/export`}
              className={({ isActive }) =>
                cn(
                  'flex items-center justify-between px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer',
                  isActive
                    ? 'bg-[#6C63FF]/10 text-white border border-[#6C63FF]/20'
                    : 'text-gray-400 hover:bg-[#1A1A24] hover:text-white border border-transparent'
                )
              }
            >
              <div className="flex items-center gap-3">
                <Download className="w-4 h-4" />
                <span>Export Center</span>
              </div>
            </NavLink>
          </div>
        )}
      </nav>

      {/* Global Settings & Debug Console links */}
      <div className="p-4 border-t border-[#2A2A38] bg-[#1A1A24]/10 shrink-0 space-y-1">
        <button
          onClick={() => useUiStore.getState().toggleDebug()}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 text-gray-400 hover:bg-[#1A1A24] hover:text-white border border-transparent cursor-pointer text-left"
        >
          <Terminal className="w-4 h-4 text-[#6C63FF]" />
          <span>Debug Console</span>
        </button>

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer',
              isActive
                ? 'bg-[#6C63FF]/10 text-white border border-[#6C63FF]/20'
                : 'text-gray-400 hover:bg-[#1A1A24] hover:text-white border border-transparent'
            )
          }
        >
          <Settings className="w-4 h-4" />
          <span>AI Settings</span>
        </NavLink>
      </div>
    </aside>
  );
};
export default Sidebar;
