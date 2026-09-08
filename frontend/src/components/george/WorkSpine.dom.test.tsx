/**
 * The spine, as rendered: one segment per call, state in form, words for a
 * screen reader, no identifiers and no colour.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ToolCall } from '../../types/george';
import { WorkSpine } from './WorkSpine';

afterEach(cleanup);

const call = (seq: number, tool: string, extra: Partial<ToolCall> = {}): ToolCall => ({
  seq, tool, arguments: { metric: 'net_sales' }, ...extra,
});
const back = (seq: number, tool: string, error: string | null = null): ToolCall =>
  call(seq, tool, {
    result: { row_count: 1, source_table: 'x', truncated: false, duration_ms: 1, error, rows: [], rows_complete: true },
  });

describe('WorkSpine', () => {
  it('draws one segment per call, in order, and none for the label tool', () => {
    const { container } = render(
      <WorkSpine calls={[back(1, 'get_sales'), call(2, 'get_stock'), back(3, 'record_findings')]} settled={false} live />,
    );
    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(2);
    expect(items[0].getAttribute('data-state')).toBe('done');
    expect(items[1].getAttribute('data-state')).toBe('pending');
  });

  it('names its progress for a screen reader, in counts', () => {
    const { container } = render(
      <WorkSpine calls={[back(1, 'get_sales'), call(2, 'get_stock')]} settled={false} live />,
    );
    expect(container.querySelector('ol')!.getAttribute('aria-label')).toBe("George's work: 1 of 2 reads back");
  });

  it('carries the rung on the segment once findings exist', () => {
    const { container } = render(
      <WorkSpine
        calls={[back(1, 'get_sales')]}
        findings={[{ seq: 1, role: 'primary', of: null, tool: 'get_sales' }]}
        settled
        live={false}
      />,
    );
    const li = container.querySelector('li')!;
    expect(li.getAttribute('data-rung')).toBe('primary');
    expect(li.textContent).toContain('The figure');
  });

  it('puts no tool identifier and no reasoning on the surface', () => {
    const { container } = render(
      <WorkSpine calls={[back(1, 'get_sales'), back(2, 'get_purchasing', 'declined')]} settled live={false} />,
    );
    expect(container.textContent).not.toMatch(/get_/);
    expect(container.textContent).toContain('declined');
  });

  it('draws nothing for a unit that made no calls', () => {
    const { container } = render(<WorkSpine calls={[]} settled live={false} />);
    expect(container.querySelector('ol')).toBeNull();
  });

  it('marks a refusal by form: a hatched class, never a colour class', () => {
    const { container } = render(<WorkSpine calls={[back(1, 'get_sales', 'no')]} settled live={false} />);
    const li = container.querySelector('li')!;
    expect(li.className).toContain('george-spine-segment--refused');
    expect(li.className).not.toMatch(/george-accent|george-data-/);
  });
});
