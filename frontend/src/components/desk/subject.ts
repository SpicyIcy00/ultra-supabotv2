/**
 * A subject on the desk: the thing an object on a field IS.
 *
 * IDS FROM ROWS, NEVER FROM THE DOM. A store, a product or a category becomes
 * a subject only because a row the tool returned carried it: `store_id` beside
 * `store`, `product_id` beside `product`, `category` on its own. Those keys
 * are the definitions' (metrics.yaml surface.desk.selection.identity), and a
 * subject built any other way — from a label typed in, from text scraped off
 * a cell — would be a name the model could be told that no row established.
 *
 * WHY A STORE FALLS BACK TO ITS LABEL. A read scoped to one store by filter
 * returns rows with no `store_id` on them — the store is the argument, not a
 * column — while a read grouped by store carries the id. The same shop must be
 * one subject in both, so equality reads the id when both sides have one and
 * the label otherwise; the display names are the definitions' own and unique.
 */
import type { DeskDimension } from '../../types/george';
import type { ResultSource } from '../george/resultShape';

export type Dimension = DeskDimension;

export interface Subject {
  dimension: Dimension;
  /** The identity a row carried, or the label when the row carried none. */
  id: string;
  label: string;
}

/** The row key that identifies a subject of each dimension. The definitions' own. */
export const SUBJECT_IDENTITY: Record<Dimension, string> = {
  store: 'store_id',
  product: 'product_id',
  category: 'category',
};

/** The row key that names a subject of each dimension, for a reader. */
export const SUBJECT_LABEL: Record<Dimension, string> = {
  store: 'store',
  product: 'product',
  category: 'category',
};

export const DIMENSIONS: readonly Dimension[] = ['store', 'product', 'category'];

/** The subject one row is about in a dimension, or null when the row is not. */
export function subjectOfRow(row: Record<string, unknown>, dimension: Dimension): Subject | null {
  const label = row[SUBJECT_LABEL[dimension]];
  if (typeof label !== 'string' || !label) return null;
  const raw = row[SUBJECT_IDENTITY[dimension]];
  const id = typeof raw === 'string' && raw ? raw : typeof raw === 'number' ? String(raw) : label;
  return { dimension, id, label };
}

/** The subject dimension a result is grouped by, from its arguments then its rows. */
export function dimensionOf(source: ResultSource): Dimension | null {
  const g = source.arguments?.group_by;
  const groups = Array.isArray(g) ? g.map(String) : typeof g === 'string' && g ? [g] : [];
  for (const d of DIMENSIONS) if (groups.includes(d)) return d;
  const first = source.rows[0];
  if (!first) return null;
  for (const d of DIMENSIONS) {
    const key = SUBJECT_LABEL[d];
    if (typeof first[key] === 'string' && source.rows.every((r) => typeof r[key] === 'string')) {
      // Eight rows all labelled "Rockwell" are eight measures of one thing.
      if (new Set(source.rows.map((r) => r[key])).size === source.rows.length) return d;
    }
  }
  return null;
}

/** Every subject a result's rows are about, in row order. */
export function subjectsOf(source: ResultSource, dimension?: Dimension): Subject[] {
  const d = dimension ?? dimensionOf(source);
  if (!d) return [];
  return source.rows.flatMap((row) => {
    const s = subjectOfRow(row, d);
    return s ? [s] : [];
  });
}

/** One subject, in both dimensions of identity: the id when both have one, else the label. */
export function sameSubject(a: Subject, b: Subject): boolean {
  if (a.dimension !== b.dimension) return false;
  if (a.id === b.id) return true;
  // A store's id is its label on a scoped read and a StoreHub id on a grouped
  // one. The label is the definitions' display name and is unique.
  return a.dimension === 'store' && a.label === b.label;
}

export function subjectKey(s: Subject): string {
  return `${s.dimension}:${s.dimension === 'store' ? s.label : s.id}`;
}

/** A subject by its label alone — for a stored selection or an anchor's subject list. */
export function subjectFromLabel(dimension: Dimension, label: string): Subject {
  return { dimension, id: label, label };
}
