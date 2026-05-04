import type { WarningSeverity } from './domain';

export interface WarningItem {
  severity: WarningSeverity;
  message: string;
  code: string;
  relatedIds?: string[];
}

export interface AuditReport {
  passes: string[];
  warns: string[];
  fails: string[];
  metrics: Record<string, number | string | null>;
}
