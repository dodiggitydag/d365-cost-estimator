import type { Estimate, EstimateResult, EstimatorConfig } from './types';
import { buildSchedule, goLiveMonth, scheduleWarnings } from './schedule';
import { computeStorage } from './storage';
import { computeCopilot } from './copilot';
import { computeLicensing } from './licensing';
import { computeCustomItems, computeEnvironmentCosts } from './costs';

export * from './types';
export * from './aggregate';
export { goLiveMonth, buildSchedule, scheduleWarnings } from './schedule';
export {
  includedGB,
  neededGB,
  licenseCountsAt,
  instanceStorageAt,
  growthGB,
  firstActiveMonth,
  billingGroups,
} from './storage';
export { subscriptionStartMonth } from './licensing';
export { money, cents, priceEntry, stepAt } from './catalogUtil';

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
    warnings: scheduleWarnings(estimate, config, schedule),
  };
}
