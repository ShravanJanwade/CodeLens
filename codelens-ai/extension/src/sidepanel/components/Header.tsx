import { GitBranch, Settings, RefreshCw } from "lucide-react";
import type { GitHubContext } from "@/shared/types";

interface Props {
  context: GitHubContext;
}

export default function Header({ context }: Props) {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-github-border bg-github-surface">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm">CL</span>
        </div>
        <div>
          <h1 className="font-semibold text-white text-sm">
            {context.owner}/{context.repo}
          </h1>
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <GitBranch className="w-3 h-3" />
            <span>{context.branch}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          className="p-2 hover:bg-github-border rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4 text-gray-400" />
        </button>
        <button
          className="p-2 hover:bg-github-border rounded-lg transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4 text-gray-400" />
        </button>
      </div>
    </header>
  );
}
