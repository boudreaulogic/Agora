'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

var TYPE_ICONS: Record<string, string> = {
  text: 'T', number: '#', currency: '$', percent: '%', date: 'D',
  datetime: 'DT', email: '@', phone: 'Ph', url: 'U', select: 'S',
  multi_select: 'MS', checkbox: 'CB', rating: '*', textarea: 'P',
  attachment: 'A', formula: 'f', lookup: 'L', linked_record: 'LR',
  rollup: 'R', color: 'C', approval_status: 'AP',
};

var TYPE_COLORS: Record<string, string> = {
  linked_record: '#3B82F6',
  lookup: '#8B5CF6',
  rollup: '#F59E0B',
};

var EDGE_COLORS: Record<string, string> = {
  linked_record: '#3B82F6',
  lookup: '#8B5CF6',
  rollup: '#F59E0B',
};

var EDGE_LABELS: Record<string, string> = {
  linked_record: 'Link',
  lookup: 'Lookup',
  rollup: 'Rollup',
};

interface TableNode {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  rowCount: number;
  workspace: { id: string; name: string; icon: string } | null;
  columns: {
    id: string;
    name: string;
    type: string;
    position: number;
    isRelational: boolean;
  }[];
}

interface Edge {
  id: string;
  type: string;
  fromTable: string;
  fromColumn: string;
  fromColumnName: string;
  toTable: string;
  toColumn: string | null;
  label: string;
}

interface Position {
  x: number;
  y: number;
}

