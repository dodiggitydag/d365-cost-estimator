import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/model/config';
import { newEstimate } from '../../src/model/estimate';
import {
  billingGroups,
  buildSchedule,
  firstActiveMonth,
  growthGB,
  includedGB,
  neededGB,
} from '../../src/engine';
import { computeStorage } from '../../src/engine/storage';
import type { Estimate } from '../../src/engine/types';

// Expected values hand-computed from the source workbook's formulas
// (Worksheet rows 177–194 of D365 Environment Estimate 2025-12.xlsx).

const config = defaultConfig();

function estimateWith(counts: Record<string, number>): Estimate {
  const est = newEstimate(config);
  est.licenseSteps = [{ fromMonth: 1, counts }];
  return est;
}

describe('storage entitlements (workbook parity)', () => {

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

  it('production growth accrues per year, prorated monthly, on PROD only', () => {
    const est = estimateWith({ erpFull: 10 });
    est.settings.prodGrowthGBPerYear = { fscmData: 24 };
    const schedule = buildSchedule(est, config);
    // PROD starts at go-live (10) − prodLeadMonths (2) = month 8.
    expect(firstActiveMonth(schedule, 'PROD')).toBe(8);
    const prod = schedule.instances.find((i) => i.id === 'PROD')!;
    expect(growthGB(est, prod, config, 8, 'fscmData', 8)).toBe(0);
    expect(growthGB(est, prod, config, 14, 'fscmData', 8)).toBe(12); // 6 months
    expect(growthGB(est, prod, config, 20, 'fscmData', 8)).toBe(24); // 1 year
    // Pools without a growth figure, and non-PROD environments, do not grow.
    expect(growthGB(est, prod, config, 20, 'dvData', 8)).toBe(0);
    const uat = schedule.instances.find((i) => i.id === 'UAT')!;
    expect(growthGB(est, uat, config, 20, 'fscmData', 3)).toBe(0);
    // ...and it lands in the demand total, called out in the trace parts.
    // Month 20 is past go-live, so UAT mirrors PROD by then and carries the
    // same growth — the delta shows up twice (PROD + its mirror).
    const m20 = neededGB(est, schedule, config, 20, 'fscmData');
    const noGrowth = neededGB(
      { ...est, settings: { ...est.settings, prodGrowthGBPerYear: {} } },
      schedule,
      config,
      20,
      'fscmData',
    );
    expect(m20.total - noGrowth.total).toBeCloseTo(48, 6);
    expect(Object.keys(m20.parts).some((k) => k.includes('growth'))).toBe(true);
  });

  it('UAT mirrors PROD storage after go-live by default', () => {
    const est = estimateWith({ erpFull: 10 });
    est.settings.prodGrowthGBPerYear = { fscmData: 24 };
    const schedule = buildSchedule(est, config);
    // At go-live (month 10) UAT still uses its own default demand (61 GB).
    const m10 = neededGB(est, schedule, config, 10, 'fscmData');
    const atGoLive = Object.entries(m10.parts).find(([k]) => k.startsWith('UAT'))!;
    expect(atGoLive[0]).not.toContain('mirrors');
    expect(atGoLive[1]).toBe(61);
    // After go-live it tracks PROD: base 150 + (20−8)/12 × 24 = 174.
    const m20 = neededGB(est, schedule, config, 20, 'fscmData');
    const mirrored = Object.entries(m20.parts).find(([k]) => k.startsWith('UAT'))!;
    expect(mirrored[0]).toContain('mirrors Production');
    expect(mirrored[1]).toBeCloseTo(174, 6);
  });

  it('explicit mirrorProdStorage: false keeps the environment on its own storage', () => {
    const est = estimateWith({ erpFull: 10 });
    est.environments = [
      { id: 'UAT', typeId: 'UAT', name: 'UAT / Sandbox', fromRule: true, mirrorProdStorage: false },
    ];
    const schedule = buildSchedule(est, config);
    const m20 = neededGB(est, schedule, config, 20, 'fscmData');
    expect(m20.parts['UAT / Sandbox']).toBe(61);
  });

  it('any environment can opt in with mirrorProdStorage: true', () => {
    const est = estimateWith({ erpFull: 10 });
    est.environments = [
      { id: 'MIG', typeId: 'MIG', name: 'Data Migration', fromRule: true, mirrorProdStorage: true },
    ];
    const schedule = buildSchedule(est, config);
    // MIG runs through go-live + 1 (month 11), so its last month mirrors PROD.
    const m11 = neededGB(est, schedule, config, 11, 'fscmData');
    const mig = Object.entries(m11.parts).find(([k]) => k.startsWith('Data Migration'))!;
    expect(mig[0]).toContain('mirrors Production');
    expect(mig[1]).toBe(150);
  });

  it('mirroring falls back to own storage when no production-like instance exists', () => {
    const est = estimateWith({ erpFull: 10 });
    est.disabledEnvIds = ['PROD'];
    const schedule = buildSchedule(est, config);
    const m20 = neededGB(est, schedule, config, 20, 'fscmData');
    expect(m20.parts['UAT / Sandbox']).toBe(61);
  });

  it('growth with no figures set changes nothing', () => {
    const est = estimateWith({ erpFull: 10 });
    const schedule = buildSchedule(est, config);
    const { lines } = computeStorage(est, config, schedule);
    const est2 = estimateWith({ erpFull: 10 });
    est2.settings.prodGrowthGBPerYear = {};
    const bare = computeStorage(est2, config, buildSchedule(est2, config));
    expect(lines.map((l) => l.amount)).toEqual(bare.lines.map((l) => l.amount));
  });

  // One always-on environment with the given demand, rules switched off.
  function pinned(counts: Record<string, number>, gb: Record<string, number>) {
    const est = estimateWith(counts);
    est.environments = [
      { id: 'X', typeId: 'PROD', name: 'X', storageSteps: [{ fromMonth: 1, gb }] },
    ];
    est.gridOverrides = Array.from({ length: est.horizonMonths }, (_, i) => ({
      envInstanceId: 'X',
      month: i + 1,
      active: true,
    }));
    const bare = { ...config, rules: [] };
    const schedule = buildSchedule(est, bare);
    return { est, bare, ...computeStorage(est, bare, schedule) };
  }

  it('overage = MAX(needed − included, 0) × price', () => {
    // included data pool = fscmData (90 + 10×5) + dvData (30 + 10×0.25) = 172.5
    const { lines } = pinned({ erpFull: 10 }, { fscmData: 200 });
    const m1 = lines.find((l) => l.id === 'storage.data.m1');
    expect(m1?.amount).toBe((200 - 172.5) * 40); // $1,100
    expect(m1?.trace.formula).toContain(
      'MAX(200 GB needed (200 F&SCM data + 0 Dataverse data) − 172.5 GB included, 0)',
    );
  });

  it('F&SCM and Dataverse data are billed as one merged pool', () => {
    // included: fscmData 90 + 20×5 = 190, dvData 30 + 20×0.25 = 35 → 225 pooled
    const { lines, months } = pinned({ erpFull: 20 }, { fscmData: 211, dvData: 21 });
    const m1 = lines.find((l) => l.id === 'storage.data.m1')!;
    expect(m1.amount).toBe((232 - 225) * 40); // $280
    expect(m1.label).toBe('Data (F&SCM + Dataverse) storage overage');
    // Charged once for the bucket, not once per pool.
    expect(
      lines.filter((l) => l.month === 1 && l.id.startsWith('storage.')).map((l) => l.id),
    ).toEqual(['storage.data.m1']);
    // The trace shows both halves so it reconciles against a per-pool workbook.
    expect(m1.trace.inputs['needed GB']).toBe(232);
    expect(m1.trace.inputs['included GB']).toBe(225);
    expect(m1.trace.inputs['needed F&SCM data: X']).toBe(211);
    expect(m1.trace.inputs['needed Dataverse data: X']).toBe(21);

    const data = months.find((m) => m.month === 1 && m.groupId === 'data')!;
    expect(data.pools).toEqual(['fscmData', 'dvData']);
    expect(data.neededGB).toBe(232);
    expect(data.includedGB).toBe(225);
  });

  it('spare entitlement in one system absorbs a shortfall in the other', () => {
    // fscmData alone is 20 GB over its own 140 GB entitlement, but the pool has
    // 32.5 GB of unused Dataverse capacity, so nothing is billed.
    const { lines } = pinned({ erpFull: 10 }, { fscmData: 160 });
    expect(lines.find((l) => l.id.startsWith('storage.data'))).toBeUndefined();
    // Same in the other direction.
    const rev = pinned({ erpFull: 10 }, { dvData: 40 });
    expect(rev.lines.find((l) => l.id.startsWith('storage.data'))).toBeUndefined();
  });

  it('file pools merge the same way and log is tracked but never billed', () => {
    // included file pool = fscmFile (80 + 10×5) + dvFile (40 + 10×2) = 190
    const { lines, months } = pinned({ erpFull: 10 }, { fscmFile: 150, dvFile: 100 });
    const file = lines.find((l) => l.id === 'storage.file.m1')!;
    expect(file.amount).toBe((250 - 190) * 2); // $120
    const log = months.find((m) => m.month === 1 && m.groupId === 'log')!;
    expect(log.includedGB).toBe(2);
    expect(log.overageCost).toBe(0);
    expect(lines.find((l) => l.id.startsWith('storage.log'))).toBeUndefined();
  });

  it('a catalog without billingPools falls back to billing each pool alone', () => {
    const split = {
      ...config,
      rules: [],
      licenses: { ...config.licenses, billingPools: undefined },
    };
    expect(billingGroups(split).map((g) => g.id)).toEqual([
      'fscmData',
      'fscmFile',
      'dvData',
      'dvFile',
      'dvLog',
    ]);
    const est = estimateWith({ erpFull: 10 });
    est.environments = [
      { id: 'X', typeId: 'PROD', name: 'X', storageSteps: [{ fromMonth: 1, gb: { fscmData: 200 } }] },
    ];
    est.gridOverrides = Array.from({ length: est.horizonMonths }, (_, i) => ({
      envInstanceId: 'X',
      month: i + 1,
      active: true,
    }));
    const { lines } = computeStorage(est, split, buildSchedule(est, split));
    // Pre-merge behaviour: charged against fscmData's own 140 GB entitlement.
    expect(lines.find((l) => l.id === 'storage.fscmData.m1')?.amount).toBe((200 - 140) * 40);
  });
});
