
import React, { useState, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Code,
  Box,
  Hash,
  Search,
  RefreshCw,
} from 'lucide-react';

interface SymbolNode {
  id: string;
  name: string;
  kind: 'file' | 'folder' | 'function' | 'class' | 'method' | 'variable' | 'constant';
  children?: SymbolNode[];
  file?: string;
  lines?: string;
  signature?: string;
}

interface Props {
  data: SymbolNode[];
  onSymbolClick?: (symbol: SymbolNode) => void;
  onRefresh?: () => void;
  loading?: boolean;
}

const KIND_ICONS: Record<string, React.ReactNode> = {
  file: <File className="w-4 h-4 text-gray-400" />,
  folder: <Folder className="w-4 h-4 text-blue-400" />,
  folderOpen: <FolderOpen className="w-4 h-4 text-blue-400" />,
  function: <Code className="w-4 h-4 text-purple-400" />,
  class: <Box className="w-4 h-4 text-yellow-400" />,
  method: <Hash className="w-4 h-4 text-green-400" />,
  variable: <span className="w-4 h-4 text-xs text-orange-400 font-mono">v</span>,
  constant: <span className="w-4 h-4 text-xs text-red-400 font-mono">C</span>,
};

function TreeNode({
  node,
  depth = 0,
  onSymbolClick,
  searchQuery,
}: {
  node: SymbolNode;
  depth?: number;
  onSymbolClick?: (symbol: SymbolNode) => void;
  searchQuery: string;
}) {
  const [isExpanded, setIsExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const isFolder = node.kind === 'folder';
  
  // Filter logic for search
  const matchesSearch = searchQuery
    ? node.name.toLowerCase().includes(searchQuery.toLowerCase())
    : true;
  
  const hasMatchingChildren = node.children?.some(
    child => 
      child.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      child.children?.some(gc => gc.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Auto-expand if search matches children
  React.useEffect(() => {
    if (searchQuery && hasMatchingChildren) {
      setIsExpanded(true);
    }
  }, [searchQuery, hasMatchingChildren]);

  if (searchQuery && !matchesSearch && !hasMatchingChildren) {
    return null;
  }

  const handleClick = () => {
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
    if (!isFolder) {
      onSymbolClick?.(node);
    }
  };

  const getIcon = () => {
    if (isFolder) {
      return isExpanded ? KIND_ICONS.folderOpen : KIND_ICONS.folder;
    }
    return KIND_ICONS[node.kind] || KIND_ICONS.file;
  };

  const highlightMatch = (text: string) => {
    if (!searchQuery) return text;
    const index = text.toLowerCase().indexOf(searchQuery.toLowerCase());
    if (index === -1) return text;
    return (
      <>
        {text.substring(0, index)}
        <span className="bg-yellow-500/30 text-yellow-300">
          {text.substring(index, index + searchQuery.length)}
        </span>
        {text.substring(index + searchQuery.length)}
      </>
    );
  };

  return (
    <div>
      <div
        className={`
          flex items-center gap-1 px-2 py-1 cursor-pointer rounded
          hover:bg-github-surface/50 transition-colors
          ${matchesSearch && searchQuery ? 'bg-github-surface/30' : ''}
        `}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
      >
        {/* Expand/collapse arrow */}
        <span className="w-4 h-4 flex items-center justify-center">
          {hasChildren && (
            isExpanded 
              ? <ChevronDown className="w-3 h-3 text-gray-500" />
              : <ChevronRight className="w-3 h-3 text-gray-500" />
          )}
        </span>

        {/* Icon */}
        {getIcon()}

        {/* Name */}
        <span className="text-sm text-gray-300 truncate flex-1">
          {highlightMatch(node.name)}
        </span>

        {/* Line numbers */}
        {node.lines && (
          <span className="text-xs text-gray-600 font-mono">
            :{node.lines}
          </span>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onSymbolClick={onSymbolClick}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CodeTree({ data, onSymbolClick, onRefresh, loading }: Props) {
  const [searchQuery, setSearchQuery] = useState('');

  // Count total symbols
  const countSymbols = useCallback((nodes: SymbolNode[]): number => {
    return nodes.reduce((acc, node) => {
      return acc + 1 + (node.children ? countSymbols(node.children) : 0);
    }, 0);
  }, []);

  const totalSymbols = countSymbols(data);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-github-border">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-white">Code Explorer</h3>
          <div className="flex items-center gap-1">
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-1 hover:bg-github-surface rounded transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search symbols..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-github-bg border border-github-border rounded-lg text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-github-accent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              ×
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="mt-2 text-xs text-gray-500">
          {totalSymbols} symbols indexed
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading && data.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-center">
              <RefreshCw className="w-6 h-6 text-gray-500 animate-spin mx-auto mb-2" />
              <p className="text-sm text-gray-500">Loading symbols...</p>
            </div>
          </div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm text-gray-500">No symbols found</p>
          </div>
        ) : (
          data.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              onSymbolClick={onSymbolClick}
              searchQuery={searchQuery}
            />
          ))
        )}
      </div>
    </div>
  );
}