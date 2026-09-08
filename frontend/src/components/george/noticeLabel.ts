/**
 * The reader's name for each notice kind. Level 1 of the caveat's disclosure.
 *
 * Apart from NoticeBanner so the compact caveat (Instruments.CoverageCaveat)
 * and the banner name a kind with the same words — and because a component
 * file that also exports a helper breaks fast refresh. Unknown kinds pass
 * through with their underscores opened out.
 */
export const KIND_LABEL: Record<string, string> = {
  low_stock_not_operational: 'Thresholds not configured',
  snapshot_coverage_gap: 'Outside snapshot coverage',
  snapshot_gaps: 'Gaps in the snapshot series',
  sku_not_found: 'Unknown SKU',
  ambiguous_sku: 'SKU matches several products',
  duplicate_skus_in_result: 'Duplicate SKUs in result',
  metric_redefined: 'Metric means something different here',
  reconciliation_failed: 'Measures disagree',
  orphan_line_items: 'Line items with no product',
  profit_overstated: 'Profit overstated',
  low_category_coverage: 'Low category coverage',
  stale_stock: 'Stock data is stale',
  no_recorded_dispatch: 'No recorded dispatch',
  notice_forced: 'Caveat added automatically',
  unsurfaced_notice: 'Caveat was missing',
  logging_failed: 'Logging failed',
  // Drawn as its coverage when the state is on the meta (caveatShape.ts).
  comparison_incomplete: 'Some could not be compared',
  ratio_undefined: 'Figure undefined',
};
