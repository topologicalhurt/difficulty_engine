import { round1 } from '../../core/utils';
import { calendarDateTime } from './calendar-time';

interface StudyCalendarBlock {
  id: string;
  short: string;
  title: string;
  dateKey: string;
  startMinute: number;
  endMinute: number;
  plannedMinutes: number;
  plannedPages: number;
}

interface ActivityCalendarBlock {
  id: string;
  title: string;
  mode: 'fixed_weekly' | 'flexible_weekly';
  dateKey: string;
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
}

function escapeIcsText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll('\n', '\\n');
}

function icsDate(dateKey: string, minute: number): string {
  return calendarDateTime(dateKey, minute).replace(/[-:]/g, '');
}

export function buildHourlyCalendarIcs(
  blocks: StudyCalendarBlock[],
  activityBlocks: ActivityCalendarBlock[],
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Difficulty Engine//Hourly Study Calendar//EN',
    'CALSCALE:GREGORIAN',
  ];
  blocks.forEach((block) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeIcsText(block.id)}@difficulty-engine`,
      `SUMMARY:${escapeIcsText(`Study: ${block.short}`)}`,
      `DESCRIPTION:${escapeIcsText(`${block.title}\n${block.plannedMinutes} minute(s), ${round1(block.plannedPages)} page(s).`)}`,
      `DTSTART:${icsDate(block.dateKey, block.startMinute)}`,
      `DTEND:${icsDate(block.dateKey, block.endMinute)}`,
      'END:VEVENT',
    );
  });
  activityBlocks.forEach((block) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeIcsText(block.id)}@difficulty-engine`,
      `SUMMARY:${escapeIcsText(block.title)}`,
      `DESCRIPTION:${escapeIcsText(`${block.mode === 'flexible_weekly' ? 'Flexible weekly activity' : 'Fixed weekly activity'} · ${block.durationMinutes} minute(s).`)}`,
      `DTSTART:${icsDate(block.dateKey, block.startMinute)}`,
      `DTEND:${icsDate(block.dateKey, block.endMinute)}`,
      'END:VEVENT',
    );
  });
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
