/**
 * MOVING A THING BY MOVING IT.
 *
 * The board used to be rearranged with a pair of arrows — press ◀ and the
 * tile swaps with its neighbour. That is a machine for producing an
 * arrangement, not the arrangement itself: you have to look at where a thing
 * is, decide how many presses away the place you want is, and press that many
 * times. Picking it up and putting it down is one gesture and needs no count.
 *
 * WHAT THIS IS, EXACTLY. A pointer drag with live reordering: the board moves
 * out of the way under your hand, so the thing you are holding is always in
 * the place it will be when you let go. There is no preview, no drop marker
 * and no ghost image — the real tiles are the preview.
 *
 * THREE THINGS THIS DELIBERATELY DOES NOT USE.
 *
 *   - HTML5 drag and drop. It does not exist on touch, and UI rule 7 says the
 *     phone layout is the real layout.
 *   - `setPointerCapture`. The dragged tile MOVES BETWEEN the lead row and the
 *     body of the board, which unmounts and remounts its node — and a captured
 *     pointer dies with the element that captured it, ending the drag halfway
 *     across the screen. The listeners go on the window instead, so the drag
 *     outlives any amount of re-rendering underneath it.
 *   - A geometry model of the board. The tiles are laid out by CSS columns,
 *     whose boxes this code would have to reimplement to guess at. It asks the
 *     document what is under the pointer instead, which is right by
 *     construction and stays right when the layout changes.
 *
 * The dragged tile is `pointer-events: none` while it is held (see
 * `.r-dragging`), so what is under the pointer is the board and never the
 * thing being carried.
 */
import {
  useCallback, useEffect, useRef, useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

/** Which half of the board a tile was dropped in. The lead row is the top. */
export type Region = 'lead' | 'rest';

export interface DragActions {
  /** Put `key` next to `target`, in the region it was dropped in. */
  move(key: string, target: string, after: boolean, region: Region): void;
}

/** How far the mouse travels before a press on a tile becomes a drag. */
const THRESHOLD = 6;

/**
 * Where a press may NOT start a drag, because it is something else's.
 *
 * A tile is full of things that already answer to a click — open, compare,
 * why, a sortable column heading, a control. Carrying the tile from one of
 * those would mean either losing the click or never being able to drag from
 * most of the tile's surface, and both are worse than needing the grip.
 */
const INTERACTIVE = 'button, a, input, select, textarea, label, th, [data-open], [role="button"]';

export function useDrag(actions: DragActions) {
  const [dragging, setDragging] = useState<string | null>(null);
  const held = useRef<{
    key: string;
    x: number;
    y: number;
    armed: boolean;
    last: string;
  } | null>(null);

  const end = useCallback(() => {
    held.current = null;
    setDragging(null);
    document.body.classList.remove('r-dragging-on');
  }, []);

  useEffect(() => () => { document.body.classList.remove('r-dragging-on'); }, []);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const h = held.current;
      if (!h) return;

      if (!h.armed) {
        if (Math.abs(e.clientX - h.x) < THRESHOLD && Math.abs(e.clientY - h.y) < THRESHOLD) return;
        h.armed = true;
        setDragging(h.key);
        document.body.classList.add('r-dragging-on');
      }
      // Stops the press turning into a text selection across the whole board,
      // and on touch stops the page scrolling out from under the drag.
      e.preventDefault();

      const under = document.elementFromPoint(e.clientX, e.clientY);
      const tile = under instanceof Element
        ? (under.closest('[data-drag-key]') as HTMLElement | null) : null;
      const target = tile?.dataset.dragKey;
      if (!tile || !target || target === h.key) return;

      const box = tile.getBoundingClientRect();
      const after = e.clientY > box.top + box.height / 2;
      const region: Region = tile.closest('.r-board-lead') ? 'lead' : 'rest';

      // The same decision twice is the board already being that way. Without
      // this the reorder runs on every pointer event — sixty arrangements a
      // second, each one its own entry in the undo stack.
      const now = `${target}:${after}:${region}`;
      if (now === h.last) return;
      h.last = now;
      actions.move(h.key, target, after, region);
    }

    function onUp() { if (held.current) end(); }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && held.current) end(); }

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [actions, end]);

  const begin = useCallback((key: string, e: { clientX: number; clientY: number }, now: boolean) => {
    held.current = { key, x: e.clientX, y: e.clientY, armed: false, last: '' };
    if (now) {
      held.current.armed = true;
      setDragging(key);
      document.body.classList.add('r-dragging-on');
    }
  }, []);

  /** The grip: press and it moves, on a mouse or a finger, immediately. */
  const grip = useCallback((key: string) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.stopPropagation();
      begin(key, e, true);
    },
  }), [begin]);

  /**
   * Anywhere else on the tile, ON A MOUSE ONLY.
   *
   * A finger dragging across a tile is how you scroll the page, and taking
   * that away to save a gesture would break reading the board to fix
   * arranging it. Touch gets the grip, which is always there.
   */
  const body = useCallback((key: string) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
      begin(key, e, false);
    },
  }), [begin]);

  return { dragging, grip, body };
}
