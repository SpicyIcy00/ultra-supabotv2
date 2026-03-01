// Date calculation utilities for dashboard periods

export type PeriodType = '1D' | 'WTD' | '7D' | 'MTD' | '30D' | '3MTD' | '90D' | '6MTD' | 'YTD' | 'CUSTOM';

export interface DateRange {
  start: Date;
  end: Date;
}

export interface PeriodDateRanges {
  current: DateRange;
  comparison: DateRange;
}

/**
 * Get the start of the week (Monday)
 */
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday
  return new Date(d.setDate(diff));
}

/**
 * Get yesterday's date
 */
function getYesterday(): Date {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  return yesterday;
}

/**
 * Get today's date
 */
function getToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Calculate date ranges for 1D (Yesterday) period
 * Compare yesterday to same day last week
 */
export function calculate1DPeriod(): PeriodDateRanges {
  const yesterday = getYesterday();
  const yesterdayEnd = new Date(yesterday);
  yesterdayEnd.setHours(23, 59, 59, 999);

  // Same day last week
  const lastWeekSameDay = new Date(yesterday);
  lastWeekSameDay.setDate(lastWeekSameDay.getDate() - 7);
  const lastWeekSameDayEnd = new Date(lastWeekSameDay);
  lastWeekSameDayEnd.setHours(23, 59, 59, 999);

  return {
    current: {
      start: yesterday,
      end: yesterdayEnd,
    },
    comparison: {
      start: lastWeekSameDay,
      end: lastWeekSameDayEnd,
    },
  };
}

/**
 * Calculate date ranges for WTD (Week to Date) period
 * Monday to TODAY (not yesterday)
 * Compare current week-to-date to same period last week
 */
export function calculateWTDPeriod(): PeriodDateRanges {
  const today = getToday();

  // This week: Monday to TODAY
  const thisMonday = getMonday(today);
  thisMonday.setHours(0, 0, 0, 0);

  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  // Last week: same Monday to same day of week
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(lastMonday.getDate() - 7);

  const lastWeekSameDay = new Date(today);
  lastWeekSameDay.setDate(lastWeekSameDay.getDate() - 7);
  const lastWeekSameDayEnd = new Date(lastWeekSameDay);
  lastWeekSameDayEnd.setHours(23, 59, 59, 999);

  return {
    current: {
      start: thisMonday,
      end: todayEnd,
    },
    comparison: {
      start: lastMonday,
      end: lastWeekSameDayEnd,
    },
  };
}

/**
 * Calculate date ranges for 7D (Last 7 Days) period
 * Last 7 days NOT including today
 * Compare to the 7 days before that
 */
export function calculate7DPeriod(): PeriodDateRanges {

  // Current: 7 days ago to yesterday
  const currentEnd = getYesterday();
  currentEnd.setHours(23, 59, 59, 999);

  const currentStart = new Date(currentEnd);
  currentStart.setDate(currentStart.getDate() - 6); // -6 because we include the end day
  currentStart.setHours(0, 0, 0, 0);

  // Comparison: 14 days ago to 8 days ago
  const comparisonEnd = new Date(currentStart);
  comparisonEnd.setDate(comparisonEnd.getDate() - 1);
  comparisonEnd.setHours(23, 59, 59, 999);

  const comparisonStart = new Date(comparisonEnd);
  comparisonStart.setDate(comparisonStart.getDate() - 6);
  comparisonStart.setHours(0, 0, 0, 0);

  return {
    current: {
      start: currentStart,
      end: currentEnd,
    },
    comparison: {
      start: comparisonStart,
      end: comparisonEnd,
    },
  };
}

/**
 * Calculate date ranges for MTD (Month to Date) period
 * 1st of month to TODAY (not yesterday)
 * Compare current month-to-date to same period last month
 */
export function calculateMTDPeriod(): PeriodDateRanges {
  const today = getToday();
  const dayOfMonth = today.getDate();

  // This month: 1st to TODAY
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  firstOfMonth.setHours(0, 0, 0, 0);

  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  // Last month: 1st to same day number
  const firstOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  firstOfLastMonth.setHours(0, 0, 0, 0);

  const lastMonthSameDay = new Date(today.getFullYear(), today.getMonth() - 1, dayOfMonth);
  const lastMonthSameDayEnd = new Date(lastMonthSameDay);
  lastMonthSameDayEnd.setHours(23, 59, 59, 999);

  return {
    current: {
      start: firstOfMonth,
      end: todayEnd,
    },
    comparison: {
      start: firstOfLastMonth,
      end: lastMonthSameDayEnd,
    },
  };
}

/**
 * Calculate date ranges for 30D (Last 30 Days) period
 * Last 30 days NOT including today
 * Compare to the 30 days before that
 */
