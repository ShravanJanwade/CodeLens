import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  GitHubContext,
  IndexStatus,
  Message,
  Settings,
} from "@/shared/types";

interface StoreState {
  // Context
  context: GitHubContext | null;
  setContext: (context: GitHubContext | null) => void;
  currentRepoId: string | null;

  // Indexing
  indexStatus: IndexStatus | null;
  setIndexStatus: (status: IndexStatus | null) => void;

  // Chat
  messages: Message[];
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  clearMessages: () => void;

  // Query state
  isQuerying: boolean;
  setIsQuerying: (value: boolean) => void;

  // Symbols
  symbols: Array<{ name: string; kind: string; filePath: string }>;
  setSymbols: (symbols: StoreState["symbols"]) => void;

  // Selected Code (for code selection feature)
  selectedCode: string | null;
  selectedCodeFile: string | null;
  setSelectedCode: (code: string | null, file?: string | null) => void;

  // Settings
  settings: Settings;
  updateSettings: (settings: Partial<Settings>) => void;

  // UI State
  activeTab: "chat" | "explore" | "settings";
  setActiveTab: (tab: StoreState["activeTab"]) => void;

  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // Clear state for repo switch
  clearForRepoSwitch: () => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      // Context
      context: null,
      setContext: (context) => set({ context }),
      currentRepoId: null,

      // Indexing
      indexStatus: null,
      setIndexStatus: (indexStatus) => set({ indexStatus }),

      // Chat
      messages: [],
      addMessage: (message) =>
        set((state) => ({
          messages: [...state.messages, message],
        })),
      updateMessage: (id, updates) =>
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === id ? { ...msg, ...updates } : msg
          ),
        })),
      clearMessages: () => set({ messages: [] }),

      // Query state
      isQuerying: false,
      setIsQuerying: (isQuerying) => set({ isQuerying }),

      // Symbols
      symbols: [],
      setSymbols: (symbols) => set({ symbols }),

      // Selected Code
      selectedCode: null,
      selectedCodeFile: null,
      setSelectedCode: (code, file = null) => set({ selectedCode: code, selectedCodeFile: file }),

      // Settings
      settings: {
        apiUrl: "http://localhost:8080",
        theme: "dark",
        autoIndex: true,
        showTooltips: true,
      },
      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),

      // UI State
      activeTab: "chat",
      setActiveTab: (activeTab) => set({ activeTab }),

      sidebarOpen: false,
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

      // Clear state for repo switch
      clearForRepoSwitch: () => set({
        indexStatus: null,
        messages: [],
        symbols: [],
        selectedCode: null,
        selectedCodeFile: null,
        isQuerying: false,
      }),
    }),
    {
      name: "codelens-storage",
      partialize: (state) => ({
        settings: state.settings,
        messages: state.messages.slice(-50), // Keep last 50 messages
      }),
    }
  )
);

// Update: minor optimization