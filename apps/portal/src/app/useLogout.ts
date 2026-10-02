import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from './api';
import { useSession } from './session';

export function useLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectSession } = useSession();
  return useMutation({
    mutationFn: () => api('/api/session', { method: 'DELETE' }),
    onSuccess: async () => {
      selectSession(null);
      await queryClient.cancelQueries();
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
      queryClient.setQueryData(['session'], null);
      navigate('/entry', { replace: true });
    }
  });
}
