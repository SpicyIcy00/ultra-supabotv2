/**
 * George, wherever you are.
 *
 * Reads the one stream the provider owns. Throws outside the provider rather
 * than handing back a fake at rest — a component that rendered a calm mark
 * with no stream behind it would be the app claiming a state it never had.
 */
import { useContext } from 'react';
import { GeorgeCtx, type GeorgeContext } from '../components/george/georgeContext';

export function useGeorge(): GeorgeContext {
  const ctx = useContext(GeorgeCtx);
  if (!ctx) throw new Error('useGeorge must be used inside GeorgeStreamProvider');
  return ctx;
}
