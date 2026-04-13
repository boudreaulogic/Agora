import { create } from 'zustand';

type CellPresence = {
  userId: string;
  userName: string;
  color: string;
};

type PresenceStore = {
  presence: Record<string, CellPresence>; // cellId -> user info
  setPresence: (cellId: string, user: CellPresence) => void;
  removePresence: (cellId: string) => void;
  removeUserPresence: (userId: string) => void;
};

export const usePresenceStore = create<PresenceStore>((set) => ({
  presence: {},
  
  setPresence: (cellId, user) =>
    set((state) => ({
      presence: { ...state.presence, [cellId]: user },
    })),
  
  removePresence: (cellId) =>
    set((state) => {
      const { [cellId]: _, ...rest } = state.presence;
      return { presence: rest };
    }),
  
  removeUserPresence: (userId) =>
    set((state) => ({
      presence: Object.fromEntries(
        Object.entries(state.presence).filter(([_, user]) => user.userId !== userId)
      ),
    })),
}));