import type {
  Anchor,
  AnchorOffset,
  EnvInstance,
  Estimate,
  EstimatorConfig,
  Rollout,
  ScheduleCell,
  ScheduleMatrix,
  ScheduleRule,
} from './types';

/** Go-live month of a rollout: explicit override, else end of the Prepare phase,
 *  else end of the last phase. */
export function goLiveMonth(rollout: Rollout): number {
  if (rollout.goLiveMonthOverride) return rollout.goLiveMonthOverride;
  const prepare = rollout.phases.find((p) => p.kind === 'prepare');
  const last = rollout.phases[rollout.phases.length - 1];
  const phase = prepare ?? last;
  if (!phase) return 1;
  return phase.startMonth + phase.lengthMonths - 1;
}

function resolveOffset(
  offset: AnchorOffset | undefined,
  settings: Estimate['settings'],
): number {
  if (offset === undefined) return 0;
  if (typeof offset === 'number') return offset;
  const value = settings[offset.setting];
  return offset.negate ? -value : value;
}

function resolveAnchor(
  anchor: Anchor,
  rollout: Rollout,
  horizon: number,
  settings: Estimate['settings'],
): number | undefined {
  const offset = resolveOffset(anchor.offsetMonths, settings);
  if ('event' in anchor) {
    switch (anchor.event) {
      case 'projectStart':
        return 1 + offset;
      case 'horizonEnd':
        return horizon + offset;
      case 'goLive':
        return goLiveMonth(rollout) + offset;
    }
  }
  const phase = rollout.phases.find((p) => p.kind === anchor.phaseKind);
  if (!phase) return undefined; // rollout has no such phase → rule silent for it
  const base =
    anchor.edge === 'start' ? phase.startMonth : phase.startMonth + phase.lengthMonths - 1;
  return base + offset;
}

export interface RuleWindow {
  ruleId: string;
  rolloutId: string;
  from: number;
  to: number;
}

/** Every rule is evaluated once per rollout; a rule whose phase anchor is missing
 *  in a rollout is skipped for that rollout. Active months are the union. */
export function ruleWindows(
  rules: ScheduleRule[],
  rollouts: Rollout[],
  horizon: number,
  settings: Estimate['settings'],
): Map<string, RuleWindow[]> {
  const byEnvType = new Map<string, RuleWindow[]>();
  for (const rule of rules) {
    for (const rollout of rollouts) {
      const from = resolveAnchor(rule.from, rollout, horizon, settings);
      const to = resolveAnchor(rule.to, rollout, horizon, settings);
      if (from === undefined || to === undefined) continue;
      const clampedFrom = Math.max(1, from);
      const clampedTo = Math.min(horizon, to);
      if (clampedTo < clampedFrom) continue;
      const list = byEnvType.get(rule.envTypeId) ?? [];
      list.push({ ruleId: rule.id, rolloutId: rollout.id, from: clampedFrom, to: clampedTo });
      byEnvType.set(rule.envTypeId, list);
    }
  }
  return byEnvType;
}

export function resolveRuleCount(
  rule: ScheduleRule,
  estimate: Estimate,
): number {
  if (rule.count === undefined) return 1;
  if (typeof rule.count === 'number') return rule.count;
  return estimate.team[rule.count.input];
}

/**
 * Derive the environment instance list: instances the rules require (e.g. one DEV
 * per concurrent developer) merged with instances the user added manually.
 * User-added instances (fromRule !== true) are always kept.
 */
export function deriveInstances(
  estimate: Estimate,
  config: EstimatorConfig,
): EnvInstance[] {
  const instances: EnvInstance[] = [];

  for (const envType of config.environments) {
    const envRules = config.rules.filter((r) => r.envTypeId === envType.id);
    if (envRules.length === 0) continue;
    const count = envType.allowMultiple
      ? Math.max(...envRules.map((r) => resolveRuleCount(r, estimate)))
      : 1;
    if (count <= 0) continue;
    for (let i = 1; i <= count; i++) {
      const id = envType.allowMultiple
        ? `${envType.id}${String(i).padStart(2, '0')}`
        : envType.id;
      const name = envType.allowMultiple ? `${envType.label} ${i}` : envType.label;
      // Preserve user customizations (storage steps, name) on regenerated instances.
      const existing = estimate.environments.find((e) => e.id === id);
      instances.push(
        existing ?? { id, typeId: envType.id, name, fromRule: true },
      );
    }
  }

  // User-added instances of types without rules, or extras beyond the rule count.
  for (const inst of estimate.environments) {
    if (!inst.fromRule && !instances.some((i) => i.id === inst.id)) {
      instances.push(inst);
    }
  }
  // Instances the user removed (any environment can be dropped from the plan).
  const disabled = new Set(estimate.disabledEnvIds);
  return instances.filter((i) => !disabled.has(i.id));
}

export function buildSchedule(
  estimate: Estimate,
  config: EstimatorConfig,
): ScheduleMatrix {
  const horizon = estimate.horizonMonths;
  const windows = ruleWindows(config.rules, estimate.rollouts, horizon, estimate.settings);
  const instances = deriveInstances(estimate, config);

  const cells: Record<string, ScheduleCell[]> = {};
  for (const inst of instances) {
    const row: ScheduleCell[] = Array.from({ length: horizon }, () => ({
      active: false,
      ruleIds: [],
      rolloutIds: [],
      overridden: false,
    }));
    for (const w of windows.get(inst.typeId) ?? []) {
      for (let m = w.from; m <= w.to; m++) {
        const cell = row[m - 1];
        cell.active = true;
        if (!cell.ruleIds.includes(w.ruleId)) cell.ruleIds.push(w.ruleId);
        if (!cell.rolloutIds.includes(w.rolloutId)) cell.rolloutIds.push(w.rolloutId);
      }
    }
    cells[inst.id] = row;
  }

  // Sparse user overrides win over rules and are flagged.
  for (const ov of estimate.gridOverrides) {
    const row = cells[ov.envInstanceId];
    if (!row || ov.month < 1 || ov.month > horizon) continue;
    const cell = row[ov.month - 1];
    cell.active = ov.active;
    cell.overridden = true;
  }

  return { months: horizon, instances, cells };
}
