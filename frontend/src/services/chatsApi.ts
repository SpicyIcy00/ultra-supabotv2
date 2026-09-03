/**
 * Chats API — past conversations, listed and reopened.
 *
 * Bare axios, matching pinsApi: the auth interceptors are installed on both
 * the shared instance and global axios (see httpAuth.ts). Relative base for
 * the same reason as everywhere else — same-origin through the proxy.
 */
import axios from 'axios';
import type { ChatDetail, ChatSummary } from '../types/chats';

const API_BASE = '/api/v1/george/chats';

export const listChats = async (): Promise<ChatSummary[]> => {
  const { data } = await axios.get<ChatSummary[]>(API_BASE);
  return data;
};

export const getChat = async (threadId: string): Promise<ChatDetail> => {
  const { data } = await axios.get<ChatDetail>(`${API_BASE}/${threadId}`);
  return data;
};
