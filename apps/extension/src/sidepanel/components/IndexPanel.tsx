import { useEffect, useState } from "react";
import { Database, CheckCircle, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { useStore } from "../store";
import type { GitHubContext } from "@/shared/types";

interface Props {
  context: GitHubContext;
}

export default function IndexPanel({ context }: Props) {
  const { indexStatus, setIndexStatus } = useStore();
  const [isStarting, setIsStarting] = useState(false);
  const repoId = `${context.owner}/${context.repo}`;

  // Check index status on mount and poll while processing/pending
  useEffect(() => {
    checkStatus();

    // Poll for status updates while processing or pending
    let intervalId: NodeJS.Timeout;
    if (indexStatus?.status === "processing" || indexStatus?.status === "pending") {
      intervalId = setInterval(checkStatus, 2000); // Poll every 2 seconds
    }

    // Listen for status updates
    const handleMessage = (message: any) => {
      if (
        message.type === "INDEX_STATUS_UPDATE" &&
        message.payload.repoId === repoId
      ) {
        setIndexStatus(message.payload);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      if (intervalId) clearInterval(intervalId);
    };
  }, [repoId, indexStatus?.status]);

  const checkStatus = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_INDEX_STATUS",
        payload: { repoId },
      });
      if (response && !response.error) {
        setIndexStatus(response);
      }
    } catch (error) {
      console.error("Failed to check status:", error);
    }
  };

  const startIndexing = async (force: boolean = false) => {
    setIsStarting(true);
    try {
      const response = await chrome.runtime.sendMessage({
        type: "START_INDEX",
        payload: {
          owner: context.owner,
          repo: context.repo,
          branch: context.branch,
          force,
        },
      });
      if (response && !response.error) {
        // Update to pending immediately
        setIndexStatus({ 
          status: "pending", 
          repoId, 
          progress: 0,
          filesProcessed: 0,
          totalFiles: 0,
          symbolsIndexed: 0,
        });
      }
    } catch (error) {
      console.error("Failed to start indexing:", error);
    } finally {
      setIsStarting(false);
    }
  };

  const status = indexStatus?.status;
  const progress = indexStatus?.progress || 0;
  const errorMessage = indexStatus?.error;

  // Determine indexing step for visual feedback
  const getIndexingStep = () => {
    if (status === "pending") return "Cloning repository...";
    if (progress < 0.3) return "Parsing code files...";
    if (progress < 0.7) return "Extracting symbols...";
    if (progress < 0.95) return "Generating embeddings...";
    return "Finalizing...";
  };

  return (
    <div className="px-4 py-3 border-b border-github-border bg-gradient-to-r from-github-bg to-github-surface/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${status === "completed" ? "bg-green-500/10" : status === "processing" || status === "pending" ? "bg-blue-500/10" : "bg-gray-500/10"}`}>
            <Database className={`w-4 h-4 ${status === "completed" ? "text-green-400" : status === "processing" || status === "pending" ? "text-blue-400 animate-pulse" : "text-gray-400"}`} />
          </div>
          <span className="text-sm font-medium">Repository Index</span>
        </div>

        {status === "completed" ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-green-500/10 rounded-full">
              <CheckCircle className="w-3.5 h-3.5 text-green-400" />
              <span className="text-green-400 text-xs font-medium">{indexStatus?.symbolsIndexed} symbols</span>
            </div>
            <button
              onClick={() => startIndexing(true)}
              disabled={isStarting}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-github-surface rounded-lg transition-all"
              title="Re-index repository"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : status === "failed" ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-500/10 rounded-full">
              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
              <span className="text-red-400 text-xs font-medium">Failed</span>
            </div>
            <button
              onClick={() => startIndexing(true)}
              disabled={isStarting}
              className="px-3 py-1 bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-medium rounded-lg hover:bg-red-500/30 transition-all"
            >
              Retry
            </button>
          </div>
        ) : status === "processing" || status === "pending" ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-500/10 rounded-full">
              <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
              <span className="text-blue-400 text-xs font-medium">
                {status === "pending" ? "Starting..." : `${Math.round(progress * 100)}%`}
              </span>
            </div>
          </div>
        ) : (
          <button
            onClick={() => startIndexing(false)}
            disabled={isStarting}
            className="group px-4 py-1.5 bg-gradient-to-r from-github-accent to-blue-500 text-white text-xs font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-all shadow-lg shadow-github-accent/20"
          >
            <span className="flex items-center gap-1.5">
              {isStarting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Starting...
                </>
              ) : (
                "Index Repository"
              )}
            </span>
          </button>
        )}
      </div>

      {/* Enhanced Progress Bar */}
      {(status === "processing" || status === "pending") && (
        <div className="mt-3 space-y-2">
          {/* Progress bar with gradient and shimmer */}
          <div className="relative w-full bg-github-border/50 rounded-full h-2 overflow-hidden">
            {/* Animated gradient progress */}
            <div
              className="h-full rounded-full transition-all duration-500 ease-out relative"
              style={{ 
                width: status === "pending" ? "10%" : `${progress * 100}%`,
                background: "linear-gradient(90deg, #58a6ff, #a855f7, #58a6ff)",
                backgroundSize: "200% 100%",
                animation: "shimmer 2s linear infinite"
              }}
            />
            {/* Shimmer overlay */}
            <div 
              className="absolute inset-0 w-full h-full"
              style={{
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)",
                animation: "shimmer 1.5s ease-in-out infinite"
              }}
            />
          </div>
          
          {/* Status text */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400 flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
              {getIndexingStep()}
            </span>
            {status === "processing" && (
              <span className="text-gray-500">
                {indexStatus?.filesProcessed} / {indexStatus?.totalFiles} files
              </span>
            )}
          </div>
        </div>
      )}

      {status === "failed" && errorMessage && (
        <div className="mt-3 p-2.5 bg-red-900/20 border border-red-800/50 rounded-lg text-xs text-red-300">
          <p className="font-medium mb-1">Error Details:</p>
          {errorMessage}
        </div>
      )}
      
      {/* Add shimmer animation keyframes via style tag */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
