import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import AppShell from './components/layout/AppShell';
import Dashboard from './pages/Dashboard';
import ProjectSetup from './pages/ProjectSetup';
import StoryPlanWorkspace from './pages/StoryPlanWorkspace';
import ProductionBible from './pages/ProductionBible';
import ScriptWorkspace from './pages/ScriptWorkspace';
import SceneWorkspace from './pages/SceneWorkspace';
import VeoPromptWorkspace from './pages/VeoPromptWorkspace';
import MetadataWorkspace from './pages/MetadataWorkspace';
import ExportCenter from './pages/ExportCenter';
import UsageWorkspace from './pages/UsageWorkspace';
import AISettings from './pages/AISettings';
import { useProjectStore } from './store/project.store';
import { useSettingsStore } from './store/settings.store';

export default function App() {
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);

  const settings = useSettingsStore((s) => s.settings);
  const optimizeModelRouting = useSettingsStore((s) => s.optimizeModelRouting);

  useEffect(() => {
    fetchProjects();
    fetchSettings();
  }, [fetchProjects, fetchSettings]);

  useEffect(() => {
    if (settings) {
      optimizeModelRouting(false);
    }
  }, [settings, optimizeModelRouting]);

  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects/:id/setup" element={<ProjectSetup />} />
          <Route path="/projects/:id/planning" element={<StoryPlanWorkspace />} />
          <Route path="/projects/:id/bible" element={<ProductionBible />} />
          <Route path="/projects/:id/script" element={<ScriptWorkspace />} />
          <Route path="/projects/:id/scenes" element={<SceneWorkspace />} />
          <Route path="/projects/:id/prompts" element={<VeoPromptWorkspace />} />
          <Route path="/projects/:id/metadata" element={<MetadataWorkspace />} />
          <Route path="/projects/:id/export" element={<ExportCenter />} />
          <Route path="/projects/:id/usage" element={<UsageWorkspace />} />
          <Route path="/settings" element={<AISettings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
      <Toaster
        position="top-right"
        toastOptions={{
          className: 'glass-panel text-white border border-[#2A2A38]',
          style: {
            background: '#111118',
            color: '#fff',
            border: '1px solid #2A2A38',
            fontSize: '13px',
          },
        }}
      />
    </BrowserRouter>
  );
}
