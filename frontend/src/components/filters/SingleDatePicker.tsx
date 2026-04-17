import React from 'react';
import { DayPicker } from 'react-day-picker';
import { format } from 'date-fns';
import 'react-day-picker/dist/style.css';
import './DateRangePicker.css';

interface SingleDatePickerProps {
  selected: Date | null;
  onSelect: (date: Date) => void;
  onClear: () => void;
  onApply: () => void;
  onCancel: () => void;
  maxDate?: Date;
}

export const SingleDatePicker: React.FC<SingleDatePickerProps> = ({
  selected,
  onSelect,
  onClear,
  onApply,
  onCancel,
  maxDate,
}) => {
  const [pending, setPending] = React.useState<Date | undefined>(selected || undefined);

  const handleSelect = (day: Date | undefined) => {
    setPending(day);
    if (day) onSelect(day);
  };

  const handleClear = () => {
    setPending(undefined);
    onClear();
  };

  const footer = (
    <div className="date-range-picker-footer">
      <div className="date-range-display">
        {pending ? (
          <div className="date-badge start">
            <span className="label">Selected:</span>
            <span className="date">{format(pending, 'MMM dd, yyyy')}</span>
          </div>
        ) : (
          <div className="date-hint">Click a date to select</div>
        )}
      </div>
      <div className="date-range-actions">
        <button onClick={handleClear} className="btn-secondary" disabled={!pending}>
          Clear
        </button>
        <button onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button onClick={onApply} className="btn-primary" disabled={!pending}>
          Apply
        </button>
      </div>
    </div>
  );

  return (
    <div className="date-range-picker-container">
      <DayPicker
        mode="single"
        selected={pending}
        onSelect={handleSelect}
        disabled={maxDate ? { after: maxDate } : undefined}
        numberOfMonths={1}
        footer={footer}
        className="custom-day-picker"
      />
    </div>
  );
};
