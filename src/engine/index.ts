import type { Estimate, EstimateResult, EstimatorConfig } from './types';
import { buildSchedule, goLiveMonth } from './schedule';
import { computeStorage } from './storage';
import { computeCopilot } from './copilot';
import { computeLicensing } from './licensing';
import {
  computeCustomItems,
  computeEnvironmentCosts,
  computeStandardItems,
} from './costs';

export * from './types';
export * from './aggregate';
export { goLiveMonth, buildSchedule } from './schedule';
export { includedGB, neededGB, licenseCountsAt } from './storage';
export { STANDARD_ITEMS } from './costs';
export { money, cents, priceEntry } from './catalogUtil';

export function computeEstimate(
  estimate: Estimate,
  config: EstimatorConfig,
): EstimateResult {
  const schedule = buildSchedule(estimate, config);
  const storage = computeStorage(estimate, config, schedule);
  const copilot = computeCopilot(estimate, config);
  const lines = [
    ...computeLicensing(estimate, config),
    ...storage.lines,
    ...copilot.lines,
    ...computeEnvironmentCosts(estimate, config, schedule),
    ...computeStandardItems(estimate, config),
    ...computeCustomItems(estimate),
  ];
  return {
    schedule,
    lines,
    storage: storage.months,
    copilot: copilot.months,
    goLiveMonths: estimate.rollouts.map((r) => ({
      rolloutId: r.id,
      month: goLiveMonth(r),
    })),
  };
}
