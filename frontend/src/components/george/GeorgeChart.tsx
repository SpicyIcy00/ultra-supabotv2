/**
 * The chart. One component, rendered identically by a pinned tile and by an
 * answer in chat.
 *
 * WHY ONE COMPONENT. UI rule 3 says a figure is inspectable "identically
 * whether it came from chat or from a tile". Two chart implementations would
 * mean two axis treatments, two number formats and — the one that actually
 * costs something — two places for a notice or a timestamp to be forgotten. So
 * the tile and the answer both come through here, and neither owns a chart of
 * its own.
 *
 * WHAT IT DOES NOT DECIDE. Not whether to draw a chart (pinShape.inferShape),
 * not which mark (inferShape again, from the data and at most a narrowing
 * hint), and not the axis labels or the window — those come off `meta`, never
 * from the model's prose. This file draws what it is handed.
 *
 * PALETTE. Navy ink on cream. No gradients, no glow, no fill beyond the bar
 * itself. Orange never appears in a chart: one colour means "needs you" (UI
 * rule 5), and a chart never needs you.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ToolMeta } from '../../types/george';
import { fmt, type Shape } from './pinShape';

/**
 * The x-axis label for a value, taken from meta.
 *
 * A time axis prints the raw key — the tools emit ISO days and Manila-anchored
 * week and month starts, and reformatting them here would be this component
 * inventing a date, which is the one thing every rule in this repo forbids.
 */
function axisTick(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

export function GeorgeChart({
  shape,
  meta,
  height = 160,
}: {
  shape: Extract<Shape, { kind: 'chart' }>;
  /** Only for the unit on the tooltip. Receipts are rendered by the caller. */
  meta?: ToolMeta;
  height?: number;
}) {
  const peso = meta?.metric_unit === 'PHP';
  const value = (v: unknown) => `${peso ? '₱' : ''}${fmt(v)}`;

  const axes = (
    <>
      <CartesianGrid strokeDasharray="2 4" stroke="currentColor" className="text-george-line" />
      <XAxis
        dataKey={shape.x}
        tick={{ fontSize: 10 }}
        tickLine={false}
        axisLine={false}
        tickFormatter={axisTick}
        interval="preserveStartEnd"
      />
      <YAxis
        tick={{ fontSize: 10 }}
        tickLine={false}
        axisLine={false}
        width={52}
        tickFormatter={(v) => fmt(v)}
      />
      <Tooltip
        formatter={(v) => value(v)}
        labelStyle={{ fontSize: 12 }}
        contentStyle={{ fontSize: 12, borderRadius: 8 }}
      />
    </>
  );

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {shape.mark === 'line' ? (
          <LineChart data={shape.rows} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
            {axes}
            <Line
              type="monotone"
              dataKey="value"
              dot={false}
              strokeWidth={2}
              stroke="currentColor"
              className="text-george-navy"
            />
          </LineChart>
        ) : (
          <BarChart data={shape.rows} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
            {axes}
            <Bar
              dataKey="value"
              radius={[3, 3, 0, 0]}
              fill="currentColor"
              className="text-george-navy"
            />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
