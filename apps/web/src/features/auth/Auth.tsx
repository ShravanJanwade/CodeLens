import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { api } from '../api';
import { Loading, ErrorState } from '../../components/ui';
export function useAuth() {
  return useQuery({ queryKey: ['auth'], queryFn: () => api('/auth/status'), retry: 1, staleTime: 30000 });
}
export function RequireAuth() {
  const location = useLocation();
  const auth = useQuery({
    queryKey: ['route-auth', location.pathname],
    queryFn: () => api('/auth/status'),
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
  if (auth.isLoading || auth.isFetching) return <Loading label="Opening your workspace…" />;
  if (auth.isError) return <ErrorState error={auth.error} retry={() => auth.refetch()} />;
  return auth.data?.data.user ? (
    <Outlet />
  ) : (
    <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  );
}
