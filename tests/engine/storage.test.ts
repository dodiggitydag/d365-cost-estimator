import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/model/config';
import { newEstimate } from '../../src/model/estimate';
import { buildSchedule, includedGB } from '../../src/engine';
import { computeStorage } from '../../src/engine/storage';
import type { Estimate } from '../../src/engine/types';

// Expected values hand-computed from the source workbook's formulas
// (Worksheet rows 177–194 of D365 Environment Estimate 2025-12.xlsx).

function estimateWith(counts: Record<string, number>): Estimate {
  const est = newEstimate('test');
  est.licenseSteps = [{ fromMonth: 1, counts }];
  return est;
}

describe('storage entitlements (workbook parity)', () => {
  const config = defaultConfig();

  it('ERP full users only: tenant base 90 + 5/user F&SCM data', () => {
    // Workbook month 1: H6 = 91+90 = 181 full users
    const est = estimateWith({ erpFull: 181 });
    expect(includedGB(est, config, 1, 'fscmData').total).toBe(90 + 181 * 5); // 995
    expect(includedGB(est, config, 1, 'fscmFile').total).toBe(80 + 181 * 5); // 985
    expect(includedGB(est, config, 1, 'dvData').total).toBe(30 + 181 * 0.25);
    expect(includedGB(est, config, 1, 'dvFile').total).toBe(40 + 181 * 2);
    expect(includedGB(est, config, 1, 'dvLog').total).toBe(2);
  });

  it('any Premium user flips the tenant base to 125/110/…/3', () => {
    const est = estimateWith({ erpPremium: 10, erpFull: 100, activity: 50, device: 20 });
    // fscmData: 125 + 10*10 + 100*5 + 50*1 + 20*2 = 815
    expect(includedGB(est, config, 1, 'fscmData').total).toBe(815);
    // fscmFile: 110 + 10*10 + 100*5 + 50*2 + 20*3 = 870
    expect(includedGB(est, config, 1, 'fscmFile').total).toBe(870);
    // dvData: 30 + 10*0.5 + 100*0.25 + 50*0.064 + 20*0.102 = 65.24
    expect(includedGB(est, config, 1, 'dvData').total).toBeCloseTo(65.24, 6);
    // dvFile: 40 + 10*3 + 100*2 + 50*0.512 + 20*0.819 = 311.98
    expect(includedGB(est, config, 1, 'dvFile').total).toBeCloseTo(311.98, 6);
    expect(includedGB(est, config, 1, 'dvLog').total).toBe(3);
  });

  it('attach and team member add no storage', () => {
    const est = estimateWith({ erpFull: 10, attach: 500, teamMember: 500 });
    expect(includedGB(est, config, 1, 'fscmData').total).toBe(90 + 50);
  });

  it('license steps change entitlement over time', () => {
    const est = estimateWith({ erpFull: 181 });
    est.licenseSteps.push({ fromMonth: 6, counts: { erpFull: 631 } });
    expect(includedGB(est, config, 5, 'fscmData').total).toBe(90 + 181 * 5);
    expect(includedGB(est, config, 6, 'fscmData').total).toBe(90 + 631 * 5);
  });

  it('overage = MAX(needed − included, 0) × price', () => {
    const est = estimateWith({ erpFull: 10 }); // included fscmData = 90 + 50 = 140
    // Single always-on environment demanding 200 GB data
    est.environments = [
      {
        id: 'X',
        typeId: 'PROD',
        name: 'X',
        storageSteps: [{ fromMonth: 1, gb: { fscmData: 200 } }],
      },
    ];
    est.gridOverrides = Array.from({ length: est.horizonMonths }, (_, i) => ({
      envInstanceId: 'X',
      month: i + 1,
      active: true,
    }));
    est.ruleOverrides = []; // no rules → only the manual instance/overrides
    const schedule = buildSchedule(est, config);
    const { lines } = computeStorage(est, config, schedule);
    const m1 = lines.find((l) => l.id === 'storage.fscmData.m1');
    expect(m1?.amount).toBe((200 - 140) * 40); // $2,400
    expect(m1?.trace.formula).toContain('MAX(200 GB needed − 140 GB included, 0)');
    // no dvData overage (no demand)
    expect(lines.find((l) => l.id === 'storage.dvData.m1')).toBeUndefined();
  });
});
