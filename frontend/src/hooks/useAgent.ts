import { useState, useCallback } from 'react';
import { useUiStore } from '../store/ui.store';
import { useProjectStore } from '../store/project.store';
import { toast } from 'react-hot-toast';

export function useAgent() {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startAgentRun = useUiStore((s) => s.startAgentRun);
  const updateAgentProgress = useUiStore((s) => s.updateAgentProgress);
  const stopAgentRun = useUiStore((s) => s.stopAgentRun);
  const tickAgentTimer = useUiStore((s) => s.tickAgentTimer);
  const fetchProjectDetails = useProjectStore((s) => s.fetchProjectDetails);

  const invokeAgent = useCallback(
    async (
      projectId: string,
      agentName: string,
      apiCall: () => Promise<any>
    ) => {
      setIsRunning(true);
      setError(null);
      startAgentRun(agentName);

      let eventSource: EventSource | null = null;
      let timer: any = null;

      try {
        // 1. Establish the EventSource connection first, so we don't miss the initial chunks
        const streamUrl = `/api/v1/stream/${projectId}/${agentName}`;
        eventSource = new EventSource(streamUrl);

        // 2. Start elapsed time clock
        timer = setInterval(() => {
          tickAgentTimer();
        }, 1000);

        eventSource.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            
            if (payload.type === 'progress') {
              useUiStore.getState().updateAgentProgressInfo({
                current: payload.current,
                total: payload.total,
                phase: payload.phase,
                scene: payload.scene,
              });
            } else if (payload.type === 'chunk') {
              updateAgentProgress(payload.data);
            } else if (payload.type === 'hook_rewrite_start') {
              useProjectStore.getState().setHookRewriteLoading(true);
            } else if (payload.type === 'hook_rewrite_complete') {
              useProjectStore.getState().setHookRewriteLoading(false);
              fetchProjectDetails(projectId);
            } else if (payload.type === 'hook_score') {
              fetchProjectDetails(projectId);
            } else if (payload.type === 'done') {
              // Generation successfully completed
              cleanup();
              fetchProjectDetails(projectId).then(() => {
                toast.success(`${agentName} execution completed successfully!`);
              });
            } else if (payload.type === 'error') {
              cleanup();
              setError(payload.data);
              toast.error(`${agentName} failed: ${payload.data}`);
            }
          } catch (err) {
            console.error('Error parsing SSE event data:', err);
          }
        };

        eventSource.onerror = (err) => {
          console.error('EventSource connection error:', err);
          cleanup();
          setError('Lost connection to backend server.');
          toast.error('SSE Stream connection interrupted.');
        };

        // Helper to shut down connections
        const cleanup = () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          if (timer) {
            clearInterval(timer);
            timer = null;
          }
          setIsRunning(false);
          stopAgentRun();
          useProjectStore.getState().setHookRewriteLoading(false);
        };

        // 3. Trigger the Express endpoint to kick off the background worker
        await apiCall();

      } catch (err: any) {
        if (eventSource) eventSource.close();
        if (timer) clearInterval(timer);
        setIsRunning(false);
        stopAgentRun();
        
        let displayMsg = err.message || 'Error executing agent';
        if (err.status === 409 || err.reason) {
          if (err.reason === 'generation_in_progress') {
            displayMsg = `Generation is already in progress for this project (Active: ${err.active_phase || 'another task'}).`;
          } else if (err.reason === 'previous_phase_incomplete') {
            displayMsg = err.message || 'Predecessor phases are incomplete. Please complete the preceding phases first.';
          }
        }
        
        setError(displayMsg);
        toast.error(displayMsg);
      }
    },
    [startAgentRun, updateAgentProgress, stopAgentRun, tickAgentTimer, fetchProjectDetails]
  );

  return {
    isRunning,
    error,
    invokeAgent,
  };
}
