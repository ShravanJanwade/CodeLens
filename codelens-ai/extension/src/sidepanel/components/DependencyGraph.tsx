
import React, { useEffect, useRef, useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize,
  RefreshCw,
  Filter,
  Info,
  Network,
} from 'lucide-react';
import { useStore } from '../store';
import type { GitHubContext } from '@/shared/types';

interface GraphNode {
  id: string;
  name: string;
  kind: string;
  filePath: string;
  group: number;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

interface Props {
  context: GitHubContext;
}

export default function DependencyGraph({ context }: Props) {
  const { indexStatus } = useStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [filterKind, setFilterKind] = useState<string>('all');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const repoId = `${context.owner}/${context.repo}`;
  const isIndexed = indexStatus?.status === 'completed';

  useEffect(() => {
    if (isIndexed) {
      loadGraph();
    }
  }, [isIndexed, repoId]);

  const loadGraph = async () => {
    setLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_DEPENDENCY_GRAPH',
        payload: { repoId },
      });
      
      if (response && !response.error && response.nodes) {
        setGraphData(response);
        // Initialize node positions
        initializePositions(response);
      } else {
        // Generate mock graph from symbols if endpoint not available
        const symbols = await chrome.runtime.sendMessage({
          type: 'GET_SYMBOLS',
          payload: { repoId, limit: 100 },
        });
        if (symbols && !symbols.error) {
          const mockGraph = generateMockGraph(symbols);
          setGraphData(mockGraph);
          initializePositions(mockGraph);
        }
      }
    } catch (error) {
      console.error('Failed to load graph:', error);
    } finally {
      setLoading(false);
    }
  };

  const initializePositions = (data: GraphData) => {
    const width = containerRef.current?.clientWidth || 600;
    const height = containerRef.current?.clientHeight || 400;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.35;

    data.nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / data.nodes.length;
      node.x = centerX + radius * Math.cos(angle);
      node.y = centerY + radius * Math.sin(angle);
    });

    // Run simple force simulation
    runForceSimulation(data);
  };

  const runForceSimulation = (data: GraphData) => {
    const iterations = 100;
    const width = containerRef.current?.clientWidth || 600;
    const height = containerRef.current?.clientHeight || 400;

    for (let i = 0; i < iterations; i++) {
      // Repulsion between nodes
      data.nodes.forEach((node1) => {
        data.nodes.forEach((node2) => {
          if (node1.id !== node2.id) {
            const dx = (node2.x || 0) - (node1.x || 0);
            const dy = (node2.y || 0) - (node1.y || 0);
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = 1000 / (dist * dist);
            node1.x = (node1.x || 0) - (dx / dist) * force;
            node1.y = (node1.y || 0) - (dy / dist) * force;
          }
        });
      });

      // Attraction along links
      data.links.forEach((link) => {
        const source = typeof link.source === 'string' 
          ? data.nodes.find(n => n.id === link.source)
          : link.source;
        const target = typeof link.target === 'string'
          ? data.nodes.find(n => n.id === link.target)
          : link.target;
        
        if (source && target) {
          const dx = (target.x || 0) - (source.x || 0);
          const dy = (target.y || 0) - (source.y || 0);
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (dist - 100) * 0.01;
          source.x = (source.x || 0) + (dx / dist) * force;
          source.y = (source.y || 0) + (dy / dist) * force;
          target.x = (target.x || 0) - (dx / dist) * force;
          target.y = (target.y || 0) - (dy / dist) * force;
        }
      });

      // Center gravity
      data.nodes.forEach((node) => {
        node.x = (node.x || 0) * 0.99 + width / 2 * 0.01;
        node.y = (node.y || 0) * 0.99 + height / 2 * 0.01;
      });
    }

    setGraphData({ ...data });
  };

  // Draw graph on canvas
  useEffect(() => {
    if (!graphData || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get DPI for retina displays
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = containerRef.current.clientWidth;
    const displayHeight = containerRef.current.clientHeight;

    // Set actual canvas size (scaled for DPI)
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;

    // Set display size (CSS)
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    // Scale context for DPI
    ctx.scale(dpr, dpr);

    const width = displayWidth;
    const height = displayHeight;

    // Clear canvas with gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#0d1117');
    gradient.addColorStop(1, '#161b22');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(offset.x + width / 2, offset.y + height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-width / 2, -height / 2);

    // Filter nodes
    const filteredNodes = filterKind === 'all' 
      ? graphData.nodes 
      : graphData.nodes.filter(n => n.kind === filterKind);
    const filteredNodeIds = new Set(filteredNodes.map(n => n.id));

    // Draw links with gradient
    graphData.links.forEach((link) => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      
      if (!filteredNodeIds.has(sourceId) || !filteredNodeIds.has(targetId)) return;

      const source = graphData.nodes.find(n => n.id === sourceId);
      const target = graphData.nodes.find(n => n.id === targetId);
      
      if (source && target && source.x && source.y && target.x && target.y) {
        // Create gradient for link
        const linkGradient = ctx.createLinearGradient(source.x, source.y, target.x, target.y);
        linkGradient.addColorStop(0, 'rgba(88, 166, 255, 0.5)');
        linkGradient.addColorStop(1, 'rgba(168, 85, 247, 0.5)');

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = linkGradient;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Draw arrow
        const angle = Math.atan2(target.y - source.y, target.x - source.x);
        const arrowLength = 10;
        const arrowX = target.x - 18 * Math.cos(angle);
        const arrowY = target.y - 18 * Math.sin(angle);
        
        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(
          arrowX - arrowLength * Math.cos(angle - Math.PI / 6),
          arrowY - arrowLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          arrowX - arrowLength * Math.cos(angle + Math.PI / 6),
          arrowY - arrowLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fillStyle = 'rgba(88, 166, 255, 0.7)';
        ctx.fill();
      }
    });

    // Draw nodes with glow effect
    filteredNodes.forEach((node) => {
      if (!node.x || !node.y) return;

      const isSelected = selectedNode?.id === node.id;
      const radius = isSelected ? 14 : 10;
      const color = getNodeColor(node.kind);

      // Glow effect
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 4, 0, 2 * Math.PI);
      const glowGradient = ctx.createRadialGradient(node.x, node.y, radius, node.x, node.y, radius + 8);
      glowGradient.addColorStop(0, `${color}40`);
      glowGradient.addColorStop(1, 'transparent');
      ctx.fillStyle = glowGradient;
      ctx.fill();

      // Node circle with gradient
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
      const nodeGradient = ctx.createRadialGradient(node.x - radius/3, node.y - radius/3, 0, node.x, node.y, radius);
      nodeGradient.addColorStop(0, `${color}ff`);
      nodeGradient.addColorStop(1, `${color}aa`);
      ctx.fillStyle = nodeGradient;
      ctx.fill();

      // Node border
      ctx.strokeStyle = isSelected ? '#ffffff' : `${color}`;
      ctx.lineWidth = isSelected ? 3 : 1.5;
      ctx.stroke();

      // Node label with shadow for readability
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = '#e6edf3';
      ctx.font = `500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(node.name, node.x, node.y + radius + 6);
      
      // Reset shadow
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    });

    ctx.restore();
  }, [graphData, zoom, offset, selectedNode, filterKind]);

  // Handle canvas resize
  useEffect(() => {
    const handleResize = () => {
      // Force redraw on resize by updating a dependency
      if (canvasRef.current && containerRef.current) {
        // Just trigger a re-render, the draw effect handles DPI scaling
        setGraphData(prev => prev ? { ...prev } : null);
      }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || !graphData) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - offset.x - canvas.width / 2) / zoom + canvas.width / 2;
    const y = (e.clientY - rect.top - offset.y - canvas.height / 2) / zoom + canvas.height / 2;

    // Check if clicked on a node
    const clickedNode = graphData.nodes.find((node) => {
      if (!node.x || !node.y) return false;
      const dx = x - node.x;
      const dy = y - node.y;
      return Math.sqrt(dx * dx + dy * dy) < 15;
    });

    if (clickedNode) {
      setSelectedNode(clickedNode);
    } else {
      setSelectedNode(null);
      setIsDragging(true);
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((prev) => Math.max(0.1, Math.min(5, prev * delta)));
  };

  const resetView = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setSelectedNode(null);
  };

  if (!isIndexed) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <Network className="w-12 h-12 text-gray-600 mb-4" />
        <p className="text-gray-400 text-sm">Index the repository to view the dependency graph</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-github-border">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={filterKind}
            onChange={(e) => setFilterKind(e.target.value)}
            className="bg-github-surface border border-github-border rounded-md px-2 py-1 text-sm"
          >
            <option value="all">All Types</option>
            <option value="function">Functions</option>
            <option value="class">Classes</option>
            <option value="method">Methods</option>
          </select>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.min(5, z * 1.2))}
            className="p-2 hover:bg-github-surface rounded-lg"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.1, z * 0.8))}
            className="p-2 hover:bg-github-surface rounded-lg"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={resetView}
            className="p-2 hover:bg-github-surface rounded-lg"
            title="Reset View"
          >
            <Maximize className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={loadGraph}
            className="p-2 hover:bg-github-surface rounded-lg"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 relative cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="w-full h-full"
          />
        )}

        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-github-surface/90 backdrop-blur border border-github-border rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-2">Legend</p>
          <div className="space-y-1">
            {[
              { kind: 'function', label: 'Function' },
              { kind: 'class', label: 'Class' },
              { kind: 'method', label: 'Method' },
            ].map(({ kind, label }) => (
              <div key={kind} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: getNodeColor(kind) }}
                />
                <span className="text-xs text-gray-300">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Selected Node Info */}
        {selectedNode && (
          <div className="absolute top-4 right-4 bg-github-surface/90 backdrop-blur border border-github-border rounded-lg p-4 max-w-xs">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-github-accent mt-0.5" />
              <div>
                <p className="font-medium text-white">{selectedNode.name}</p>
                <p className="text-xs text-gray-400 capitalize">{selectedNode.kind}</p>
                <p className="text-xs text-gray-500 mt-1 truncate">{selectedNode.filePath}</p>
                <button
                  onClick={() => {
                    const url = `https://github.com/${context.owner}/${context.repo}/blob/${context.branch}/${selectedNode.filePath}`;
                    window.open(url, '_blank');
                  }}
                  className="text-xs text-github-accent hover:underline mt-2"
                >
                  View in GitHub →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Helper functions
function getNodeColor(kind: string): string {
  switch (kind) {
    case 'function':
      return '#a855f7';
    case 'class':
      return '#eab308';
    case 'method':
      return '#3b82f6';
    case 'variable':
      return '#22c55e';
    default:
      return '#6b7280';
  }
}

function generateMockGraph(symbols: any[]): GraphData {
  const nodes: GraphNode[] = symbols.slice(0, 50).map((s) => ({
    id: `${s.filePath}:${s.name}`,
    name: s.name,
    kind: s.kind,
    filePath: s.filePath,
    group: getGroupFromKind(s.kind),
  }));

  // Generate mock links based on file proximity
  const links: GraphLink[] = [];
  const fileGroups = new Map<string, string[]>();
  
  nodes.forEach((node) => {
    const dir = node.filePath.split('/').slice(0, -1).join('/');
    const existing = fileGroups.get(dir) || [];
    existing.push(node.id);
    fileGroups.set(dir, existing);
  });

  fileGroups.forEach((nodeIds) => {
    for (let i = 0; i < nodeIds.length - 1; i++) {
      if (Math.random() > 0.5) {
        links.push({
          source: nodeIds[i],
          target: nodeIds[i + 1],
          type: 'imports',
        });
      }
    }
  });

  return { nodes, links };
}

function getGroupFromKind(kind: string): number {
  switch (kind) {
    case 'class':
      return 1;
    case 'function':
      return 2;
    case 'method':
      return 3;
    default:
      return 4;
  }
}