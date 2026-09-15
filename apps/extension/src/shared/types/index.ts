export interface GitHubContext {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  type: "file" | "directory" | "repo" | "pr" | "commit";
  url: string;
}

// Code Symbol from indexer
export interface CodeSymbol {
  id: string;
  name: string;
  kind: "function" | "class" | "method" | "variable" | "interface" | "type";
  filePath: string;
  startLine: number;
  endLine: number;
  signature: string;
  docstring?: string;
  language: string;
  body?: string;
  dependencies?: string[];
  dependents?: string[];
  callers?: string[];
}

// Index Status
export interface IndexStatus {
  repoId: string;
  status: "pending" | "processing" | "completed" | "failed" | "not_indexed";
  progress: number;
  filesProcessed: number;
  totalFiles: number;
  symbolsIndexed: number;
  error?: string;
}

// Query Request
export interface QueryRequest {
  repoId: string;
  question: string;
  context?: {
    currentFile?: string;
    selectedCode?: string;
    symbolName?: string;
  };
}

// Query Response Source
export interface QuerySource {
  file: string;
  symbol: string;
  lines: string;
  relevance: number;
  snippet?: string;
}

// Query Response
export interface QueryResponse {
  answer: string;
  sources: QuerySource[];
  followUpQuestions: string[];
  error?: string;
}

// Chat Message
export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources?: QuerySource[];
  timestamp: number;
  isLoading?: boolean;
}

// API Response wrapper
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

// Health Check Response
export interface HealthResponse {
  status: "ok" | "degraded" | "error";
  services: {
    gateway: boolean;
    indexer: boolean;
    query: boolean;
  };
  time: string;
}

// WebSocket Message Types
export interface WSMessage {
  type: string;
  payload: unknown;
}

export interface WSIndexProgress {
  type: "INDEX_PROGRESS";
  payload: {
    repoId: string;
    progress: number;
    filesProcessed: number;
    totalFiles: number;
  };
}

export interface WSIndexComplete {
  type: "INDEX_COMPLETE";
  payload: {
    repoId: string;
    symbolsIndexed: number;
  };
}

// Chrome Message Types
export type ChromeMessageType =
  | { type: "GET_CONTEXT"; payload?: undefined }
  | { type: "CONTEXT_UPDATED"; payload: GitHubContext }
  | {
      type: "START_INDEX";
      payload: { owner: string; repo: string; branch: string };
    }
  | { type: "GET_INDEX_STATUS"; payload: { repoId: string } }
  | { type: "QUERY"; payload: QueryRequest }
  | { type: "OPEN_SIDEPANEL"; payload?: undefined }
  | {
      type: "ANALYZE_SYMBOL";
      payload: { symbolName: string; filePath: string };
    }
  | { type: "INDEX_STATUS_UPDATE"; payload: IndexStatus }
  | { type: "CHECK_HEALTH"; payload?: undefined }
  | {
      type: "TOOLTIP_ACTION";
      payload: { action: string; symbolName: string; filePath?: string };
    };

// Settings
export interface Settings {
  apiUrl: string;
  theme: "dark" | "light" | "system";
  autoIndex: boolean;
  showTooltips: boolean;
}
