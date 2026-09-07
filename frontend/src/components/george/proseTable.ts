/**
 * What a markdown table needs to survive a phone.
 *
 * Kept apart from the component for the same reason postShape.ts and
 * turnShape.ts are: these are decisions the suite can hold without a DOM.
 *
 * THE PROBLEM. A table in an answer was `display: block; overflow-x: auto`
 * with `white-space: nowrap` on every cell, so on a 390px screen a four
 * column result — rank, SKU, product, revenue — ran off the right edge and
 * the figures, the entire point of the table, were the part that went. A
 * reader had to scroll sideways inside a column that was already the whole
 * screen, and nothing on screen said there was more.
 *
 * TWO REPRESENTATIONS, AND THE COLUMN COUNT DECIDES.
 *
 *   up to four columns   the table stays a table and is allowed to WRAP.
 *                        Long product names fold onto a second line; a peso
 *                        figure has no space in it, so it cannot break. Four
 *                        columns fit 390px this way, and a table that fits
 *                        is easier to read than anything it could become.
 *
 *   five or more         the table stacks: every row becomes a block and
 *                        every cell is labelled with its column. Nothing is
 *                        dropped and nothing is truncated — the same cells,
 *                        read downward instead of across.
 *
 * The labels come from the header row and travel to the cells as CSS custom
 * properties, so the stacked layout is one media query over one DOM rather
 * than a second copy of the table for a screen reader to find.
 */

/** A minimal view of the hast node react-markdown hands a component. */
export interface HastNode {
  type?: string;
  tagName?: string;
  value?: string;
  children?: HastNode[];
}

/** Columns past which a table cannot fit a phone and has to stack instead. */
export const MAX_COLUMNS_THAT_FIT = 4;

/** The visible text of a node, children included, whitespace collapsed. */
export function textOf(node: HastNode | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(textOf).join('');
}

function descend(node: HastNode | undefined, tag: string): HastNode | undefined {
  return (node?.children ?? []).find((c) => c.tagName === tag);
}

/**
 * The column headings of a table node, in order.
 *
 * Empty for a table with no header row — GitHub-flavoured markdown always
 * writes one, but a table built any other way must not throw here, it must
 * simply go unlabelled and stay a table.
 */
export function tableHeaders(node: HastNode | undefined): string[] {
  const row = descend(descend(node, 'thead'), 'tr');
  return (row?.children ?? [])
    .filter((c) => c.tagName === 'th' || c.tagName === 'td')
    .map((c) => textOf(c).trim());
}

/** Whether this many columns have to stack on a phone. */
export function shouldStack(columns: number): boolean {
  return columns > MAX_COLUMNS_THAT_FIT;
}

/**
 * A column label as a CSS `content` value: quoted, with quotes and
 * backslashes escaped so a heading containing either cannot break out of the
 * declaration.
 */
export function cssString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * The headings as custom properties for the stacked layout to read.
 *
 * `--col-1` is the first column. The stylesheet declares rules for as many
 * columns as it can label; a table wider than that still stacks, and its
 * later cells simply carry no label rather than carrying the wrong one.
 */
export function headerVars(headers: string[]): Record<string, string> {
  const vars: Record<string, string> = {};
  headers.forEach((h, i) => {
    if (h) vars[`--col-${i + 1}`] = cssString(h);
  });
  return vars;
}
