import { useEffect, useState } from "react";
import {
  Zap,
  Github,
  Settings,
  CheckCircle,
  ExternalLink,
  Database,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import type {
  GitHubContext,
  HealthResponse,
  IndexStatus,
} from "@/shared/types";

export default function Popup() {
  const [context, setContext] = useState<GitHubContext | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get current context
      const result = await chrome.storage.local.get("currentContext");
      if (result.currentContext) {
        setContext(result.currentContext);

        // Get index status
        const statusResponse = await chrome.runtime.sendMessage({
          type: "GET_INDEX_STATUS",
          payload: {
            repoId: `${result.currentContext.owner}/${result.currentContext.repo}`,
          },
        });
        if (statusResponse && !statusResponse.error) {
          setIndexStatus(statusResponse);
        }
      }

      // Check health
      const healthResponse = await chrome.runtime.sendMessage({
        type: "CHECK_HEALTH",
      });
      if (healthResponse) {
        setHealth(healthResponse);
      }
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  const openSidePanel = async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    }
  };

  const openSettings = () => {
    chrome.runtime.openOptionsPage();
  };

  const isIndexed = indexStatus?.status === "completed";

  return (
    <div className="w-80 bg-github-bg text-github-text">
      {/* Header */}
      <div className="p-4 border-b border-github-border bg-github-surface">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-white text-sm">CodeLens AI</h1>
              <p className="text-xs text-gray-400">Code Understanding</p>
            </div>
          </div>
          <button
            onClick={openSettings}
            className="p-2 hover:bg-github-border rounded-lg transition-colors"
          >
            <Settings className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        ) : (
          <>
            {/* Repository Context */}
            {context ? (
              <div className="bg-github-surface border border-github-border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Github className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-400 uppercase tracking-wider">
                    Current Repository
                  </span>
                </div>
                <p className="font-medium text-white text-sm truncate">
                  {context.owner}/{context.repo}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Branch: {context.branch}
                </p>

                {/* Index Status */}
                <div className="mt-3 pt-3 border-t border-github-border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-gray-400">
                        Index Status
                      </span>
                    </div>
                    {isIndexed ? (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <CheckCircle className="w-3 h-3" />
                        Indexed
                      </span>
                    ) : indexStatus?.status === "processing" ? (
                      <span className="text-xs text-yellow-400">
                        Indexing...{" "}
                        {Math.round((indexStatus.progress || 0) * 100)}%
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Not indexed</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-github-surface border border-github-border rounded-lg p-4 text-center">
                <Github className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                <p className="text-sm text-gray-400">
                  Navigate to a GitHub repository to get started
                </p>
              </div>
            )}

            {/* Quick Actions */}
            <div className="space-y-2">
              <button
                onClick={openSidePanel}
                disabled={!context}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-github-accent text-white rounded-lg font-medium text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                Open CodeLens Panel
              </button>

              {context && (
                <a
                  href={`https://github.com/${context.owner}/${context.repo}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-github-surface border border-github-border text-gray-300 rounded-lg text-sm hover:bg-github-border transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  View on GitHub
                </a>
              )}
            </div>

            {/* Service Status */}
            <div className="bg-github-surface border border-github-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400 uppercase tracking-wider">
                  Service Status
                </span>
                <button
                  onClick={loadData}
                  className="p-1 hover:bg-github-border rounded transition-colors"
                >
                  <RefreshCw className="w-3 h-3 text-gray-400" />
                </button>
              </div>

              <div className="space-y-1.5">
                <ServiceStatus
                  name="Gateway"
                  status={health?.services?.gateway ?? false}
                />
                <ServiceStatus
                  name="Indexer"
                  status={health?.services?.indexer ?? false}
                />
                <ServiceStatus
                  name="Query"
                  status={health?.services?.query ?? false}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-github-border bg-github-surface">
        <p className="text-xs text-gray-500 text-center">
          CodeLens AI v1.0.0 • Made for developers
        </p>
      </div>
    </div>
  );
}

function ServiceStatus({ name, status }: { name: string; status: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-400">{name}</span>
      <div className="flex items-center gap-1">
        {status ? (
          <>
            <div className="w-1.5 h-1.5 bg-green-400 rounded-full" />
            <span className="text-green-400">Online</span>
          </>
        ) : (
          <>
            <div className="w-1.5 h-1.5 bg-red-400 rounded-full" />
            <span className="text-red-400">Offline</span>
          </>
        )}
      </div>
    </div>
  );
}

// Update: minor optimization
// Update: minor optimization