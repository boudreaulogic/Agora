'use client';

import { useState, useCallback } from 'react';

type UndoAction = {
  cellId: string;
  rowId: string;
  columnId: string;
  oldValue: any;
  newValue: any;
  timestamp: number;
};

export function useUndo(maxStackSize = 50) {
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [redoStack, setRedoStack] = useState<UndoAction[]>([]);

  const recordAction = useCallback((action: Omit<UndoAction, 'timestamp'>) => {
    setUndoStack(prev => {
      const newStack = [...prev, { ...action, timestamp: Date.now() }];
      return newStack.slice(-maxStackSize); // Keep last N actions
    });
    setRedoStack([]); // Clear redo stack on new action
  }, [maxStackSize]);

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  const undo = useCallback(() => {
    if (undoStack.length === 0) return null;
    
    const action = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, action]);
    
    return action;
  }, [undoStack]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return null;
    
    const action = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, action]);
    
    return action;
  }, [redoStack]);

  const clear = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  return {
    recordAction,
    undo,
    redo,
    canUndo,
    canRedo,
    clear,
  };
}