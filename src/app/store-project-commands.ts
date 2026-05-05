import {
  createEmptyProject,
  normalizeProject,
  parseProject,
  serializeProject,
} from '../core/project-file';
import type {
  PlannerProjectV1,
  PlannerStoreCommands,
  SourceSettings,
} from '../core/types';
import type { StoreCommandContext } from './store-command-context';
import { applySourceSettingsPatch } from './store-source-settings-helpers';

export function createProjectCommands(
  context: StoreCommandContext,
): Pick<
  PlannerStoreCommands,
  | 'setImportExportText'
  | 'importProjectText'
  | 'loadProject'
  | 'resetProject'
  | 'updateSourceSettings'
> {
  const sourcePatch = (patch: Partial<SourceSettings>): PlannerProjectV1 => {
    const state = context.getState();
    return applySourceSettingsPatch(state.project, patch);
  };

  return {
    setImportExportText(value: string): void {
      context.commitUi('project.editText', {
        importExportText: value,
        importExportDirty:
          value !== serializeProject(context.getState().project),
      });
    },
    importProjectText(text: string): void {
      const nextProject = parseProject(text);
      context.commitProject('project.importText', nextProject, {
        importExportText: serializeProject(nextProject),
        importExportDirty: false,
        selectedBookId: Object.keys(nextProject.library.books)[0] ?? null,
        banner: { tone: 'success', message: 'Project imported successfully.' },
      });
    },
    loadProject(raw: unknown): void {
      const nextProject = normalizeProject(raw as Record<string, unknown>);
      context.commitProject('project.load', nextProject, {
        importExportText: serializeProject(nextProject),
        importExportDirty: false,
        selectedBookId: Object.keys(nextProject.library.books)[0] ?? null,
        banner: { tone: 'success', message: 'Project loaded successfully.' },
      });
    },
    resetProject(): void {
      const nextProject = createEmptyProject();
      context.commitProject('project.reset', nextProject, {
        importExportText: serializeProject(nextProject),
        importExportDirty: false,
        selectedBookId: null,
        activeView: 'library',
        banner: { tone: 'warn', message: 'Started a fresh project.' },
      });
    },
    updateSourceSettings(patch: Partial<SourceSettings>): void {
      context.commitProject('project.sourceSettings', sourcePatch(patch), {
        banner: { tone: 'success', message: 'Source settings updated.' },
      });
    },
  };
}
