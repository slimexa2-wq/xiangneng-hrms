import { createContext, useContext, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Session } from './types';

interface SessionContextValue {
  session: Session | null;
  loading: boolean;
  refresh: () => Promise<unknown>;
  selectSession: (session: Session | null) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [selectedSession, selectSession] = useState<Session | null | undefined>(undefined);
  const query = useQuery({
    queryKey: ['session'],
    queryFn: () => api<Session>('/api/session'),
    retry: false
  });
  return <SessionContext.Provider value={{ session: selectedSession !== undefined ? selectedSession : query.data ?? null, loading: selectedSession === undefined && query.isLoading, selectSession, refresh: async () => { const result = await query.refetch(); selectSession(result.data ?? null); return result; } }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}
