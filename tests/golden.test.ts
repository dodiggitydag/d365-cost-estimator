import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultConfig } from '../src/model/config';
import { newEstimate } from '../src/model/estimate';
import { includedGB } from '../src/engine';
import type { StoragePool } from '../src/engine/types';

// Parity against the private source workbook. The fixture is produced locally by
// tests/golden/extract_fixtures.py (see its docstring) and is gitignored — this
// suite is skipped when the fixture is absent (e.g. for community contributors).

const fixturePath = join(__dirname, 'golden', 'fixtures', 'local', 'workbook.json');
const hasFixture = existsSync(fixturePath);

interface Fixture {
  licenseCounts: Record<string, (number | null)[]>;
  includedStorage: Record<string, number[]>;
  neededStorage: Record<string, (number | null)[]>;
  storageCost: Record<string, (number | null)[]>;
  overagePrices: Record<string, number>;
}

describe.skipIf(!hasFixture)('golden parity with source workbook', () => {
  const fixture: Fixture = hasFixture
    ? JSON.parse(readFileSync(fixturePath, 'utf-8'))
    : (undefined as never);
  const config = defaultConfig();
  const pools: StoragePool[] = ['fscmData', 'fscmFile', 'dvData', 'dvFile'];

  function estimateForMonth(m: number) {
    const est = newEstimate('golden');
    est.horizonMonths = 60;
    const counts: Record<string, number> = {};
    for (const [id, arr] of Object.entries(fixture.licenseCounts)) {
      counts[id] = arr[m - 1] ?? 0;
    }
    est.licenseSteps = [{ fromMonth: 1, counts }];
    return est;
  }

  it('included storage entitlement matches the workbook for every month', () => {
    for (let m = 1; m <= 60; m++) {
      const est = estimateForMonth(m);
      for (const pool of pools) {
        const expected = fixture.includedStorage[pool][m - 1];
        const actual = includedGB(est, config, 1, pool).total;
        expect(actual, `month ${m} ${pool}`).toBeCloseTo(expected, 2);
      }
    }
  });

  it('storage overage cost = MAX(needed − included, 0) × price for every month', () => {
    for (let m = 1; m <= 60; m++) {
      for (const pool of pools) {
        const needed = fixture.neededStorage[pool][m - 1] ?? 0;
        const included = fixture.includedStorage[pool][m - 1];
        const price = fixture.overagePrices[pool];
        const expected = fixture.storageCost[pool][m - 1] ?? 0;
        const actual = Math.max(needed - included, 0) * price;
        expect(actual, `month ${m} ${pool}`).toBeCloseTo(expected, 2);
      }
    }
  });
});
