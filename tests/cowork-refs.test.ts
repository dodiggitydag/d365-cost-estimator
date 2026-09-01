import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultConfig } from '../src/model/config';
import { newEstimate } from '../src/model/estimate';
import { parseEstimateJson } from '../src/model/persistence';
import { computeEstimate } from '../src/engine';

// The Cowork skill's reference JSONs are what the skill emits, so they must parse
// through the real import path (cowork/README.md sync table).
const config = defaultConfig();
const refDir = join(__dirname, '..', 'cowork', 'skills', 'd365-cost-estimate', 'references');
const files = ['template.estimate.json', 'example.estimate.json'];

describe('cowork skill reference estimates', () => {
  it.each(files)('%s parses and computes', (file) => {
    const est = parseEstimateJson(readFileSync(join(refDir, file), 'utf-8'), config);
    const result = computeEstimate(est, config);
    expect(result.schedule.instances.length).toBeGreaterThan(0);
  });

  it('template mirrors newEstimate() on the fields the skill sets', () => {
    const tpl = parseEstimateJson(
      readFileSync(join(refDir, 'template.estimate.json'), 'utf-8'),
      config,
    );
    const fresh = newEstimate(config);
    expect(tpl.team).toEqual(fresh.team);
    expect(tpl.settings).toEqual(fresh.settings);
    expect(tpl.horizonMonths).toBe(fresh.horizonMonths);
    expect(tpl.copilotAgents.map((a) => a.id)).toEqual(fresh.copilotAgents.map((a) => a.id));
    expect(tpl.customItems).toEqual(fresh.customItems);
    expect(tpl.commerceSteps).toEqual(fresh.commerceSteps);
    expect(tpl.commerceScaleUnits).toEqual(fresh.commerceScaleUnits);
    expect(tpl.commerceRatingsReviews).toBe(fresh.commerceRatingsReviews);
  });
});
