import React from 'react';
import { DayPicker } from 'react-day-picker';
import type { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
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
        numberOfMonths={2}
        footer={footer}
        className="custom-day-picker"
      />
    </div>
  );
};
