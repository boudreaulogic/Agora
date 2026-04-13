'use client';

import { useState } from 'react';

export function WorkspaceSelector({
  workspaces,
  defaultWorkspaceId,
}: {
  workspaces: { id: string; name: string; icon: string | null }[];
  defaultWorkspaceId: string;
}) {
  const [selected, setSelected] = useState(defaultWorkspaceId);

  if (workspaces.length === 0) return null;

  return (
    <div>
      <label htmlFor="workspaceId" className="block text-sm font-medium text-gray-700 mb-2">
        Workspace (Optional)
      </label>
      <select
        id="workspaceId"
        name="workspaceId"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
      >
        <option value="">No workspace — standalone table</option>
        {workspaces.map((ws) => (
          <option key={ws.id} value={ws.id}>
            {ws.icon || '📁'} {ws.name}
          </option>
        ))}
      </select>
      <p className="mt-2 text-xs text-gray-500">
        {selected
          ? 'Table will inherit permissions from the workspace'
          : 'Table will be standalone with its own permissions'}
      </p>
    </div>
  );
}