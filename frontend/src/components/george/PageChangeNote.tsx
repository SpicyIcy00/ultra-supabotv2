/**
 * A page George created or changed because he was asked to, in conversation.
 *
 * The answer says the same thing in prose; this says it from the
 * `page_changed` frame — the committed result — so the confirmation is the
 * write itself rather than the model's account of it (pageChangeShape.ts).
 * One line per operation, and a way to the page. Nothing here may use the
 * approvals colour (UI rule 5): a page changing needs nobody.
 */
import { Link } from 'react-router-dom';
import { LayoutList } from 'lucide-react';
import type { PageChangedFrame } from '../../types/george';
import { pageChangeLines } from './pageChangeShape';
import { pagePath } from './pageShape';

export function PageChangeNote({ change }: { change: PageChangedFrame }) {
  const lines = pageChangeLines(change);
  return (
    <div className="flex items-start gap-1.5 rounded-lg border border-george-line bg-george-paper px-3 py-2 text-[12px] leading-relaxed text-george-slate">
      <LayoutList className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <ul>
          {lines.map((line, i) => (
            <li key={i} className="text-george-navy">{line}</li>
          ))}
        </ul>
        <Link to={pagePath(change.page_id)} className="text-george-slate hover:text-george-navy hover:underline">
          Open {change.title}
        </Link>
      </div>
    </div>
  );
}
