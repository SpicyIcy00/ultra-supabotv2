import { afterEach, expect, it } from 'vitest';
import { queryClient } from '../services/queryClient';
import { useAuthStore } from './authStore';

const user = { id: 'a', username: 'a', role: 'admin', allowed_pages: ['george'] };
afterEach(() => useAuthStore.getState().logout());

it('clears private queries and mutations on logout and direct account switching', () => {
  useAuthStore.getState().setSession('test-a', user);
  for (const change of [
    () => useAuthStore.getState().logout(),
    () => useAuthStore.getState().setSession('test-b', { ...user, id: 'b' }),
  ]) {
    queryClient.setQueryData(['river', null], { secret: 'a' });
    queryClient.setQueryData(['pins'], [{ private: 'a' }]);
    queryClient.getMutationCache().build(queryClient, { mutationKey: ['pin-run'] });
    const revision = useAuthStore.getState().sessionRevision;
    change();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
    expect(useAuthStore.getState().sessionRevision).toBeGreaterThan(revision);
  }
});

it('late query completion cannot repopulate the next account cache', async () => {
  let finish!: (value: string) => void;
  const pending = queryClient.fetchQuery({
    queryKey: ['river'], queryFn: () => new Promise<string>((resolve) => { finish = resolve; }),
  }).catch(() => undefined);
  useAuthStore.getState().setSession('test-b', { ...user, id: 'b' });
  finish('private a');
  await pending;
  expect(queryClient.getQueryData(['river'])).toBeUndefined();
});
