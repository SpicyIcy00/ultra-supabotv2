/**
 * The measured size of an element.
 *
 * A field is laid out in PIXELS, not in a scaled viewBox: text in a scaled
 * viewBox shrinks with the drawing, and a store's name at 5px on a phone is
 * not a label. So the field measures the room it has and places its objects
 * in it, which also means the same field is legible at every width without a
 * second design.
 *
 * ResizeObserver where there is one, one measurement where there is not
 * (jsdom, an old browser) — a field that never resizes is better than one
 * that never draws.
 */
import { useEffect, useRef, useState } from 'react';

export interface Size {
  width: number;
  height: number;
}

export function useSize<T extends HTMLElement>(fallback: Size = { width: 720, height: 420 }) {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<Size>(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}
