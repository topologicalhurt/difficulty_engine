import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  WIRING_CONTRACTS,
  commandNamesWithContracts,
} from '../../src/app/wiring/contracts';
import { CONSTRAINT_FIELDS } from '../../src/core/defaults';
import { makeStore } from './store-test-utils';

const ROOT = process.cwd();

function sourceFiles(dir = join(ROOT, 'src', 'app')): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const path = join(dir, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) return sourceFiles(path);
      return path.endsWith('.ts') ? [path] : [];
    })
    .sort();
}

describe('wiring contracts', () => {
  it('has unique contracts with explicit tests and recompute policy', () => {
    const ids = WIRING_CONTRACTS.map((contract) => contract.id);
    expect(new Set(ids).size).toBe(ids.length);
    WIRING_CONTRACTS.forEach((contract) => {
      expect(contract.surface).toBeTruthy();
      expect(contract.control).toBeTruthy();
      expect(contract.recomputePolicy).toMatch(
        /^(ui_only|snapshot|async_then_snapshot|project_load|persistence_only)$/,
      );
      expect(contract.testIds.length).toBeGreaterThan(0);
      if (contract.projectWrites.length) {
        expect(contract.recomputePolicy).not.toBe('ui_only');
      }
    });
  });

  it('covers every public store command and every constraint key', () => {
    const store = makeStore();
    const commandContracts = new Set(commandNamesWithContracts());
    Object.keys(store.commands).forEach((command) => {
      expect(commandContracts.has(command as never)).toBe(true);
    });

    CONSTRAINT_FIELDS.forEach((field) => {
      const key = String(field.key);
      expect(
        WIRING_CONTRACTS.some(
          (contract) => contract.id === `constraint.${key}`,
        ),
      ).toBe(true);
    });
  });

  it('assigns each public command to one wiring owner', () => {
    const store = makeStore();
    const allowedMultiContractCommands = new Set(['updateConstraint']);
    Object.keys(store.commands).forEach((command) => {
      const contracts = WIRING_CONTRACTS.filter(
        (contract) => contract.command === command,
      );
      if (allowedMultiContractCommands.has(command)) {
        expect(
          contracts.every((contract) => contract.id.startsWith('constraint.')),
        ).toBe(true);
        return;
      }
      expect(contracts.map((contract) => contract.id)).toHaveLength(1);
    });
  });

  it('classifies UI-only commands separately from snapshot-mutating commands', () => {
    const uiOnly = WIRING_CONTRACTS.filter(
      (contract) => contract.recomputePolicy === 'ui_only',
    );
    const projectMutations = WIRING_CONTRACTS.filter(
      (contract) => contract.projectWrites.length,
    );
    expect(
      uiOnly.some((contract) => contract.command === 'setActiveView'),
    ).toBe(true);
    expect(
      projectMutations.some(
        (contract) => contract.command === 'updateBookRelations',
      ),
    ).toBe(true);
    expect(
      projectMutations.every(
        (contract) =>
          contract.snapshotEffects.length ||
          contract.recomputePolicy === 'persistence_only',
      ),
    ).toBe(true);
  });

  it('uses only registered wiring contract ids in store commits', () => {
    const contractIds = new Set(
      WIRING_CONTRACTS.map((contract) => contract.id),
    );
    const commitPattern = /\bcommit(?:Ui|Project)\(\s*'([^']+)'/g;
    const violations: string[] = [];

    sourceFiles().forEach((path) => {
      const text = readFileSync(path, 'utf8');
      for (const match of text.matchAll(commitPattern)) {
        const contractId = match[1];
        if (!contractIds.has(contractId as never)) {
          violations.push(`${relative(ROOT, path)} -> ${contractId}`);
        }
      }
    });

    expect(violations).toEqual([]);
  });
});
