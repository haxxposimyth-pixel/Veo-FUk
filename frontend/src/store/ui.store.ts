import { create } from 'zustand';

interface AgentRunState {
  agentName: string;
  progressText: string;
  tokens: number;
  timerSeconds: number;
  progressInfo?: {
    current: number;
    total: number;
    phase: number;
    scene: number;
  };
}

interface UiState {
  activeModal: string | null;
  activeAgentRun: AgentRunState | null;
  isDebugOpen: boolean;
  
  // Actions
  setActiveModal: (modal: string | null) => void;
  startAgentRun: (agentName: string) => void;
  updateAgentProgress: (text: string, tokens?: number) => void;
  updateAgentProgressInfo: (info: { current: number; total: number; phase: number; scene: number }) => void;
  tickAgentTimer: () => void;
  stopAgentRun: () => void;
  toggleDebug: (open?: boolean) => void;
}

let timerInterval: any = null;

export const useUiStore = create<UiState>((set) => ({
  activeModal: null,
  activeAgentRun: null,
  isDebugOpen: false,

  setActiveModal: (activeModal) => set({ activeModal }),
  toggleDebug: (open) => set((s) => ({ isDebugOpen: open !== undefined ? open : !s.isDebugOpen })),

  startAgentRun: (agentName) => {
    // Clear any existing timer just in case
    if (timerInterval) clearInterval(timerInterval);

    set({
      activeAgentRun: {
        agentName,
        progressText: '',
        tokens: 0,
        timerSeconds: 0,
      },
    });
  },

  updateAgentProgress: (text, tokens) => {
    set((state) => {
      if (!state.activeAgentRun) return {};
      
      // Concatenate text chunks for stream preview, parse live tokens if passed
      const currentTokens = tokens !== undefined ? tokens : state.activeAgentRun.tokens + 1;
      
      return {
        activeAgentRun: {
          ...state.activeAgentRun,
          progressText: state.activeAgentRun.progressText + text,
          tokens: currentTokens,
        },
      };
    });
  },

  updateAgentProgressInfo: (info) => {
    set((state) => {
      if (!state.activeAgentRun) return {};
      return {
        activeAgentRun: {
          ...state.activeAgentRun,
          progressInfo: info,
        },
      };
    });
  },

  tickAgentTimer: () => {
    set((state) => {
      if (!state.activeAgentRun) return {};
      return {
        activeAgentRun: {
          ...state.activeAgentRun,
          timerSeconds: state.activeAgentRun.timerSeconds + 1,
        },
      };
    });
  },

  stopAgentRun: () => {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    set({ activeAgentRun: null });
  },
}));
export { timerInterval };
