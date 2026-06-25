'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface ColumnInfo {
  id: string;
  name: string;
  type: string;
  linkedTableId?: string | null;
  linkedDisplayColumnId?: string | null;
  lookupLinkedColumnId?: string | null;
  lookupFieldId?: string | null;
  rollupLinkedColumnId?: string | null;
  rollupFieldId?: string | null;
  rollupFunction?: string | null;
}

interface TableInfo {
  id: string;
  name: string;
  icon?: string | null;
  columns: ColumnInfo[];
  _count: { rows: number };
}

var TYPE_ICONS: Record<string, string> = {
  text: '𝐓', number: '#', currency: '$', percent: '%', date: '📅', datetime: '🕐',
  email: '✉', phone: '📞', url: '🔗', select: '◉', multi_select: '◈', checkbox: '☑',
  rating: '★', long_text: '¶', attachment: '📎', formula: 'ƒ', lookup: '👀',
  linked_record: '🔗', rollup: '📊', progress: '▓', color: '🎨', approval_status: '✅',
};

var TYPE_COLORS: Record<string, string> = {
  linked_record: '#8B5CF6',
  lookup: '#F59E0B',
  rollup: '#3B82F6',
  formula: '#EC4899',
};

export function DataModelCanvas({ tables }: { tables: TableInfo[] }) {
  var router = useRouter();
  var canvasRef = useRef<HTMLDivElement>(null);
  var [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  var [dragging, setDragging] = useState<string | null>(null);
  var [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  var [scale, setScale] = useState(1);
  var [pan, setPan] = useState({ x: 0, y: 0 });
  var [isPanning, setIsPanning] = useState(false);
  var [panStart, setPanStart] = useState({ x: 0, y: 0 });
  var [selectedTable, setSelectedTable] = useState<string | null>(null);

  // Auto-layout tables in a grid on first load
  useEffect(function() {
    var cols = Math.ceil(Math.sqrt(tables.length));
    var cardW = 280;
    var cardH = 300;
    var gap = 60;
    var initial: Record<string, { x: number; y: number }> = {};
    for (var i = 0; i < tables.length; i++) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      initial[tables[i].id] = { x: col * (cardW + gap) + 40, y: row * (cardH + gap) + 40 };
    }
    setPositions(initial);
  }, [tables.length]);

  // Collect all relationships
  var relationships: { fromTableId: string; fromColumnId: string; fromColumnName: string; toTableId: string; type: string }[] = [];
  for (var ti = 0; ti < tables.length; ti++) {
    var table = tables[ti];
    for (var ci = 0; ci < table.columns.length; ci++) {
      var col = table.columns[ci];
      if (col.type === 'linked_record' && col.linkedTableId) {
        relationships.push({ fromTableId: table.id, fromColumnId: col.id, fromColumnName: col.name, toTableId: col.linkedTableId, type: 'linked_record' });
      }
      if (col.type === 'lookup' && col.lookupLinkedColumnId) {
        // Find which table the lookup points to via the linked column
        for (var tj = 0; tj < tables.length; tj++) {
          var linkedCol = tables[tj].columns.find(function(c) { return c.id === col.lookupLinkedColumnId; });
          if (linkedCol && linkedCol.linkedTableId) {
            relationships.push({ fromTableId: table.id, fromColumnId: col.id, fromColumnName: col.name, toTableId: linkedCol.linkedTableId, type: 'lookup' });
            break;
          }
        }
      }
      if (col.type === 'rollup' && col.rollupLinkedColumnId) {
        for (var tk = 0; tk < tables.length; tk++) {
          var rollupLinkedCol = tables[tk].columns.find(function(c) { return c.id === col.rollupLinkedColumnId; });
          if (rollupLinkedCol && rollupLinkedCol.linkedTableId) {
            relationships.push({ fromTableId: table.id, fromColumnId: col.id, fromColumnName: col.name, toTableId: rollupLinkedCol.linkedTableId, type: 'rollup' });
            break;
          }
        }
      }
    }
  }

  // Drag handlers
  function handleTableMouseDown(e: React.MouseEvent, tableId: string) {
    e.stopPropagation();
    var pos = positions[tableId] || { x: 0, y: 0 };
    setDragging(tableId);
    setDragOffset({ x: e.clientX - pos.x * scale - pan.x, y: e.clientY - pos.y * scale - pan.y });
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (dragging) {
      setPositions(function(prev) {
        var next = Object.assign({}, prev);
        next[dragging!] = {
          x: (e.clientX - dragOffset.x - pan.x) / scale,
          y: (e.clientY - dragOffset.y - pan.y) / scale,
        };
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
    if (e.target === canvasRef.current || (e.target as HTMLElement).dataset.canvas) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      setSelectedTable(null);
    }
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    var newScale = Math.max(0.3, Math.min(2, scale - e.deltaY * 0.001));
    setScale(newScale);
  }

  // Draw relationship lines as SVG
  function getConnectionPoints(fromId: string, toId: string) {
    var from = positions[fromId];
    var to = positions[toId];
    if (!from || !to) return null;
    var cardW = 260;
    var cardH = 40; // approximate header height
    return {
      x1: from.x + cardW / 2,
      y1: from.y + cardH,
      x2: to.x + cardW / 2,
      y2: to.y,
    };
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8fafc' }}>
      {/* Toolbar */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={function() { router.push('/insights'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '14px' }}>← Back to Insights</button>
          <div style={{ width: '1px', height: '24px', background: '#e5e7eb' }} />
          <h1 style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: 0 }}>🗺️ Data Model</h1>
          <span style={{ fontSize: '11px', color: '#9ca3af' }}>{tables.length} tables • {relationships.length} relationships</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={function() { setScale(Math.min(2, scale + 0.1)); }} style={{ padding: '4px 8px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '6px', background: '#fff', cursor: 'pointer' }}>+</button>
          <span style={{ fontSize: '11px', color: '#6b7280', minWidth: '40px', textAlign: 'center' as const }}>{Math.round(scale * 100)}%</span>
          <button onClick={function() { setScale(Math.max(0.3, scale - 0.1)); }} style={{ padding: '4px 8px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '6px', background: '#fff', cursor: 'pointer' }}>−</button>
          <button onClick={function() { setScale(1); setPan({ x: 0, y: 0 }); }} style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid #d1d5db', borderRadius: '6px', background: '#fff', cursor: 'pointer', color: '#6b7280' }}>Reset</button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb', padding: '6px 20px', display: 'flex', gap: '16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '20px', height: '2px', background: '#8B5CF6' }} /><span style={{ fontSize: '10px', color: '#6b7280' }}>Linked Record</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '20px', height: '2px', background: '#F59E0B', borderStyle: 'dashed' }} /><span style={{ fontSize: '10px', color: '#6b7280' }}>Lookup</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '20px', height: '2px', background: '#3B82F6', borderStyle: 'dotted' }} /><span style={{ fontSize: '10px', color: '#6b7280' }}>Rollup</span></div>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        data-canvas="true"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ flex: 1, overflow: 'hidden', position: 'relative', cursor: isPanning ? 'grabbing' : dragging ? 'grabbing' : 'grab', background: 'radial-gradient(circle, #e5e7eb 1px, transparent 1px)', backgroundSize: '20px 20px' }}
      >
        <div style={{ transform: 'translate(' + pan.x + 'px, ' + pan.y + 'px) scale(' + scale + ')', transformOrigin: '0 0', position: 'absolute', top: 0, left: 0 }}>
          {/* Relationship lines */}
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '4000px', height: '4000px', pointerEvents: 'none', overflow: 'visible' }}>
            {relationships.map(function(rel, ri) {
              var pts = getConnectionPoints(rel.fromTableId, rel.toTableId);
              if (!pts) return null;
              var color = rel.type === 'linked_record' ? '#8B5CF6' : rel.type === 'lookup' ? '#F59E0B' : '#3B82F6';
              var dashArray = rel.type === 'linked_record' ? '' : rel.type === 'lookup' ? '6 3' : '3 3';
              var midX = (pts.x1 + pts.x2) / 2;
              var midY = (pts.y1 + pts.y2) / 2;
              var path = 'M ' + pts.x1 + ' ' + pts.y1 + ' C ' + pts.x1 + ' ' + midY + ', ' + pts.x2 + ' ' + midY + ', ' + pts.x2 + ' ' + pts.y2;
              return (
                <g key={ri}>
                  <path d={path} fill="none" stroke={color} strokeWidth="2" strokeDasharray={dashArray} opacity="0.6" />
                  <circle cx={pts.x2} cy={pts.y2} r="4" fill={color} opacity="0.8" />
                </g>
              );
            })}
          </svg>

          {/* Table cards */}
          {tables.map(function(table) {
            var pos = positions[table.id] || { x: 0, y: 0 };
            var isSelected = selectedTable === table.id;
            var hasRelationships = relationships.some(function(r) { return r.fromTableId === table.id || r.toTableId === table.id; });

            return (
              <div
                key={table.id}
                onMouseDown={function(e) { handleTableMouseDown(e, table.id); setSelectedTable(table.id); }}
                style={{
                  position: 'absolute',
                  left: pos.x + 'px',
                  top: pos.y + 'px',
                  width: '260px',
                  background: '#ffffff',
                  border: isSelected ? '2px solid #3B82F6' : '1px solid #d1d5db',
                  borderRadius: '10px',
                  boxShadow: isSelected ? '0 4px 12px rgba(59,130,246,0.15)' : '0 1px 4px rgba(0,0,0,0.06)',
                  cursor: dragging === table.id ? 'grabbing' : 'grab',
                  userSelect: 'none',
                  transition: dragging === table.id ? 'none' : 'box-shadow 0.15s',
                  overflow: 'hidden',
                }}
              >
                {/* Table header */}
                <div style={{ padding: '10px 12px', background: hasRelationships ? '#eff6ff' : '#f9fafb', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '14px' }}>{table.icon || '📊'}</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#111827' }}>{table.name}</span>
                  </div>
                  <span style={{ fontSize: '9px', color: '#9ca3af', background: '#f3f4f6', padding: '1px 6px', borderRadius: '4px' }}>{table._count.rows} rows</span>
                </div>
                {/* Columns */}
                <div style={{ maxHeight: '220px', overflow: 'auto' }}>
                  {table.columns.slice(0, 15).map(function(col) {
                    var typeColor = TYPE_COLORS[col.type] || '#6b7280';
                    var isRelational = col.type === 'linked_record' || col.type === 'lookup' || col.type === 'rollup';
                    var targetTable = col.linkedTableId ? tables.find(function(t) { return t.id === col.linkedTableId; }) : null;

                    return (
                      <div key={col.id} style={{ padding: '4px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', background: isRelational ? '#faf5ff08' : 'transparent' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: '10px', width: '14px', textAlign: 'center' as const }}>{TYPE_ICONS[col.type] || '𝐓'}</span>
                          <span style={{ fontSize: '11px', color: '#374151', truncate: true } as any}>{col.name}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {isRelational && targetTable && (
                            <span style={{ fontSize: '9px', color: typeColor, background: typeColor + '15', padding: '1px 4px', borderRadius: '3px', fontWeight: 600 }}>→ {targetTable.name}</span>
                          )}
                          <span style={{ fontSize: '9px', color: '#9ca3af' }}>{col.type}</span>
                        </div>
                      </div>
                    );
                  })}
                  {table.columns.length > 15 && (
                    <div style={{ padding: '4px 12px', fontSize: '10px', color: '#9ca3af', textAlign: 'center' as const }}>+{table.columns.length - 15} more columns</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}