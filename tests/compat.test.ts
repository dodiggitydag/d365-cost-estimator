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

const fixturesDir = join(__dirname, 'compat', 'fixtures');
const fixtures = readdirSync(fixturesDir).filter((f) => f.endsWith('.estimate.json'));

describe('estimate JSON backward compatibility', () => {
  it('has at least one frozen fixture per era', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(2);
  });

  it.each(fixtures)('%s parses through the real import path', (file) => {
    const text = readFileSync(join(fixturesDir, file), 'utf-8');
    const estimate = parseEstimateJson(text);
    expect(estimate.schemaVersion).toBe(1);
    // Fields added after an era began must land with usable defaults.
    expect(Array.isArray(estimate.disabledEnvIds)).toBe(true);
  });

  it.each(fixtures)('%s computes a full estimate without throwing', (file) => {
    const text = readFileSync(join(fixturesDir, file), 'utf-8');
    const estimate = parseEstimateJson(text);
    const result = computeEstimate(estimate, defaultConfig());
    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.schedule.instances.length).toBeGreaterThan(0);
  });

  it('a current export round-trips through export → import', () => {
    const estimate = newEstimate(defaultConfig().pricing.version);
    const exported = JSON.stringify(estimate, null, 2); // what downloadJson writes
    const reimported = parseEstimateJson(exported);
    expect(reimported).toEqual(estimate);
  });
});
