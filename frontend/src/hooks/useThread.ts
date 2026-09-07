/**
 * One thread: its visible posts, and the caller's own chat in it if any.
 *
 * Two reads, and they answer different questions. The river's thread read is
 * what is SHOWN — everything the caller may see, filtered in SQL. The chats
 * read is what George is TOLD — the caller's own turns with the calls behind
 * them, which is the only place tool provenance may come from. A 404 from
 * the second is an ordinary outcome: an org thread the caller has not
 * replied to has no chat of theirs, and that is `null`, not an error.
 */
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { getChat } from '../services/chatsApi';
import { readThread } from '../services/riverApi';
import type { ChatDetail } from '../types/chats';

export function useThread(threadId: string) {
  const posts = useQuery({
    queryKey: ['thread', threadId],
    queryFn: () => readThread(threadId),
    enabled: Boolean(threadId),
    staleTime: 20_000,
  });

  const chat = useQuery<ChatDetail | null>({
    queryKey: ['chats', threadId],
    queryFn: async () => {
      try {
        return await getChat(threadId);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) return null;
        throw err;
      }
    },
    enabled: Boolean(threadId),
    staleTime: 20_000,
    retry: false,
  });

  return {
    posts: posts.data ?? [],
    loading: posts.isPending,
    /** Missing or not visible — the two are one answer, as on the server. */
    unavailable: posts.isError,
    chat: chat.data ?? null,
    /** Both reads settled, so history can be built once and opened. */
    ready: posts.isSuccess && (chat.isSuccess || chat.isError),
  };
}
