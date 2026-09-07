/**
 * George's prose, rendered one way everywhere.
 *
 * An answer in Ask and a post in the river were each calling ReactMarkdown
 * with their own props, so a table read one way in a thread and another in
 * the timeline. This is the single renderer: the same typography, and the
 * same responsive table treatment, wherever George's words appear.
 *
 * THE LEDE. George's answers lead with the conclusion — the prompt requires
 * it — so the first paragraph is the finding and everything after it is the
 * working. Setting it a size larger says so, and costs nothing: no reordering,
 * no summarising, no claim about content the model did not write. When an
 * answer opens with a table instead, the rule simply does not apply.
 *
 * TABLES. Column labels are read off the header row and handed to the
 * stylesheet, so a table too wide for a phone stacks with every cell named
 * rather than scrolling sideways with the figures off the edge. See
 * proseTable.ts for which tables stack and why.
 */
import type { CSSProperties } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { headerVars, shouldStack, tableHeaders, type HastNode } from './proseTable';

const components: Components = {
  table({ node, children, ...props }) {
    const headers = tableHeaders(node as HastNode | undefined);
    const stack = shouldStack(headers.length);
    return (
      // The wrapper is the last resort: a table that neither fits nor stacks
      // scrolls inside its own box rather than widening the column.
      <div className="george-table-wrap">
        <table
          className={stack ? 'george-table--stack' : undefined}
          style={stack ? (headerVars(headers) as CSSProperties) : undefined}
          {...props}
        >
          {children}
        </table>
      </div>
    );
  },
};

export function Prose({
  text,
  lede = false,
  quiet = false,
}: {
  text: string;
  /** Set the opening paragraph as the finding it is. Answers only. */
  lede?: boolean;
  /** An earlier turn, stepped back so the newest answer leads. */
  quiet?: boolean;
}) {
  return (
    <div
      className={`george-prose text-[15px] leading-relaxed ${
        quiet ? 'text-george-slate' : 'text-george-navy'
      } ${lede ? 'george-prose--lede' : ''}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