export function calculate30DPeriod(): PeriodDateRanges {

  // Current: 30 days ago to yesterday
  const currentEnd = getYesterday();
  currentEnd.setHours(23, 59, 59, 999);

  const currentStart = new Date(currentEnd);
  currentStart.setDate(currentStart.getDate() - 29); // -29 because we include the end day
  currentStart.setHours(0, 0, 0, 0);

  // Comparison: 60 days ago to 31 days ago
  const comparisonEnd = new Date(currentStart);
  comparisonEnd.setDate(comparisonEnd.getDate() - 1);
  comparisonEnd.setHours(23, 59, 59, 999);

  const comparisonStart = new Date(comparisonEnd);
  comparisonStart.setDate(comparisonStart.getDate() - 29);
  comparisonStart.setHours(0, 0, 0, 0);

  return {
    current: {
      start: currentStart,
      end: currentEnd,
    },
    comparison: {
      start: comparisonStart,
      end: comparisonEnd,
    },
  };
}

/**
 * Calculate date ranges for 90D (Last 90 Days) period
 * Last 90 days NOT including today
 * Compare to the 90 days before that
 */
export function calculate90DPeriod(): PeriodDateRanges {

  // Current: 90 days ago to yesterday
  const currentEnd = getYesterday();
  currentEnd.setHours(23, 59, 59, 999);

  const currentStart = new Date(currentEnd);
  currentStart.setDate(currentStart.getDate() - 89); // -89 because we include the end day
  currentStart.setHours(0, 0, 0, 0);

  // Comparison: 180 days ago to 91 days ago
  const comparisonEnd = new Date(currentStart);
  comparisonEnd.setDate(comparisonEnd.getDate() - 1);
  comparisonEnd.setHours(23, 59, 59, 999);

  const comparisonStart = new Date(comparisonEnd);
  comparisonStart.setDate(comparisonStart.getDate() - 89);
  comparisonStart.setHours(0, 0, 0, 0);

  return {
    current: {
      start: currentStart,
      end: currentEnd,
    },
    comparison: {
      start: comparisonStart,
      end: comparisonEnd,
    },
  };
}

/**
 * Calculate date ranges for 3MTD (3 Months to Date) period
 * First day of 3 months ago to TODAY
 * Compare to same 3-month period before that
 */
