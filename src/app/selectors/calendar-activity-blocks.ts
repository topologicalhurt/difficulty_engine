import type {
  CalendarActivityOverride,
  CalendarLearningMode,
} from '../../core/types';
import { parseLocalDateKey } from '../../core/time';
import { round1 } from '../../core/utils';
import type { CalendarWeek } from './calendar-weeks';
import {
  clampStartMinute,
  formatClockMinute,
  nextAvailableStart,
  type OccupiedInterval,
} from './calendar-time';

export interface HourlyCalendarActivityBlock {
  id: string;
  activityId: string;
  title: string;
  color: string;
  mode: CalendarActivityOverride['mode'];
  dateKey: string;
  startMinute: number;
  durationMinutes: number;
  endMinute: number;
  timeLabel: string;
}

export function intervalFromActivity(
  block: HourlyCalendarActivityBlock,
): OccupiedInterval {
  return { startMinute: block.startMinute, endMinute: block.endMinute };
}

function activityBlockFor(
  activity: CalendarActivityOverride,
  dateKey: string,
  startMinute: number,
  durationMinutes: number,
): HourlyCalendarActivityBlock {
  const start = clampStartMinute(startMinute);
  const duration = Math.min(durationMinutes, 24 * 60 - start);
  const endMinute = Math.min(24 * 60, start + duration);
  return {
    id: `${dateKey}:${activity.id}:${start}`,
    activityId: activity.id,
    title: activity.title,
    color: activity.color,
    mode: activity.mode,
    dateKey,
    startMinute: start,
    durationMinutes: duration,
    endMinute,
    timeLabel: `${formatClockMinute(start)}-${formatClockMinute(endMinute)}`,
  };
}

export function fixedActivityBlocksForDay(
  activities: CalendarActivityOverride[],
  dateKey: string,
): HourlyCalendarActivityBlock[] {
  const weekday = parseLocalDateKey(dateKey).getDay();
  return activities
    .filter(
      (activity) =>
        activity.mode === 'fixed_weekly' && activity.days.includes(weekday),
    )
    .map((activity) =>
      activityBlockFor(
        activity,
        dateKey,
        activity.startMinute,
        activity.durationMinutes,
      ),
    );
}

export function flexibleActivityBlocksForWeek(
  activities: CalendarActivityOverride[],
  week: CalendarWeek,
  occupiedByDate: Map<string, OccupiedInterval[]>,
  mode: CalendarLearningMode,
): HourlyCalendarActivityBlock[] {
  const blocks: HourlyCalendarActivityBlock[] = [];
  activities
    .filter((activity) => activity.mode === 'flexible_weekly')
    .forEach((activity) => {
      let remainingMinutes = activity.weeklyMinutes;
      const sessionCount = Math.min(
        activity.sessionsPerWeek,
        Math.ceil(activity.weeklyMinutes / activity.durationMinutes),
      );
      for (
        let session = 0;
        session < sessionCount && remainingMinutes > 0;
        session += 1
      ) {
        const day = week.days[session % week.days.length];
        if (!day) continue;
        const occupied = occupiedByDate.get(day.key) ?? [];
        const duration = Math.min(activity.durationMinutes, remainingMinutes);
        const start = nextAvailableStart(duration, occupied, mode);
        const block = activityBlockFor(activity, day.key, start, duration);
        blocks.push(block);
        occupied.push(intervalFromActivity(block));
        occupiedByDate.set(day.key, occupied);
        remainingMinutes -= duration;
      }
    });
  return blocks;
}

export function activitySummaries(
  activities: CalendarActivityOverride[],
): string[] {
  return activities.map((activity) =>
    activity.mode === 'fixed_weekly'
      ? `${activity.title}: ${activity.days.length} fixed day(s), ${Math.round(activity.durationMinutes / 60)}h each`
      : `${activity.title}: flexible ${round1(activity.weeklyMinutes / 60)}h/week`,
  );
}

export function activityRows(activities: CalendarActivityOverride[]): Array<{
  id: string;
  title: string;
  color: string;
  summary: string;
}> {
  return activities.map((activity) => ({
    id: activity.id,
    title: activity.title,
    color: activity.color,
    summary:
      activity.mode === 'fixed_weekly'
        ? `${activity.days.length} fixed day(s)`
        : `${Math.round(activity.weeklyMinutes / 60)}h flexible/wk`,
  }));
}
