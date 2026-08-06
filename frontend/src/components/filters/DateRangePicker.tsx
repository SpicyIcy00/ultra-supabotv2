import React from 'react';
import { DayPicker } from 'react-day-picker';
import type { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { calculateCustomPeriod, getComparisonLabel } from '../../utils/dateCalculations';
import 'react-day-picker/dist/style.css';
import './DateRangePicker.css';

interface DateRangePickerProps {
  startDate: Date | null;
  endDate: Date | null;
  onRangeSelect: (range: { start: Date | null; end: Date | null }) => void;
  onClear: () => void;
  onApply: () => void;
  onCancel: () => void;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onRangeSelect,
  onClear,
  onApply,
  onCancel,
}) => {
  const [range, setRange] = React.useState<DateRange | undefined>({
    from: startDate || undefined,
    to: endDate || undefined,
  });
  const [isPhone, setIsPhone] = React.useState(typeof window !== 'undefined' && window.innerWidth < 768);

  React.useEffect(() => {
    const handleResize = () => setIsPhone(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSelect = (selectedRange: DateRange | undefined) => {
    setRange(selectedRange);
    onRangeSelect({
      start: selectedRange?.from || null,
      end: selectedRange?.to || null,
    });
  };

  const handleClear = () => {
    setRange(undefined);
    onClear();
  };

  // Preview of what this range will be measured against, so the weekday-aligned
  // comparison is visible before the user commits to it.
  const comparisonPreview = React.useMemo(() => {
    if (!range?.from || !range?.to) return null;
    const { comparison } = calculateCustomPeriod(range.from, range.to);
    return {
      label: getComparisonLabel('CUSTOM', range.from, range.to),
      start: format(comparison.start, 'EEE MMM d'),
      end: format(comparison.end, 'EEE MMM d, yyyy'),
    };
  }, [range?.from, range?.to]);

  const footer = (
    <div className="date-range-picker-footer">
      <div className="date-range-display">
        {range?.from ? (
          <>
            <div className="date-badge start">
              <span className="label">Start:</span>
              <span className="date">{format(range.from, 'MMM dd, yyyy')}</span>
            </div>
            {range.to && (
              <>
                <span className="arrow">→</span>
                <div className="date-badge end">
                  <span className="label">End:</span>
                  <span className="date">{format(range.to, 'MMM dd, yyyy')}</span>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="date-hint">Click a date to start selecting a range</div>
        )}
      </div>
      {comparisonPreview && (
        <div className="comparison-note">
          Compares against <strong>{comparisonPreview.start} – {comparisonPreview.end}</strong>
          {' '}({comparisonPreview.label.replace(/^vs /, '')})
        </div>
      )}
      <div className="date-range-actions">
        <button onClick={handleClear} className="btn-secondary" disabled={!range?.from}>
          Clear
        </button>
        <button onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button
          onClick={onApply}
          className="btn-primary"
          disabled={!range?.from || !range?.to}
        >
          Apply
        </button>
      </div>
    </div>
  );

  return (
    <div className="date-range-picker-container">
      <DayPicker
        mode="range"
        selected={range}
        onSelect={handleSelect}
        numberOfMonths={isPhone ? 1 : 2}
        footer={footer}
        className="custom-day-picker"
      />
    </div>
  );
};
