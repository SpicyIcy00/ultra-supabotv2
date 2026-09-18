/**
 * Bob, wherever you are.
 *
 * Reads the one stream the provider owns. Throws outside the provider rather
 * than handing back a fake at rest — a component that rendered a calm mark
 * with no stream behind it would be the app claiming a state it never had.
 */
import { useContext } from 'react';
import { BobCtx, type BobContext } from '../components/bob/bobContext';

export function useBob(): BobContext {
  const ctx = useContext(BobCtx);
  if (!ctx) throw new Error('useBob must be used inside BobStreamProvider');
  return ctx;
}
