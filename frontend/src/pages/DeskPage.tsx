/**
 * George.
 *
 * ONE SURFACE, TWO ADDRESSES. `/` is the business at rest — what the
 * definitions' resting reads say about it, with George's morning sentence
 * above them — and `/w/:threadId` is one piece of work, composed from its
 * posts. A question asked at rest moves to its own address the moment its
 * posts exist, so the work has a link and a reload lands back on it.
 *
 * WHY THE ADDRESS FOLLOWS THE POST FRAME AND NOT THE START FRAME. `start`
 * names a thread before a single post is written, and following it there
 * meant a URL whose read is a guaranteed 404. `post` says the posts exist,
 * and `stored` says whether they really do.
 *
 * NOTHING HERE IS A DESTINATION. Inbox, Pages and Workflows are rooms
 * reachable from the line above; there is no navigation between five places,
 * and there is no "new chat" — asking at rest starts work, and asking inside
 * work continues it.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Desk } from '../components/desk/Desk';
import { History } from '../components/desk/History';
import { useDesk } from '../components/desk/useDesk';
import type { DeskActionItem } from '../components/desk/deskActions';
import { useGeorge } from '../hooks/useGeorge';
import { useRiver } from '../hooks/useRiver';

export default function DeskPage() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const george = useGeorge();
  const desk = useDesk(threadId);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState(0);

  // The river, for the history drawer only: everything, both streams.
  // Read only while the drawer is open. Mounted always so the cache is keyed
  // and an already-loaded river reopens instantly; requested only when looked
  // at, so opening the desk no longer costs two full river reads.
  const river = useRiver(undefined, historyOpen);

  // A turn asked at rest moves to its own address once its posts exist.
  useEffect(() => {
    if (!threadId && desk.storedThreadId) navigate(`/w/${desk.storedThreadId}`, { replace: true });
  }, [threadId, desk.storedThreadId, navigate]);

  const onAction = useCallback((action: DeskActionItem) => {
    // A local action changes the view and never reaches the model.
    if (action.kind === 'local' && action.local) {
      desk.dispatch(action.local);
      return;
    }
    // An asked one is a question, sent with the desk as context.
    if (action.question) desk.ask(action.question);
  }, [desk]);

  const openWork = useCallback((thread: string) => {
    setHistoryOpen(false);
    navigate(`/w/${thread}`);
  }, [navigate]);

  return (
    <>
      <Desk
        desk={desk}
        busy={george.busy}
        onCancel={george.cancel}
        onHistory={() => setHistoryOpen(true)}
        historyOpen={historyOpen}
        draft={draft}
        draftKey={draftKey}
        onAction={(a) => {
          // A question the person should read before sending goes to the box.
          if (a.kind === 'ask' && a.id.startsWith('draft:')) {
            setDraft(a.question ?? '');
            setDraftKey((k) => k + 1);
            return;
          }
          onAction(a);
        }}
      />
      {historyOpen && (
        <History
          posts={river.posts}
          loading={river.loading}
          error={river.error}
          onOpen={openWork}
          onClose={() => setHistoryOpen(false)}
          hasOlder={river.hasOlder}
          onOlder={river.loadOlder}
        />
      )}
    </>
  );
}
