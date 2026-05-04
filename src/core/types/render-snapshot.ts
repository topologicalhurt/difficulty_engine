import type { CalendarEntry, ScheduleRow } from './schedule-snapshot';
import type { WarningItem } from './warnings';

export interface RenderModel {
  warnings: WarningItem[];
  gantt: {
    timelineSlots: number;
    totalSlots: number;
    rows: ScheduleRow[];
  };
  calendar: {
    byDate: Record<string, CalendarEntry[]>;
    missedByDate: Record<string, CalendarEntry[]>;
  };
}
