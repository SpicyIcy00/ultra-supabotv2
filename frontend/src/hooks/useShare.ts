/**
 * Share a private post into the river, then refetch whatever shows it.
 *
 * The server returns the thread it changed, but the river is a page of many
 * threads — refetching is simpler than splicing that thread back in, and it
 * cannot leave the two disagreeing about what is now public. One hook so
 * Today and the Ask workspace share the exact same behaviour.
 */
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { sharePost } from '../services/riverApi';

export function useShare() {
  const qc = useQueryClient();
  const [sharingId, setSharingId] = useState<string | null>(null);

  const share = useCallback(
    async (postId: string) => {
      setSharingId(postId);
      try {
        await sharePost(postId);
        await qc.invalidateQueries({ queryKey: ['river'] });
        qc.invalidateQueries({ queryKey: ['thread'] });
      } finally {
        setSharingId(null);
      }
    },
    [qc],
  );

  return { share, sharingId };
}
