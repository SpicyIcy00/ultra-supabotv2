/**
 * Chat Store
 *
 * Holds multiple AI-chat conversations, ChatGPT-style, persisted to
 * localStorage so chats survive tab switches and page reloads.
 *
 * Each conversation keeps its own `sessionId` (used by the backend
 * conversation-memory service for follow-up context) and its own message list.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChatMessage } from '../types/chatbot';

export interface Conversation {
  id: string;
  title: string;
  sessionId: string; // backend conversation-memory key
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

const NEW_CHAT_TITLE = 'New chat';

const uid = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

const makeConversation = (): Conversation => ({
  id: uid('conv'),
  title: NEW_CHAT_TITLE,
  sessionId: uid('session'),
  messages: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// Derive a short conversation title from the first user question.
const titleFromQuestion = (question: string): string => {
  const clean = question.trim().replace(/\s+/g, ' ');
  return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean || NEW_CHAT_TITLE;
};

interface ChatState {
  conversations: Conversation[];
  activeId: string | null;

  // Selectors
  getActive: () => Conversation | undefined;

  // Conversation lifecycle
  createConversation: () => string;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  setActive: (id: string) => void;
  ensureActive: () => string;

  // Message operations (scoped to a conversation)
  appendMessages: (convId: string, messages: ChatMessage[]) => void;
  patchMessage: (convId: string, messageId: string, patch: Partial<ChatMessage>) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeId: null,

      getActive: () => {
        const { conversations, activeId } = get();
        return conversations.find((c) => c.id === activeId);
      },

      createConversation: () => {
        const conv = makeConversation();
        set((state) => ({
          conversations: [conv, ...state.conversations],
          activeId: conv.id,
        }));
        return conv.id;
      },

      deleteConversation: (id) => {
        set((state) => {
          const conversations = state.conversations.filter((c) => c.id !== id);
          let activeId = state.activeId;
          if (activeId === id) {
            activeId = conversations[0]?.id ?? null;
          }
          return { conversations, activeId };
        });
      },

      renameConversation: (id, title) => {
        const trimmed = title.trim() || NEW_CHAT_TITLE;
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, title: trimmed, updatedAt: Date.now() } : c
          ),
        }));
      },

      setActive: (id) => set({ activeId: id }),

      ensureActive: () => {
        const { activeId, conversations } = get();
        if (activeId && conversations.some((c) => c.id === activeId)) {
          return activeId;
        }
        if (conversations.length > 0) {
          set({ activeId: conversations[0].id });
          return conversations[0].id;
        }
        return get().createConversation();
      },

      appendMessages: (convId, messages) => {
        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id !== convId) return c;

            // Auto-title from the first user message.
            let title = c.title;
            if (title === NEW_CHAT_TITLE) {
              const firstUser = messages.find((m) => m.role === 'user');
              if (firstUser) title = titleFromQuestion(firstUser.content);
            }

            return {
              ...c,
              title,
              messages: [...c.messages, ...messages],
              updatedAt: Date.now(),
            };
          }),
        }));
      },

      patchMessage: (convId, messageId, patch) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id !== convId
              ? c
              : {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === messageId ? { ...m, ...patch } : m
                  ),
                  updatedAt: Date.now(),
                }
          ),
        }));
      },
    }),
    {
      name: 'ai-chat-storage', // localStorage key
      partialize: (state) => ({
        conversations: state.conversations,
        activeId: state.activeId,
      }),
      // A stream interrupted by a reload/tab-switch would leave an assistant
      // message stuck in a loading state. Recover those on rehydration.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        for (const conv of state.conversations) {
          for (const msg of conv.messages) {
            if (msg.isLoading) {
              msg.isLoading = false;
              msg.status = undefined;
              if (!msg.content && !msg.error) {
                msg.error = 'Response was interrupted';
                msg.content = 'This response was interrupted. Please ask again.';
              }
            }
          }
        }
      },
    }
  )
);
