import React, { useState, useEffect } from 'react';
import { 
  format, 
  eachDayOfInterval, 
  startOfMonth, 
  endOfMonth, 
  subMonths, 
  addMonths, 
  parseISO, 
  isWithinInterval,
  startOfDay,
  isValid
} from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarRange, X } from 'lucide-react';
import { clsx } from 'clsx';
import { Period } from '../types';

interface CalendarSelectorProps {
  periods: Period[];
  selectedDates: string[]; // YYYY-MM-DD
  onSelectionChange: (dates: string[]) => void;
  color?: string;
  focusDate?: Date; // Optional: Force the calendar to jump to this date
  enableRangeSelection?: boolean; // New prop to enable the internal range mode
}

const CalendarSelector: React.FC<CalendarSelectorProps> = ({ 
  periods, 
  selectedDates = [], 
  onSelectionChange, 
  color = '#3b82f6', 
  focusDate,
  enableRangeSelection = false
}) => {
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  
  // Range Mode State
  const [isRangeMode, setIsRangeMode] = useState(false);
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  
  // Logic to jump to a specific date if requested (e.g. from Quick Range input)
  useEffect(() => {
    if (focusDate && isValid(focusDate)) {
      setCurrentMonth(startOfMonth(focusDate));
    }
  }, [focusDate]);

  // Logic to set initial view month based on data
  useEffect(() => {
    // Only run this logic if we haven't been forced by focusDate recently
    if (!focusDate && periods.length > 0) {
      // 1. If we have selected dates, focus on the first one
      if (selectedDates && selectedDates.length > 0) {
        const firstSelected = parseISO(selectedDates[0]);
        if (isValid(firstSelected)) {
          setCurrentMonth(firstSelected);
          return;
        }
      }

      // 2. Otherwise try to focus on today if it's relevant
      const now = new Date();
      const minDate = periods.reduce((min, p) => {
        const d = parseISO(p.startDate);
        return d < min ? d : min;
      }, parseISO(periods[0].startDate));

      const maxDate = periods.reduce((max, p) => {
        const d = parseISO(p.endDate);
        return d > max ? d : max;
      }, parseISO(periods[0].endDate));

      if (isWithinInterval(now, { start: minDate, end: maxDate })) {
        setCurrentMonth(now);
      } else {
        // 3. Otherwise default to start of bill
        setCurrentMonth(minDate);
      }
    }
  }, [periods[0]?.startDate]); 

  const isDateAllowed = (date: Date) => {
    // Simple string comparison for robust checking against YYYY-MM-DD inputs
    const dStr = format(date, 'yyyy-MM-dd');
    return periods.some(p => dStr >= p.startDate && dStr <= p.endDate);
  };

  // Selection Logic
  const handleDateClick = (day: Date, dateStr: string) => {
    if (!isRangeMode) {
      // Single Toggle Mode
      const dates = selectedDates || [];
      const isSelected = dates.includes(dateStr);
      if (isSelected) {
        onSelectionChange(dates.filter(d => d !== dateStr));
      } else {
        onSelectionChange([...dates, dateStr].sort());
      }
    } else {
      // Range Mode
      if (!rangeStart) {
        // Set Start
        setRangeStart(day);
      } else {
        // Set End and Calculate
        let start = rangeStart;
        let end = day;
        if (start > end) {
          [start, end] = [end, start];
        }

        const daysInRange = eachDayOfInterval({ start, end });
        const validDays = daysInRange
          .filter(d => isDateAllowed(d))
          .map(d => format(d, 'yyyy-MM-dd'));
        
        // Merge with existing
        const newSet = new Set([...selectedDates, ...validDays]);
        onSelectionChange(Array.from(newSet).sort());
        
        // Reset Range Mode
        setRangeStart(null);
        setIsRangeMode(false);
      }
    }
  };

  // Render Days
  const renderDays = () => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });
    const emptyStartDays = Array(start.getDay()).fill(null);

    return (
      <div className="grid grid-cols-7 gap-1 text-center text-sm">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
          <div key={d} className="font-bold text-gray-400 py-1">{d}</div>
        ))}
        {emptyStartDays.map((_, i) => <div key={`empty-${i}`} />)}
        {days.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isSelected = (selectedDates || []).includes(dateStr);
          const isAllowed = isDateAllowed(day);
          const isRangeStart = rangeStart && format(rangeStart, 'yyyy-MM-dd') === dateStr;

          return (
            <button
              type="button" // Critical: prevent form submission behavior
              key={dateStr}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation(); // Critical: ensure click is handled here
                if (isAllowed) handleDateClick(day, dateStr);
              }}
              disabled={!isAllowed}
              className={clsx(
                "h-10 w-full rounded-md flex items-center justify-center transition-colors relative touch-manipulation", // touch-manipulation for better mobile tap
                !isAllowed && "text-gray-200 cursor-not-allowed bg-gray-50",
                isAllowed && !isSelected && !isRangeStart && "hover:bg-gray-100 text-gray-700",
                isAllowed && (isSelected || isRangeStart) && "text-white font-bold shadow-sm",
                isRangeStart && "ring-2 ring-offset-1 ring-blue-400 z-10"
              )}
              style={isAllowed && (isSelected || isRangeStart) ? { backgroundColor: color } : {}}
            >
              {format(day, 'd')}
              {isAllowed && (
                <div className={clsx("absolute bottom-1 w-1 h-1 rounded-full", (isSelected || isRangeStart) ? "bg-white/50" : "bg-blue-200")} />
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4" onClick={(e) => e.stopPropagation()}>
      
      {/* Header with Navigation and Range Toggle */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex justify-between items-center">
          <button 
            type="button"
            onClick={(e) => { e.preventDefault(); setCurrentMonth(subMonths(currentMonth, 1)); }} 
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <ChevronLeft size={20} />
          </button>
          <h3 className="font-semibold text-gray-700">{format(currentMonth, 'MMMM yyyy')}</h3>
          <button 
            type="button"
            onClick={(e) => { e.preventDefault(); setCurrentMonth(addMonths(currentMonth, 1)); }} 
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Range Mode Toggle */}
        {enableRangeSelection && (
          <div className="flex justify-center">
             {!isRangeMode ? (
               <button 
                 type="button"
                 onClick={() => setIsRangeMode(true)}
                 className="flex items-center gap-2 text-xs font-medium bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors"
               >
                 <CalendarRange size={14} />
                 Select Range
               </button>
             ) : (
               <div className="flex items-center gap-2 animate-fade-in">
                  <span className="text-xs font-bold text-gray-600 bg-gray-100 px-3 py-1.5 rounded-l-full">
                    {rangeStart ? "Tap End Date" : "Tap Start Date"}
                  </span>
                  <button 
                    type="button"
                    onClick={() => { setIsRangeMode(false); setRangeStart(null); }}
                    className="flex items-center gap-1 text-xs font-medium bg-red-50 text-red-600 px-3 py-1.5 rounded-r-full hover:bg-red-100 transition-colors border-l border-white"
                  >
                    <X size={14} /> Cancel
                  </button>
               </div>
             )}
          </div>
        )}
      </div>

      {renderDays()}
      
      <div className="mt-2 text-xs text-gray-400 text-center">
        {isRangeMode 
          ? (rangeStart ? "Select the last day of the range" : "Select the first day of the range")
          : "Tap days to toggle stay"
        }
      </div>
    </div>
  );
};

export default CalendarSelector;