export function calculate3MTDPeriod(): PeriodDateRanges {
  const today = getToday();

  // Current: First day of 3 months ago to TODAY
  const currentStart = new Date(today.getFullYear(), today.getMonth() - 2, 1);
  currentStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  // Calculate number of days in current period
  const daysDiff = Math.floor((todayEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  // Comparison: Same number of days, ending the day before current period starts
  const comparisonEnd = new Date(currentStart);
  comparisonEnd.setDate(comparisonEnd.getDate() - 1);
  comparisonEnd.setHours(23, 59, 59, 999);

  const comparisonStart = new Date(comparisonEnd);
  comparisonStart.setDate(comparisonStart.getDate() - daysDiff + 1);
  comparisonStart.setHours(0, 0, 0, 0);

  return {
    current: {
      start: currentStart,
      end: todayEnd,
    },
    comparison: {
      start: comparisonStart,
      end: comparisonEnd,
    },
  };
}

/**
 * Calculate date ranges for 6MTD (6 Months to Date) period
 * First day of 6 months ago to TODAY
 * Compare to same 6-month period before that
 */
export function calculate6MTDPeriod(): PeriodDateRanges {
  const today = getToday();

  // Current: First day of 6 months ago to TODAY
  const currentStart = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  currentStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  // Calculate number of days in current period
  const daysDiff = Math.floor((todayEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  // Comparison: Same number of days, ending the day before current period starts
  const comparisonEnd = new Date(currentStart);
  comparisonEnd.setDate(comparisonEnd.getDate() - 1);
  comparisonEnd.setHours(23, 59, 59, 999);

  const comparisonStart = new Date(comparisonEnd);
  comparisonStart.setDate(comparisonStart.getDate() - daysDiff + 1);
  comparisonStart.setHours(0, 0, 0, 0);

  return {
    current: {
      start: currentStart,
      end: todayEnd,
    },
    comparison: {
      start: comparisonStart,
      end: comparisonEnd,
    },
  };
}

/**
 * Calculate date ranges for YTD (Year to Date) period
 * January 1 to TODAY
 * Compare to same period last year
 */
export function calculateYTDPeriod(): PeriodDateRanges {
  const today = getToday();

  // This year: January 1 to TODAY
  const jan1ThisYear = new Date(today.getFullYear(), 0, 1);
  jan1ThisYear.setHours(0, 0, 0, 0);

  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  // Last year: January 1 to same date last year
  const jan1LastYear = new Date(today.getFullYear() - 1, 0, 1);
  jan1LastYear.setHours(0, 0, 0, 0);

  const sameDateLastYear = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  const sameDateLastYearEnd = new Date(sameDateLastYear);
  sameDateLastYearEnd.setHours(23, 59, 59, 999);

  return {
    current: {
      start: jan1ThisYear,
      end: todayEnd,
    },
    comparison: {
      start: jan1LastYear,
      end: sameDateLastYearEnd,
    },
  };
}

/**
 * Calculate date ranges for CUSTOM period
 * User selects start and end dates
 * Automatically calculates comparison period
 */
export function calculateCustomPeriod(customStart: Date, customEnd: Date): PeriodDateRanges {
  const currentStart = new Date(customStart);
  currentStart.setHours(0, 0, 0, 0);

  const currentEnd = new Date(customEnd);
  currentEnd.setHours(23, 59, 59, 999);

  // Calculate number of days in range
  const daysDiff = Math.floor((currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  // Subtract same number of days for comparison
  const comparisonEnd = new Date(currentStart);
  comparisonEnd.setDate(comparisonEnd.getDate() - 1);
  comparisonEnd.setHours(23, 59, 59, 999);

  const comparisonStart = new Date(comparisonEnd);
  comparisonStart.setDate(comparisonStart.getDate() - daysDiff + 1);
  comparisonStart.setHours(0, 0, 0, 0);

  return {
    current: {
      start: currentStart,
      end: currentEnd,
    },
    comparison: {
      start: comparisonStart,
      end: comparisonEnd,
    },
  };
}

/**
 * Calculate date ranges based on period type
 */
export function calculatePeriodDateRanges(
  period: PeriodType,
  customStart?: Date,
  customEnd?: Date
): PeriodDateRanges {
  switch (period) {
    case '1D':
      return calculate1DPeriod();
    case 'WTD':
      return calculateWTDPeriod();
    case '7D':
      return calculate7DPeriod();
    case 'MTD':
      return calculateMTDPeriod();
    case '30D':
      return calculate30DPeriod();
    case '3MTD':
      return calculate3MTDPeriod();
    case '90D':
      return calculate90DPeriod();
    case '6MTD':
      return calculate6MTDPeriod();
    case 'YTD':
      return calculateYTDPeriod();
    case 'CUSTOM':
      if (!customStart || !customEnd) {
        throw new Error('Custom dates required for CUSTOM period');
      }
      return calculateCustomPeriod(customStart, customEnd);
    default:
      return calculate1DPeriod();
  }
}

/**
 * Format date to ISO string for API calls (YYYY-MM-DD)
 * Uses local timezone to avoid off-by-one errors
 */
export function formatDateForAPI(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get granularity for sales trend based on period
 */
export function getGranularityForPeriod(period: PeriodType): 'hour' | 'day' {
  // Only 1D shows hourly breakdown, all others show daily
  return period === '1D' ? 'hour' : 'day';
}

/**
 * Calculate percentage change
 */
export function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return ((current - previous) / previous) * 100;
}

/**
 * Format percentage for display
 */
export function formatPercentage(value: number): string {
  if (isNaN(value) || !isFinite(value)) {
    return 'N/A';
  }
  const arrow = value >= 0 ? '↑' : '↓';
  return `${arrow} ${Math.abs(value).toFixed(1)}%`;
}

/**
 * Check if comparison is new (previous value is 0)
 */
export function isNewMetric(previous: number): boolean {
  return previous === 0;
}

/**
 * Get period label for display
 */
export function getPeriodLabel(period: PeriodType): string {
  switch (period) {
    case '1D':
      return 'Yesterday';
    case 'WTD':
      return 'Week to Date';
    case '7D':
      return 'Last 7 Days';
    case 'MTD':
      return 'Month to Date';
    case '30D':
      return 'Last 30 Days';
    case '3MTD':
      return '3 Months to Date';
    case '90D':
      return 'Last 90 Days';
    case '6MTD':
      return '6 Months to Date';
    case 'YTD':
      return 'Year to Date';
    case 'CUSTOM':
      return 'Custom Period';
    default:
      return '';
  }
}

/**
 * Get comparison period label for display
 */
export function getComparisonLabel(period: PeriodType): string {
  switch (period) {
    case '1D':
      return 'vs same day last week';
    case 'WTD':
      return 'vs same period last week';
    case '7D':
      return 'vs previous 7 days';
    case 'MTD':
      return 'vs same period last month';
    case '30D':
      return 'vs previous 30 days';
    case '3MTD':
      return 'vs previous 3 months';
    case '90D':
      return 'vs previous 90 days';
    case '6MTD':
      return 'vs previous 6 months';
    case 'YTD':
      return 'vs same period last year';
    case 'CUSTOM':
      return 'vs previous period';
    default:
      return '';
  }
}

/**
 * Format currency for display (Philippine Peso)
 */
export function formatCurrency(value: number): string {
  return `₱${Math.round(value).toLocaleString('en-PH')}`;
}

/**
 * Format number with commas
 */
export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('en-PH');
}

/**
 * Convert 24-hour to 12-hour format
 */
export function formatHourLabel(hour: number): string {
  if (hour === 0) return '12:00 AM';
  if (hour === 12) return '12:00 PM';
  if (hour < 12) return `${hour}:00 AM`;
  return `${hour - 12}:00 PM`;
}

/**
 * Format date range for display
 */
export function formatDateRangeLabel(start: Date, end: Date): string {
  const startStr = `${start.getMonth() + 1}/${start.getDate()}`;
  const endStr = `${end.getMonth() + 1}/${end.getDate()}`;
  return `${startStr} - ${endStr}`;
}
