import { describe, expect, it, vi } from 'vitest';

import { createPlannerStore } from '../../src/app/store';
import { createPlannerEngine } from '../../src/core/engine';
import { plannerClock } from '../../src/core/time';
import type {
  EngineSnapshot,
  PlannerComputeAdapter,
  PlannerProjectV1,
} from '../../src/core/types';
import {
  makeProject,
  makeTestEnrichmentProvider,
  silentLogger,
} from './store-test-utils';

function flushMicrotasks(): Promise<void> {
  return Promise.resolve().then(() => undefined);
}

describe('worker compute integration', () => {
  it('ignores stale worker snapshot responses', async () => {
    const engine = createPlannerEngine({
      clock: plannerClock,
      logger: silentLogger,
    });
    const pending: Array<{
      project: PlannerProjectV1;
      resolve(snapshot: EngineSnapshot): void;
    }> = [];
    const computeAdapter: PlannerComputeAdapter = {
      mode: 'worker',
      compute: vi.fn(
        (project) =>
          new Promise<EngineSnapshot>((resolve) => {
            pending.push({ project, resolve });
          }),
      ),
      cancelCurrent: vi.fn(),
    };
    const store = createPlannerStore({
      initialProject: makeProject(),
      engine,
      computeAdapter,
      enrichmentProvider: makeTestEnrichmentProvider(),
      logger: silentLogger,
      clock: plannerClock,
    });

    store.commands.updateConstraint('hpd', 2);
    store.commands.updateConstraint('hpd', 4);
    expect(pending).toHaveLength(2);

    pending[0]?.resolve(engine.computeSnapshot(pending[0].project));
    await flushMicrotasks();
    expect(store.selectors.getProject().constraints.hpd).not.toBe(2);

    pending[1]?.resolve(engine.computeSnapshot(pending[1].project));
    await flushMicrotasks();
    expect(store.selectors.getProject().constraints.hpd).toBe(4);
  });
});