export function DataModelClient() {
  var [tables, setTables] = useState<TableNode[]>([]);
  var [edges, setEdges] = useState<Edge[]>([]);
  var [positions, setPositions] = useState<Record<string, Position>>({});
  var [loading, setLoading] = useState(true);
  var [dragging, setDragging] = useState<string | null>(null);
  var [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 });
  var [pan, setPan] = useState<Position>({ x: 0, y: 0 });
  var [isPanning, setIsPanning] = useState(false);
  var [panStart, setPanStart] = useState<Position>({ x: 0, y: 0 });
  var [zoom, setZoom] = useState(1);
  var [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  var [selectedTable, setSelectedTable] = useState<string | null>(null);
  var [searchQuery, setSearchQuery] = useState('');
  var containerRef = useRef<HTMLDivElement>(null);
  var svgRef = useRef<SVGSVGElement>(null);

  useEffect(function() {
    fetch('/api/model')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        setTables(data.tables || []);
        setEdges(data.edges || []);
        // Auto-layout tables in a grid
        var cols = Math.ceil(Math.sqrt(data.tables.length));
        var cardW = 280;
        var cardH = 300;
        var gap = 80;
        var pos: Record<string, Position> = {};
        (data.tables || []).forEach(function(t: TableNode, i: number) {
          var col = i % cols;
          var row = Math.floor(i / cols);
          pos[t.id] = { x: 60 + col * (cardW + gap), y: 60 + row * (cardH + gap) };
        });
        setPositions(pos);
      })
      .catch(function() {})
      .finally(function() { setLoading(false); });
  }, []);

  // Drag handling
  function handleMouseDown(e: React.MouseEvent, tableId: string) {
    if (e.button !== 0) return;
    e.stopPropagation();
    var pos = positions[tableId];
    if (!pos) return;
    setDragging(tableId);
    setDragOffset({ x: (e.clientX - pan.x) / zoom - pos.x, y: (e.clientY - pan.y) / zoom - pos.y });
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (dragging) {
      var newX = (e.clientX - pan.x) / zoom - dragOffset.x;
      var newY = (e.clientY - pan.y) / zoom - dragOffset.y;
      setPositions(function(prev) {
        var next = Object.assign({}, prev);
        next[dragging!] = { x: newX, y: newY };
        return next;
      });
    } else if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  }

  function handleMouseUp() {
    setDragging(null);
    setIsPanning(false);
  }

  function handleCanvasMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    if (e.target === containerRef.current || e.target === svgRef.current) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      setSelectedTable(null);
    }
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    var delta = e.deltaY > 0 ? 0.9 : 1.1;
    var newZoom = Math.min(2, Math.max(0.3, zoom * delta));
    setZoom(newZoom);
  }

  function resetView() {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }

  function fitToScreen() {
    if (tables.length === 0 || !containerRef.current) return;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    tables.forEach(function(t) {
      var p = positions[t.id];
      if (!p) return;
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x + 260 > maxX) maxX = p.x + 260;
      if (p.y + 200 > maxY) maxY = p.y + 200;
    });
    var rect = containerRef.current.getBoundingClientRect();
    var scaleX = (rect.width - 100) / (maxX - minX + 100);
    var scaleY = (rect.height - 100) / (maxY - minY + 100);
    var newZoom = Math.min(scaleX, scaleY, 1.5);
    setZoom(newZoom);
    setPan({
      x: (rect.width - (maxX + minX) * newZoom) / 2,
      y: (rect.height - (maxY + minY) * newZoom) / 2,
    });
  }

  // Calculate edge paths
  function getEdgePath(edge: Edge): { path: string; labelPos: Position; fromPos: Position; toPos: Position } | null {
    var fromPos = positions[edge.fromTable];
    var toPos = positions[edge.toTable];
    if (!fromPos || !toPos) return null;

    var cardW = 260;
    var headerH = 44;
    var rowH = 28;

    var fromTable = tables.find(function(t) { return t.id === edge.fromTable; });
    var toTable = tables.find(function(t) { return t.id === edge.toTable; });
    if (!fromTable || !toTable) return null;

    var fromColIdx = fromTable.columns.findIndex(function(c) { return c.id === edge.fromColumn; });
    var fromY = fromPos.y + headerH + (fromColIdx >= 0 ? fromColIdx * rowH + rowH / 2 : rowH / 2);
    var toColIdx = edge.toColumn ? toTable.columns.findIndex(function(c) { return c.id === edge.toColumn; }) : 0;
    var toY = toPos.y + headerH + (toColIdx >= 0 ? toColIdx * rowH + rowH / 2 : rowH / 2);

    var fromRight = fromPos.x + cardW;
    var toRight = toPos.x + cardW;

    // Determine which sides to connect
    var startX, endX, cp1x, cp2x;
    var fromCenterX = fromPos.x + cardW / 2;
    var toCenterX = toPos.x + cardW / 2;

    if (fromCenterX < toCenterX) {
      startX = fromRight;
      endX = toPos.x;
    } else {
      startX = fromPos.x;
      endX = toRight;
    }

    var dist = Math.abs(endX - startX);
    var cpOffset = Math.max(50, dist * 0.4);
    if (startX < endX) {
      cp1x = startX + cpOffset;
      cp2x = endX - cpOffset;
    } else {
      cp1x = startX - cpOffset;
      cp2x = endX + cpOffset;
    }

    var path = 'M ' + startX + ' ' + fromY + ' C ' + cp1x + ' ' + fromY + ' ' + cp2x + ' ' + toY + ' ' + endX + ' ' + toY;
    var labelPos = { x: (startX + endX) / 2, y: (fromY + toY) / 2 - 10 };

    return { path: path, labelPos: labelPos, fromPos: { x: startX, y: fromY }, toPos: { x: endX, y: toY } };
  }

  // Filter tables by search
  var filteredTables = tables.filter(function(t) {
    if (!searchQuery.trim()) return true;
    var q = searchQuery.toLowerCase();
    return t.name.toLowerCase().includes(q) ||
      t.columns.some(function(c) { return c.name.toLowerCase().includes(q); });
  });

  var connectedTableIds = new Set<string>();
  if (selectedTable) {
    connectedTableIds.add(selectedTable);
    edges.forEach(function(e) {
      if (e.fromTable === selectedTable) connectedTableIds.add(e.toTable);
      if (e.toTable === selectedTable) connectedTableIds.add(e.fromTable);
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">Loading data model...</p>
        </div>
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-4xl mb-3">🗂️</div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">No Tables Yet</h2>
          <p className="text-sm text-gray-500 mb-4">Create some tables to see your data model.</p>
          <Link href="/tables/new" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            Create Table
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-3">
          <h1 className="text-sm font-bold text-gray-900">Data Model</h1>
          <span className="text-xs text-gray-400">{tables.length} tables · {edges.length} relationships</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={function(e) { setSearchQuery(e.target.value); }}
              placeholder="Search tables or columns..."
              className="w-48 pl-7 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
            />
            <svg className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button onClick={function() { setZoom(function(z) { return Math.min(2, z * 1.2); }); }}
              className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100" title="Zoom in">+</button>
            <span className="px-2 py-1 text-[10px] text-gray-400 border-x border-gray-200 min-w-[40px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button onClick={function() { setZoom(function(z) { return Math.max(0.3, z * 0.8); }); }}
              className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100" title="Zoom out">−</button>
          </div>
          <button onClick={fitToScreen} className="px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-lg" title="Fit to screen">
            Fit
          </button>
          <button onClick={resetView} className="px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-lg" title="Reset view">
            Reset
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-white border-b border-gray-200 px-4 py-1.5 flex items-center space-x-4 flex-shrink-0">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Relationships:</span>
        <div className="flex items-center space-x-1.5">
          <div className="w-4 h-0.5 rounded" style={{ backgroundColor: EDGE_COLORS.linked_record }}></div>
          <span className="text-[10px] text-gray-500">Linked Record</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <div className="w-4 h-0.5 rounded" style={{ backgroundColor: EDGE_COLORS.lookup }}></div>
          <span className="text-[10px] text-gray-500">Lookup</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <div className="w-4 h-0.5 rounded" style={{ backgroundColor: EDGE_COLORS.rollup }}></div>
          <span className="text-[10px] text-gray-500">Rollup</span>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative bg-gray-50"
        style={{ cursor: isPanning ? 'grabbing' : dragging ? 'grabbing' : 'grab' }}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* Grid pattern background */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.3 }}>
          <defs>
            <pattern id="grid" width={20 * zoom} height={20 * zoom} patternUnits="userSpaceOnUse"
              x={pan.x % (20 * zoom)} y={pan.y % (20 * zoom)}>
              <circle cx="1" cy="1" r="0.5" fill="#CBD5E1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* SVG layer for edges */}
        <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
          <g transform={'translate(' + pan.x + ',' + pan.y + ') scale(' + zoom + ')'}>
            {edges.map(function(edge) {
              var edgePath = getEdgePath(edge);
              if (!edgePath) return null;

              var color = EDGE_COLORS[edge.type] || '#94A3B8';
              var isHighlighted = hoveredEdge === edge.id ||
                (selectedTable && (edge.fromTable === selectedTable || edge.toTable === selectedTable));
              var isDimmed = selectedTable && !connectedTableIds.has(edge.fromTable) && !connectedTableIds.has(edge.toTable);
              var opacity = isDimmed ? 0.1 : isHighlighted ? 1 : 0.5;

              return (
                <g key={edge.id} style={{ pointerEvents: 'all' }}
                  onMouseEnter={function() { setHoveredEdge(edge.id); }}
                  onMouseLeave={function() { setHoveredEdge(null); }}>
                  {/* Invisible fat hit area */}
                  <path d={edgePath.path} fill="none" stroke="transparent" strokeWidth="12" />
                  {/* Visible line */}
                  <path d={edgePath.path} fill="none" stroke={color} strokeWidth={isHighlighted ? 2.5 : 1.5}
                    strokeDasharray={edge.type === 'lookup' ? '6,3' : edge.type === 'rollup' ? '2,3' : 'none'}
                    opacity={opacity} />
                  {/* Arrow at end */}
                  <circle cx={edgePath.toPos.x} cy={edgePath.toPos.y} r="4" fill={color} opacity={opacity} />
                  {/* Edge label on hover */}
                  {isHighlighted && (
                    <g>
                      <rect x={edgePath.labelPos.x - 40} y={edgePath.labelPos.y - 8} width="80" height="16"
                        rx="4" fill="white" stroke={color} strokeWidth="1" />
                      <text x={edgePath.labelPos.x} y={edgePath.labelPos.y + 3}
                        textAnchor="middle" fontSize="9" fontWeight="600" fill={color}>
                        {edge.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Table cards */}
        <div className="absolute inset-0" style={{ zIndex: 2 }}>
          <div style={{ transform: 'translate(' + pan.x + 'px,' + pan.y + 'px) scale(' + zoom + ')', transformOrigin: '0 0' }}>
            {filteredTables.map(function(table) {
              var pos = positions[table.id];
              if (!pos) return null;

              var isSelected = selectedTable === table.id;
              var isConnected = selectedTable ? connectedTableIds.has(table.id) : true;
              var isDimmed = selectedTable && !isConnected;

              var relationalCols = table.columns.filter(function(c) { return c.isRelational; });
              var regularCols = table.columns.filter(function(c) { return !c.isRelational; });
              var maxCols = 12;
              var displayCols = table.columns.slice(0, maxCols);
              var hiddenCount = Math.max(0, table.columns.length - maxCols);

              return (
                <div
                  key={table.id}
                  className={'absolute select-none transition-shadow duration-200 ' + (isDimmed ? 'opacity-20' : '')}
                  style={{
                    left: pos.x + 'px',
                    top: pos.y + 'px',
                    width: '260px',
                    zIndex: isSelected ? 20 : dragging === table.id ? 20 : 10,
                  }}
                  onMouseDown={function(e) { handleMouseDown(e, table.id); }}
                  onClick={function(e) {
                    e.stopPropagation();
                    setSelectedTable(function(prev) { return prev === table.id ? null : table.id; });
                  }}
                >
                  <div className={'rounded-lg border-2 overflow-hidden bg-white ' +
                    (isSelected ? 'border-blue-500 shadow-lg shadow-blue-500/20' :
                    'border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300')}>

                    {/* Table header */}
                    <div className={'px-3 py-2.5 flex items-center justify-between ' +
                      (isSelected ? 'bg-blue-50' : 'bg-gray-50')} style={{ cursor: 'grab' }}>
                      <div className="flex items-center space-x-2 min-w-0">
                        <span className="text-base flex-shrink-0">{table.icon || '📊'}</span>
                        <div className="min-w-0">
                          <h3 className="text-xs font-bold text-gray-900 truncate">{table.name}</h3>
                          <div className="flex items-center space-x-1.5">
                            <span className="text-[9px] text-gray-400">{table.rowCount} rows</span>
                            <span className="text-[9px] text-gray-300">·</span>
                            <span className="text-[9px] text-gray-400">{table.columns.length} cols</span>
                          </div>
                        </div>
                      </div>
                      <Link href={'/tables/' + table.id}
                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Open table"
                        onClick={function(e) { e.stopPropagation(); }}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </Link>
                    </div>

                    {/* Columns */}
                    <div className="divide-y divide-gray-100">
                      {displayCols.map(function(col) {
                        var isRelEdge = edges.some(function(e) {
                          return e.fromColumn === col.id || e.toColumn === col.id;
                        });
                        var typeColor = TYPE_COLORS[col.type] || '#6B7280';

                        return (
                          <div key={col.id}
                            className={'flex items-center px-3 py-1.5 text-[11px] ' +
                              (isRelEdge ? 'bg-blue-50/40' : 'hover:bg-gray-50')}>
                            <span className={'w-5 h-4 flex items-center justify-center rounded text-[8px] font-bold mr-2 flex-shrink-0 ' +
                              (col.isRelational ? 'text-white' : 'text-gray-400 bg-gray-100')}
                              style={col.isRelational ? { backgroundColor: typeColor } : undefined}>
                              {TYPE_ICONS[col.type] || 'T'}
                            </span>
                            <span className={'truncate ' + (col.isRelational ? 'font-semibold text-gray-800' : 'text-gray-600')}>
                              {col.name}
                            </span>
                            <span className="ml-auto text-[9px] text-gray-300 flex-shrink-0 pl-2">
                              {col.type.replace('_', ' ')}
                            </span>
                          </div>
                        );
                      })}
                      {hiddenCount > 0 && (
                        <div className="px-3 py-1.5 text-[10px] text-gray-400 text-center">
                          + {hiddenCount} more columns
                        </div>
                      )}
                    </div>

                    {/* Workspace badge */}
                    {table.workspace && (
                      <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-100">
                        <span className="text-[9px] text-gray-400">
                          {table.workspace.icon || '📁'} {table.workspace.name}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}