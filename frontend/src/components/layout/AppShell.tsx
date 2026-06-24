import React from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import AgentStatusBar from '../agent/AgentStatusBar';
import DebugConsoleDrawer from '../agent/DebugConsoleDrawer';

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0A0A0F] text-white font-sans selection:bg-[#6C63FF]/30">
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Content Pane */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Header Bar */}
        <TopBar />

        {/* Page Content Viewport */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-[#0A0A0F] relative pb-28">
          {children}
        </main>
      </div>

      {/* Persistent Bottom Status Bar for AI Agent Runs */}
      <AgentStatusBar />

      {/* Floating Drawer for Telemetry and Agent Logs */}
      <DebugConsoleDrawer />
    </div>
  );
};
export default AppShell;
