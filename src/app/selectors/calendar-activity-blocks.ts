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
  sourceDay: number,
  startMinute: number,
  durationMinutes: number,
): HourlyCalendarActivityBlock {
  const start = clampStartMinute(startMinute);
  const duration = Math.min(durationMinutes, 24 * 60 - start);
  const endMinute = Math.min(24 * 60, start + duration);
  return {
    id: `${dateKey}:${activity.id}:${sourceDay}:${start}`,
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

function rotationOffset(
  activity: CalendarActivityOverride,
  weekIndex: number,
): number {
  if (!activity.rotationStepDays) return 0;
  const interval = Math.max(1, activity.rotationIntervalWeeks || 1);
  return (
    (Math.floor(Math.max(0, weekIndex) / interval) *
      activity.rotationStepDays) %
    7
  );
}

export function fixedActivityBlocksForDay(
  activities: CalendarActivityOverride[],
  dateKey: string,
  weekIndex: number,
): HourlyCalendarActivityBlock[] {
  const weekday = parseLocalDateKey(dateKey).getDay();
  return activities.flatMap((activity) => {
    if (activity.mode !== 'fixed_weekly') return [];
    const offset = rotationOffset(activity, weekIndex);
    return activity.days.flatMap((sourceDay) => {
      const rotatedDay = (sourceDay + offset) % 7;
      if (rotatedDay !== weekday) return [];
      return activityBlockFor(
        activity,
        dateKey,
        sourceDay,
        activity.startMinute,
        activity.dailyDurations[String(sourceDay)] ?? activity.durationMinutes,
      );
    });
  });
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
      const selectedDays = new Set(activity.days);
      const eligibleDays = week.days.filter((day) =>
        selectedDays.has(parseLocalDateKey(day.key).getDay()),
      );
      if (!eligibleDays.length) return;
      const sessionCount = Math.min(
        activity.sessionsPerWeek,
        Math.ceil(activity.weeklyMinutes / activity.durationMinutes),
      );
      for (
        let session = 0;
        session < sessionCount && remainingMinutes > 0;
        session += 1
      ) {
        const duration = Math.min(activity.durationMinutes, remainingMinutes);
        for (
          let dayOffset = 0;
          dayOffset < eligibleDays.length;
          dayOffset += 1
        ) {
          const day = eligibleDays[(session + dayOffset) % eligibleDays.length];
          if (!day) continue;
          const occupied = occupiedByDate.get(day.key) ?? [];
          const start = nextAvailableStart(duration, occupied, mode);
          if (start == null) continue;
          const block = activityBlockFor(
            activity,
            day.key,
            session * eligibleDays.length + dayOffset,
            start,
            duration,
          );
          blocks.push(block);
          occupied.push(intervalFromActivity(block));
          occupiedByDate.set(day.key, occupied);
          remainingMinutes -= duration;
          break;
        }
      }
    });
  return blocks;
}

export function activitySummaries(
  activities: CalendarActivityOverride[],
): string[] {
  return activities.map((activity) => {
    const rotate =
      activity.rotationStepDays > 0
        ? ` · rotates +${activity.rotationStepDays}d/${activity.rotationIntervalWeeks}w`
        : '';
    return activity.mode === 'fixed_weekly'
      ? `${activity.title}: ${activity.days.length} fixed day(s), ${round1(activity.weeklyMinutes / 60)}h/week${rotate}`
      : `${activity.title}: flexible ${round1(activity.weeklyMinutes / 60)}h/week`;
  });
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
        ? `${round1(activity.weeklyMinutes / 60)}h/wk · ${activity.days.length} fixed day(s)${
            activity.rotationStepDays > 0 ? ' · rotating' : ''
          }`
        : `${Math.round(activity.weeklyMinutes / 60)}h flexible/wk`,
  }));
}
