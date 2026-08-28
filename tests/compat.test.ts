import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defaultConfig } from '../src/model/config';
import { newEstimate } from '../src/model/estimate';
import { parseEstimateJson } from '../src/model/persistence';
import { computeEstimate } from '../src/engine';

// BACKWARD-COMPATIBILITY GATE — every .estimate.json a user has ever exported must
// keep opening in every future version of the tool (see CLAUDE.md).
//
// tests/compat/fixtures/ holds one frozen export per schema era. Fixtures are
// APPEND-ONLY: never edit or delete one to make this suite pass. If a schema change
// breaks a fixture, the change is wrong — make the new field optional with a default,
// or bump schemaVersion and add a migration so old files still parse.
// When the estimate shape gains a field, ALSO freeze a new feature-complete fixture
// for the new era here.

const config = defaultConfig();
const fixturesDir = join(__dirname, 'compat', 'fixtures');
const fixtures = readdirSync(fixturesDir).filter((f) => f.endsWith('.estimate.json'));

describe('estimate JSON backward compatibility', () => {
  it('has at least one frozen fixture per era', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(2);
  });

  it.each(fixtures)('%s parses through the real import path', (file) => {
    const text = readFileSync(join(fixturesDir, file), 'utf-8');
    const estimate = parseEstimateJson(text, config);
    expect(estimate.schemaVersion).toBe(1);
    // Fields added after an era began must land with usable defaults.
    expect(Array.isArray(estimate.disabledEnvIds)).toBe(true);
    expect(typeof estimate.settings.prodGrowthGBPerYear).toBe('object');
  });

  it.each(fixtures)('%s computes a full estimate without throwing', (file) => {
    const text = readFileSync(join(fixturesDir, file), 'utf-8');
    const estimate = parseEstimateJson(text, config);
    const result = computeEstimate(estimate, config);
    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.schedule.instances.length).toBeGreaterThan(0);
  });

  it('retired built-in items convert into custom items, keeping their cost', () => {
    // The 2026-08 fixtures predate the switch to editable rows: they carry a
    // standardItems map with every item enabled.
    const text = readFileSync(join(fixturesDir, '2026-08-full.estimate.json'), 'utf-8');
    const raw = JSON.parse(text) as { standardItems: Record<string, unknown>; team: Record<string, number> };
    expect(Object.keys(raw.standardItems).length).toBe(5);

    const estimate = parseEstimateJson(text, config);
    expect(estimate.standardItems).toBeUndefined();
    const byId = new Map(estimate.customItems.map((i) => [i.id, i]));
    const seats = raw.team.functionalConsultants + raw.team.solutionArchitects; // 8 + 2
    expect(byId.get('ado-basic')?.monthlyAmount).toBe(seats * 6);
    expect(byId.get('ado-test-plans')?.monthlyAmount).toBe(seats * 52);
    expect(byId.get('ado-artifacts')?.monthlyAmount).toBe(10);
    expect(byId.get('azure-integration')?.monthlyAmount).toBe(50);
    // The retired pipelines item was one $120 line covering three parallel jobs.
    expect(byId.get('ado-agents')?.monthlyAmount).toBe(120);
    // Per-item window overrides in the old file survive.
    expect(byId.get('ado-test-plans')?.fromMonth).toBe(3);
    expect(byId.get('ado-test-plans')?.toMonth).toBe(17);
    // Converting twice must not duplicate the rows.
    const twice = parseEstimateJson(JSON.stringify(estimate), config);
    expect(twice.customItems.length).toBe(estimate.customItems.length);
  });

  it('a fixture with no built-in items is left alone', () => {
    const text = readFileSync(join(fixturesDir, '2026-08-prod-growth.estimate.json'), 'utf-8');
    const before = JSON.parse(text) as { customItems: unknown[] };
    const estimate = parseEstimateJson(text, config);
    // That fixture enables only azdoBasic/TestPlans/Pipelines/Artifacts/Integration,
    // so it does convert — assert the originals are all still present and first.
    expect(estimate.customItems.slice(0, before.customItems.length).map((i) => i.id)).toEqual(
      (before.customItems as { id: string }[]).map((i) => i.id),
    );
  });

  it('mirrorProdStorage flags survive the import path', () => {
    const text = readFileSync(join(fixturesDir, '2026-08-uat-mirror.estimate.json'), 'utf-8');
    const estimate = parseEstimateJson(text, config);
    const byId = new Map(estimate.environments.map((e) => [e.id, e]));
    expect(byId.get('GOLD')?.mirrorProdStorage).toBe(true);
    expect(byId.get('MIG')?.mirrorProdStorage).toBe(false);
    // Absent means "use the environment type's default" — must stay absent.
    expect(byId.get('UAT')?.mirrorProdStorage).toBeUndefined();
  });

  it('a current export round-trips through export → import', () => {
    const estimate = newEstimate(config);
    const exported = JSON.stringify(estimate, null, 2); // what downloadJson writes
    const reimported = parseEstimateJson(exported, config);
    expect(reimported).toEqual(estimate);
  });
});
