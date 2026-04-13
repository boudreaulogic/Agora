'use client';

import { usePresenceStore } from '@/lib/presenceStore';

const USER_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // purple
  '#EC4899', // pink
];

export function getUserColor(userId: string): string {
  // Deterministic color based on userId
  const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return USER_COLORS[hash % USER_COLORS.length];
}

export function CellPresence({ cellId }: { cellId: string }) {
  const presence = usePresenceStore(state => state.presence[cellId]);

  if (!presence) return null;

  return (
    <>
      {/* Border around cell */}
      <div 
        className="absolute inset-0 pointer-events-none z-10 border-2 rounded"
        style={{ borderColor: presence.color }}
      />
      {/* Name tag */}
      <div 
        className="absolute -top-6 left-0 text-xs font-medium px-2 py-0.5 rounded shadow-sm whitespace-nowrap z-20"
        style={{ 
          backgroundColor: presence.color,
          color: 'white',
        }}
      >
        {presence.userName}
      </div>
    </>
  );
}