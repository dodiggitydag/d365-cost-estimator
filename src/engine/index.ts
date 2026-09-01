import type { Estimate, EstimateResult, EstimatorConfig } from './types';
import { buildSchedule, goLiveMonth, scheduleWarnings } from './schedule';
import { computeStorage } from './storage';
import { computeCopilot } from './copilot';
import { computeCommerce } from './commerce';
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
  mirrorsProdStorage,
  mirrorSourceFor,
} from './storage';
export { subscriptionStartMonth } from './licensing';
export { money, cents, priceEntry, stepAt } from './catalogUtil';
export { commerceBand, computeCommerce, selectCommerceTier } from './commerce';
export type { CommerceTierChoice } from './commerce';

export function computeEstimate(
  estimate: Estimate,
  config: EstimatorConfig,
): EstimateResult {
  const schedule = buildSchedule(estimate, config);
  const storage = computeStorage(estimate, config, schedule);
  const copilot = computeCopilot(estimate, config);
  const commerce = computeCommerce(estimate, config);
  const lines = [
    ...computeLicensing(estimate, config),
    ...storage.lines,
    ...copilot.lines,
    ...commerce.lines,
    ...computeEnvironmentCosts(estimate, config, schedule),
    ...computeCustomItems(estimate),
  ];
  return {
    schedule,
    lines,
    storage: storage.months,
    copilot: copilot.months,
    commerce: commerce.months,
    goLiveMonths: estimate.rollouts.map((r) => ({
      rolloutId: r.id,
      month: goLiveMonth(r),
    })),
    warnings: scheduleWarnings(estimate, config, schedule),
  };
}
