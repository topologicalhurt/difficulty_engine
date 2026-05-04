import type { WarningItem } from './types';

export function createWarning(
  severity: WarningItem['severity'],
  code: string,
  message: string,
  relatedIds: string[] = [],
): WarningItem {
  return { severity, code, message, relatedIds };
}
