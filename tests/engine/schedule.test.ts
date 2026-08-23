import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/model/config';
import { addRollout, newEstimate } from '../../src/model/estimate';
import { buildSchedule, goLiveMonth } from '../../src/engine';

function activeMonths(cells: { active: boolean }[]): number[] {
  return cells.flatMap((c, i) => (c.active ? [i + 1] : []));
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

describe('schedule rules (default SbD timeline: Initiate 1–2, Implement 3–8, Prepare 9–10)', () => {
  const config = defaultConfig();

  it('go-live defaults to the end of Prepare', () => {
    const est = newEstimate('test');
    expect(goLiveMonth(est.rollouts[0])).toBe(10);
  });

  it('derives environment windows from the methodology rules', () => {
    const est = newEstimate('test');
    est.team.concurrentDevs = 3;
    const s = buildSchedule(est, config);

    const ids = s.instances.map((i) => i.id);
    expect(ids).toContain('PROD');
    expect(ids).toContain('DEV01');
    expect(ids).toContain('DEV03');
    expect(ids).not.toContain('DEV04');
    expect(ids).not.toContain('PERF'); // no default rule — add-on only

    expect(activeMonths(s.cells['PROD'])).toEqual(range(8, 36)); // goLive−2 → horizon
    expect(activeMonths(s.cells['SUP'])).toEqual(range(10, 36)); // goLive → horizon
    expect(activeMonths(s.cells['DEV01'])).toEqual(range(3, 36)); // lead dev box: kept for ISV support
    expect(activeMonths(s.cells['DEV02'])).toEqual(range(3, 10)); // Implement start → Prepare end
    expect(activeMonths(s.cells['MIG'])).toEqual(range(2, 11)); // Implement start−1 → goLive+1
    expect(activeMonths(s.cells['DEMO'])).toEqual(range(1, 10)); // start → go-live
    expect(activeMonths(s.cells['UAT'])).toEqual(range(3, 36));
    expect(activeMonths(s.cells['TRAIN'])).toEqual(range(9, 11)); // Prepare start → goLive+1
  });

  it('the lead DEV rule applies to DEV01 only, and no DEVs exist with zero developers', () => {
    const est = newEstimate('test');
    est.team.concurrentDevs = 2;
    const s = buildSchedule(est, config);
    expect(s.cells['DEV01'][20].ruleIds).toContain('dev-lead-forever');
    expect(activeMonths(s.cells['DEV02'])).toEqual(range(3, 10));

    est.team.concurrentDevs = 0;
    const none = buildSchedule(est, config);
    expect(none.instances.some((i) => i.typeId === 'DEV')).toBe(false);
  });

  it('prodLeadMonths setting moves the PROD start', () => {
    const est = newEstimate('test');
    est.settings.prodLeadMonths = 4;
    const s = buildSchedule(est, config);
    expect(activeMonths(s.cells['PROD'])).toEqual(range(6, 36));
  });

  it('grid overrides win over rules and are flagged', () => {
    const est = newEstimate('test');
    est.gridOverrides = [
      { envInstanceId: 'TRAIN', month: 9, active: false }, // turn off a rule month
      { envInstanceId: 'TRAIN', month: 20, active: true }, // add an extra month
    ];
    const s = buildSchedule(est, config);
    expect(activeMonths(s.cells['TRAIN'])).toEqual([10, 11, 20]);
    expect(s.cells['TRAIN'][8].overridden).toBe(true);
    expect(s.cells['TRAIN'][19].overridden).toBe(true);
    expect(s.cells['TRAIN'][9].overridden).toBe(false);
  });

  it('cells carry the rule ids that scheduled them', () => {
    const est = newEstimate('test');
    const s = buildSchedule(est, config);
    expect(s.cells['PROD'][9].ruleIds).toContain('prod-lead');
  });

  it('multi-rollout: per-rollout windows re-fire; long-lived envs extend', () => {
    let est = newEstimate('test');
    est = addRollout(est);
    // Rollout 2: Implement 11–14, Prepare 15–16 → goLive 16
    expect(goLiveMonth(est.rollouts[1])).toBe(16);
    const s = buildSchedule(est, config);
    // TRAIN re-fires: 9–11 (R1) and 15–17 (R2)
    expect(activeMonths(s.cells['TRAIN'])).toEqual([...range(9, 11), ...range(15, 17)]);
    // MIG: 2–11 (R1) ∪ 10–17 (R2) = 2–17
    expect(activeMonths(s.cells['MIG'])).toEqual(range(2, 17));
    // PROD starts at FIRST goLive − 2 and never turns off
    expect(activeMonths(s.cells['PROD'])).toEqual(range(8, 36));
    // DEMO stays until the LAST go-live
    expect(activeMonths(s.cells['DEMO'])).toEqual(range(1, 16));
    // Lead DEV runs to the horizon; other DEVs cover both builds: 3–10 ∪ 11–16
    expect(activeMonths(s.cells['DEV01'])).toEqual(range(3, 36));
    expect(activeMonths(s.cells['DEV02'])).toEqual(range(3, 16));
  });

  it('user-added instances survive; rule instances regenerate with dev count', () => {
    const est = newEstimate('test');
    est.team.concurrentDevs = 2;
    est.environments = [
      { id: 'TRAIN2', typeId: 'TRAIN', name: 'Training 2 (manual)' },
    ];
    const s = buildSchedule(est, config);
    expect(s.instances.some((i) => i.id === 'TRAIN2')).toBe(true);
    expect(s.instances.filter((i) => i.typeId === 'DEV')).toHaveLength(2);
    // A manual instance of a ruled type inherits the type's rule windows
    // (same schedule as TRAIN: Prepare start → goLive+1); cells can be overridden off.
    expect(activeMonths(s.cells['TRAIN2'])).toEqual(range(9, 11));
  });
});
