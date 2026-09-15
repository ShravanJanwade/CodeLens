/**
 * CodeLens AI - Background Service Worker
 * Handles extension messaging, API calls, and context management
 */

import { api } from '@/shared/api/client';
import type { 
  GitHubContext, 
  IndexStatus, 
  QueryRequest,
  QueryResponse 
} from '@/shared/types';

// Current GitHub context
let currentContext: GitHubContext | null = null;

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log('🚀 CodeLens AI installed');
  // Initialize API client with settings
  await api.init();
});

// Initialize API client on startup
api.init().catch(err => console.warn('API client init failed:', err));

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes['codelens-storage']) {
    const newSettings = changes['codelens-storage'].newValue?.state?.settings;
    if (newSettings?.apiUrl) {
      console.log('Updating API URL to:', newSettings.apiUrl);
      api.setBaseUrl(newSettings.apiUrl);
    }
  }
});

// Handle messages from content script and sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({ error: error.message }));
  return true; // Keep channel open for async response
});

async function handleMessage(
  message: { type: string; payload?: any },
  _sender: chrome.runtime.MessageSender
): Promise<any> {
  switch (message.type) {
    case 'GET_CONTEXT':
      return currentContext;

    case 'CONTEXT_UPDATED':
      currentContext = message.payload as GitHubContext;
      // Store in local storage
      await chrome.storage.local.set({ currentContext: message.payload });
      // Broadcast to all extension pages
      chrome.runtime.sendMessage({
        type: 'CONTEXT_UPDATED',
        payload: message.payload,
      }).catch(() => {
        // Ignore errors if no listeners
      });
      return { success: true };

    case 'START_INDEX':
      return handleStartIndex(message.payload);

    case 'GET_INDEX_STATUS':
      return handleGetIndexStatus(message.payload.repoId);

    case 'QUERY':
      return handleQuery(message.payload);

    case 'GET_SYMBOLS':
      return handleGetSymbols(message.payload);

    case 'GET_DEPENDENCY_GRAPH':
      return handleGetDependencyGraph(message.payload);

    case 'ANALYZE_SYMBOL':
      return handleAnalyzeSymbol(message.payload);

    case 'CHECK_HEALTH':
      return handleHealthCheck();

    case 'OPEN_SIDEPANEL':
      if (_sender.tab?.windowId) {
        chrome.sidePanel.open({ windowId: _sender.tab.windowId });
      }
      return { success: true };

    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

// Handle start indexing
async function handleStartIndex(payload: { 
  owner: string; 
  repo: string; 
  branch: string;
  force?: boolean;
}): Promise<any> {
  try {
    const result = await api.startIndex(payload.owner, payload.repo, payload.branch, payload.force);
    return result;
  } catch (error) {
    console.error('Failed to start indexing:', error);
    throw error;
  }
}

// Handle get index status
async function handleGetIndexStatus(repoId: string): Promise<IndexStatus | { status: string }> {
  try {
    const status = await api.getIndexStatus(repoId);
    return status;
  } catch (error) {
    // Return not_indexed if 404
    return { status: 'not_indexed' } as IndexStatus;
  }
}

// Handle query
async function handleQuery(payload: QueryRequest): Promise<QueryResponse> {
  try {
    const response = await api.query(payload);
    return response;
  } catch (error) {
    console.error('Query failed:', error);
    throw error;
  }
}

// Handle get symbols
async function handleGetSymbols(payload: { 
  repoId: string; 
  limit?: number 
}): Promise<any> {
  try {
    const symbols = await api.getSymbols(payload.repoId, payload.limit || 100);
    return symbols;
  } catch (error) {
    console.error('Failed to get symbols:', error);
    return [];
  }
}

// Handle get dependency graph
async function handleGetDependencyGraph(_payload: { repoId: string }): Promise<any> {
  // For now, return null to trigger mock graph generation in the component
  // This will be implemented when the backend endpoint is ready
  return null;
}

// Handle analyze symbol
async function handleAnalyzeSymbol(payload: { 
  symbolName: string; 
  filePath: string; 
  repoId?: string 
}): Promise<any> {
  try {
    const repoId = payload.repoId || (currentContext ? `${currentContext.owner}/${currentContext.repo}` : '');
    if (!repoId) {
      throw new Error('No repository context');
    }
    return await api.analyzeSymbol(repoId, payload.symbolName, payload.filePath);
  } catch (error) {
    console.error('Failed to analyze symbol:', error);
    throw error;
  }
}

// Handle health check
async function handleHealthCheck(): Promise<any> {
  try {
    const health = await api.health();
    return health;
  } catch (error) {
    return {
      status: 'error',
      services: {
        gateway: false,
        indexer: false,
        query: false,
      },
    };
  }
}

// Listen for tab updates to detect GitHub pages
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('github.com')) {
    // Tab loaded a GitHub page, content script will extract context
    console.log('GitHub page loaded:', tab.url);
  }
});

// Export for type checking
export {};

// Update: minor optimization