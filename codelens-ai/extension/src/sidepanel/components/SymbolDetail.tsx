
import { X, ExternalLink, FileCode } from 'lucide-react';
import type { CodeSymbol, GitHubContext } from '@/shared/types';

interface Props {
  symbol: CodeSymbol;
  context: GitHubContext;
  onClose: () => void;
  onNavigate: (symbolName: string) => void;
}

export function SymbolDetail({ symbol, context, onClose, onNavigate }: Props) {
  const githubUrl = `https://github.com/${context.owner}/${context.repo}/blob/${context.branch}/${symbol.filePath}#L${symbol.startLine}-L${symbol.endLine}`;

  return (
    <div className="bg-github-surface border border-github-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-github-border">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            symbol.kind === 'class' ? 'bg-yellow-400' :
            symbol.kind === 'function' ? 'bg-purple-400' :
            'bg-green-400'
          }`} />
          <h3 className="font-medium text-white">{symbol.name}</h3>
          <span className="text-xs text-gray-500 capitalize">({symbol.kind})</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-github-border rounded transition-colors"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Signature */}
        {symbol.signature && (
          <div>
            <div className="text-xs text-gray-500 mb-1">Signature</div>
            <code className="block bg-github-bg px-3 py-2 rounded-lg text-sm text-gray-300 font-mono overflow-x-auto">
              {symbol.signature}
            </code>
          </div>
        )}

        {/* Docstring */}
        {symbol.docstring && (
          <div>
            <div className="text-xs text-gray-500 mb-1">Documentation</div>
            <p className="text-sm text-gray-300 leading-relaxed">
              {symbol.docstring}
            </p>
          </div>
        )}

        {/* Location */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1 text-gray-400">
            <FileCode className="w-3 h-3" />
            <span>{symbol.filePath}</span>
          </div>
          <div className="flex items-center gap-1 text-gray-400">
            <span>Lines {symbol.startLine}-{symbol.endLine}</span>
          </div>
        </div>

        {/* Dependencies */}
        {symbol.dependencies && symbol.dependencies.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 mb-2">Dependencies</div>
            <div className="flex flex-wrap gap-1">
              {symbol.dependencies.map((dep, i) => (
                <button
                  key={i}
                  onClick={() => onNavigate(dep)}
                  className="px-2 py-1 bg-github-bg border border-github-border rounded text-xs text-github-accent hover:bg-github-border transition-colors"
                >
                  {dep}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Callers */}
        {symbol.callers && symbol.callers.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 mb-2">Called by</div>
            <div className="flex flex-wrap gap-1">
              {symbol.callers.map((caller, i) => (
                <button
                  key={i}
                  onClick={() => onNavigate(caller)}
                  className="px-2 py-1 bg-github-bg border border-github-border rounded text-xs text-green-400 hover:bg-github-border transition-colors"
                >
                  ← {caller}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-github-border">
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-1.5 bg-github-bg border border-github-border rounded-lg text-xs text-gray-300 hover:bg-github-border transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            View on GitHub
          </a>
        </div>
      </div>
    </div>
  );
}