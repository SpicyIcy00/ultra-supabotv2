/**
 * The one line that says which page a thread is about.
 *
 * "Page context · AJI BARN Reorder", linking back to the page. Nothing
 * else: not the page's pins, not its figures, not a way to edit it. The
 * page stays the workspace and Ask stays where the reasoning happens; this
 * line is the join between them, and it is the same line whether George has
 * read the page yet or not — it names the scope, and what he read of it is
 * the answer's own business (PageContextBlock).
 */
import { Link } from 'react-router-dom';
import type { PageScope } from '../../types/george';
import { scopeLabel } from './pageScope';
import { pagePath } from './pageShape';

export function PageScopeLine({ scope, className = '' }: { scope: PageScope | null; className?: string }) {
  if (!scope) return null;
  return (
    <p className={`flex items-baseline gap-1.5 text-[12px] text-george-muted ${className}`}>
      <span className="text-[11px] uppercase tracking-wider">Page context</span>
      <span aria-hidden>·</span>
      <Link to={pagePath(scope.page_id)} className="truncate text-george-slate hover:text-george-navy">
        {scopeLabel(scope)}
      </Link>
    </p>
  );
}
