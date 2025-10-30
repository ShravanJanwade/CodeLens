import { Github } from "lucide-react";

export default function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-github-bg text-center p-6">
      <div className="w-16 h-16 bg-github-surface rounded-2xl flex items-center justify-center mb-4">
        <Github className="w-8 h-8 text-gray-400" />
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">
        Navigate to GitHub
      </h2>
      <p className="text-gray-400 text-sm max-w-xs">
        Open a GitHub repository to start analyzing code with CodeLens AI.
      </p>
    </div>
  );
}
