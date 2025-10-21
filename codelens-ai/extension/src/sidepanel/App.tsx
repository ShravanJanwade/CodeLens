import { useEffect, useState } from "react";
import { useStore } from "./store";
import Header from "./components/Header";
import IndexPanel from "./components/IndexPanel";
import Chat from "./components/Chat";
import CodeTree from "./components/CodeTree";
import DependencyGraph from "./components/DependencyGraph";
import EmptyState from "./components/EmptyState";
import { MessageCircle, Code2, Network, Settings } from "lucide-react";
import type { GitHubContext } from "@/shared/types";
import { api } from "@/shared/api/client";

type TabType = "chat" | "explore" | "graph" | "settings";

const TABS = [
  { id: "chat" as TabType, label: "Chat", icon: MessageCircle },
  { id: "explore" as TabType, label: "Explore", icon: Code2 },
  { id: "graph" as TabType, label: "Graph", icon: Network },
  { id: "settings" as TabType, label: "Settings", icon: Settings },
];

export default function App() {
  const { 
    context, 
    setContext, 
    indexStatus, 
    setSymbols, 
    settings, 
    currentRepoId,
    clearForRepoSwitch,
    setSelectedCode,
  } = useStore();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("chat");
  const [treeData, setTreeData] = useState<any[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);

  const isIndexed = indexStatus?.status === "completed";
  const repoId = context ? `${context.owner}/${context.repo}` : null;

  // Detect repo changes and clear state
  useEffect(() => {
    if (repoId && repoId !== currentRepoId) {
      console.log(`🔄 Repo changed from ${currentRepoId} to ${repoId}`);
      clearForRepoSwitch();
      useStore.setState({ currentRepoId: repoId });
      setTreeData([]);
    }
  }, [repoId, currentRepoId, clearForRepoSwitch]);

  useEffect(() => {
    // Initialize API client with settings
    api.setBaseUrl(settings.apiUrl);

    // Load context from storage
    chrome.storage.local.get("currentContext", (result) => {
      if (result.currentContext) {
        setContext(result.currentContext as GitHubContext);
      }
      setLoading(false);
    });

    // Listen for context updates
    const handleMessage = (message: any) => {
      if (message.type === "CONTEXT_UPDATED") {
        setContext(message.payload);
      }
      // Handle selected code from content script
      if (message.type === "CODE_SELECTED") {
        setSelectedCode(message.payload.code, message.payload.file);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [setContext, settings.apiUrl, setSelectedCode]);

  // Load symbols when indexed
  useEffect(() => {
    if (isIndexed && context) {
      loadSymbols();
    }
  }, [isIndexed, context]);

  const loadSymbols = async () => {
    if (!context) return;
    setTreeLoading(true);
    try {
      const repoId = `${context.owner}/${context.repo}`;
      const response = await chrome.runtime.sendMessage({
        type: "GET_SYMBOLS",
        payload: { repoId, limit: 200 },
      });
      if (response && !response.error) {
        setSymbols(response);
        setTreeData(buildTree(response));
      }
    } catch (error) {
      console.error("Failed to load symbols:", error);
    } finally {
      setTreeLoading(false);
    }
  };

  // Build tree structure from flat symbols
  const buildTree = (symbolsList: any[]): any[] => {
    const fileMap = new Map<string, any>();

    symbolsList.forEach((symbol) => {
      const filePath = symbol.filePath || "";
      const parts = filePath.split("/");
      let currentPath = "";

      parts.forEach((part: string, index: number) => {
        const isLast = index === parts.length - 1;
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (!fileMap.has(currentPath)) {
          fileMap.set(currentPath, {
            id: currentPath,
            name: part,
            kind: isLast ? "file" : "folder",
            file: isLast ? filePath : undefined,
            children: [],
          });
        }

        // Add symbol as child of file
        if (isLast && symbol.name) {
          const fileNode = fileMap.get(currentPath);
          if (fileNode) {
            fileNode.children.push({
              id: `${symbol.filePath}:${symbol.name}:${symbol.startLine}`,
              name: symbol.name,
              kind: symbol.kind || "function",
              file: symbol.filePath,
              lines: `${symbol.startLine}-${symbol.endLine}`,
              signature: symbol.signature,
            });
          }
        }
      });
    });

    // Build hierarchy
    const roots: any[] = [];
    fileMap.forEach((node, path) => {
      const parentPath = path.split("/").slice(0, -1).join("/");
      if (parentPath && fileMap.has(parentPath)) {
        const parent = fileMap.get(parentPath);
        if (!parent.children.find((c: any) => c.id === node.id)) {
          parent.children.push(node);
        }
      } else if (!path.includes("/")) {
        roots.push(node);
      }
    });

    return roots;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-github-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin w-10 h-10 border-3 border-github-accent border-t-transparent rounded-full" />
          <p className="text-sm text-gray-400">Loading CodeLens AI...</p>
        </div>
      </div>
    );
  }

  if (!context) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col h-screen bg-github-bg text-github-text">
      {/* Premium Header */}
      <Header context={context} />

      {/* Tab Navigation */}
      <div className="flex items-center border-b border-github-border bg-gradient-to-r from-github-bg to-github-surface/50">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isDisabled = (tab.id === "explore" || tab.id === "graph") && !isIndexed;

          return (
            <button
              key={tab.id}
              onClick={() => !isDisabled && setActiveTab(tab.id)}
              disabled={isDisabled}
              className={`
                flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all relative
                ${isActive
                  ? "text-github-accent"
                  : isDisabled
                  ? "text-gray-600 cursor-not-allowed"
                  : "text-gray-400 hover:text-gray-200"
                }
              `}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-github-accent to-blue-400" />
              )}
            </button>
          );
        })}
      </div>

      {/* Index Panel */}
      <IndexPanel context={context} />

      {/* Tab Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {activeTab === "chat" && (
          isIndexed ? (
            <Chat context={context} />
          ) : (
            <div className="flex-1 flex items-center justify-center p-4">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-github-accent/20 to-purple-500/20 flex items-center justify-center mx-auto mb-4">
                  <MessageCircle className="w-8 h-8 text-github-accent" />
                </div>
                <p className="text-gray-400 text-sm">
                  Index this repository to start asking questions about the code.
                </p>
              </div>
            </div>
          )
        )}

        {activeTab === "explore" && isIndexed && (
          <CodeTree
            data={treeData}
            onSymbolClick={(symbol) => {
              // Open GitHub file in new tab at the specific line
              if (symbol.file && context) {
                const startLine = symbol.lines?.split('-')[0] || '';
                const filePath = symbol.file.replace(/^\//, '');
                const url = `https://github.com/${context.owner}/${context.repo}/blob/${context.branch}/${filePath}${startLine ? `#L${startLine}` : ''}`;
                window.open(url, '_blank');
              }
            }}
            onRefresh={loadSymbols}
            loading={treeLoading}
          />
        )}

        {activeTab === "graph" && isIndexed && (
          <DependencyGraph context={context} />
        )}

        {activeTab === "settings" && (
          <SettingsPanel />
        )}
      </main>
    </div>
  );
}

// Settings Panel Component
function SettingsPanel() {
  const { settings, updateSettings } = useStore();

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      <div>
        <h3 className="text-sm font-medium text-white mb-4">Settings</h3>

        {/* API URL */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              API Gateway URL
            </label>
            <input
              type="text"
              value={settings.apiUrl}
              onChange={(e) => updateSettings({ apiUrl: e.target.value })}
              className="w-full px-3 py-2 bg-github-surface border border-github-border rounded-lg text-sm focus:outline-none focus:border-github-accent"
              placeholder="http://localhost:8080"
            />
          </div>

          {/* Theme */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              Theme
            </label>
            <select
              value={settings.theme}
              onChange={(e) => updateSettings({ theme: e.target.value as any })}
              className="w-full px-3 py-2 bg-github-surface border border-github-border rounded-lg text-sm focus:outline-none focus:border-github-accent"
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">System</option>
            </select>
          </div>

          {/* Auto Index */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-300">Auto-index repositories</span>
            <button
              onClick={() => updateSettings({ autoIndex: !settings.autoIndex })}
              className={`
                relative w-10 h-5 rounded-full transition-colors
                ${settings.autoIndex ? "bg-github-accent" : "bg-github-border"}
              `}
            >
              <div
                className={`
                  absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform
                  ${settings.autoIndex ? "left-5" : "left-0.5"}
                `}
              />
            </button>
          </div>

          {/* Show Tooltips */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-300">Show code tooltips</span>
            <button
              onClick={() => updateSettings({ showTooltips: !settings.showTooltips })}
              className={`
                relative w-10 h-5 rounded-full transition-colors
                ${settings.showTooltips ? "bg-github-accent" : "bg-github-border"}
              `}
            >
              <div
                className={`
                  absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform
                  ${settings.showTooltips ? "left-5" : "left-0.5"}
                `}
              />
            </button>
          </div>
        </div>
      </div>

      {/* About Section */}
      <div className="pt-4 border-t border-github-border">
        <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">About</h4>
        <p className="text-xs text-gray-400">
          CodeLens AI v1.0.0
        </p>
        <p className="text-xs text-gray-500 mt-1">
          AI-powered code understanding for GitHub
        </p>
      </div>
    </div>
  );
}
