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
  ScheduleWarning,
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
  /** Window only applies to the first instance of the type (e.g. DEV01). */
  firstInstanceOnly: boolean;
}

/**
 * One rule resolved against one rollout. `dropped` means the window inverted or fell
 * outside the horizon, so it contributes no months — the schedule ignores it and
 * `scheduleWarnings` reports it. `undefined` means the rollout has no phase of the
 * anchor's kind, which is normal (the rule is simply silent for that rollout).
 */
function resolveWindow(
  rule: ScheduleRule,
  rollout: Rollout,
  horizon: number,
  settings: Estimate['settings'],
):
  | { from: number; to: number; rawFrom: number; rawTo: number; dropped: boolean }
  | undefined {
  const rawFrom = resolveAnchor(rule.from, rollout, horizon, settings);
  const rawTo = resolveAnchor(rule.to, rollout, horizon, settings);
  if (rawFrom === undefined || rawTo === undefined) return undefined;
  const from = Math.max(1, rawFrom);
  const to = Math.min(horizon, rawTo);
  return { from, to, rawFrom, rawTo, dropped: to < from };
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
      const w = resolveWindow(rule, rollout, horizon, settings);
      if (!w || w.dropped) continue;
      const list = byEnvType.get(rule.envTypeId) ?? [];
      list.push({
        ruleId: rule.id,
        rolloutId: rollout.id,
        from: w.from,
        to: w.to,
        firstInstanceOnly: rule.appliesTo === 'firstInstance',
      });
      byEnvType.set(rule.envTypeId, list);
    }
  }
  return byEnvType;
}

/**
 * Problems that make the schedule quietly wrong rather than loudly broken. All three
 * have the same symptom — an environment row with no months and no cost — and none of
 * them raise an error anywhere else, so this is the only place they surface.
 */
export function scheduleWarnings(
  estimate: Estimate,
  config: EstimatorConfig,
  schedule: ScheduleMatrix,
): ScheduleWarning[] {
  const warnings: ScheduleWarning[] = [];
  const horizon = estimate.horizonMonths;
  const label = (id: string) =>
    config.environments.find((e) => e.id === id)?.label ?? id;

  // 1. A rule whose end resolves before its start (usually phases ordered so that
  //    Prepare ends before Implement begins) contributes nothing at all.
  for (const rule of config.rules) {
    for (const rollout of estimate.rollouts) {
      const w = resolveWindow(rule, rollout, horizon, estimate.settings);
      if (!w || !w.dropped) continue;
      const why =
        w.rawFrom > horizon
          ? `starts at month ${w.rawFrom}, past the ${horizon}-month horizon`
          : `runs month ${w.rawFrom} → ${w.rawTo}, so it ends before it starts`;
      warnings.push({
        kind: 'inverted-window',
        rolloutId: rollout.id,
        ruleId: rule.id,
        envTypeId: rule.envTypeId,
        message: `${rollout.name}: rule “${rule.id}” for ${label(rule.envTypeId)} ${why} — it was ignored. Check the phase order and lengths in this rollout.`,
      });
    }
  }

  // 2. Rules anchor to the FIRST phase of a kind, so a duplicate kind is invisible.
  for (const rollout of estimate.rollouts) {
    const byKind = new Map<string, string[]>();
    for (const phase of rollout.phases) {
      byKind.set(phase.kind, [...(byKind.get(phase.kind) ?? []), phase.name]);
    }
    for (const [kind, names] of byKind) {
      if (names.length < 2) continue;
      warnings.push({
        kind: 'duplicate-phase-kind',
        rolloutId: rollout.id,
        message: `${rollout.name} has ${names.length} “${kind}” phases (${names.join(', ')}). Rules anchor to the first one only, so the others do not schedule anything — use a separate rollout for a second build.`,
      });
    }
  }

  // 3. The visible symptom: a ruled environment that ended up with no months. Types
  //    with no rules at all (PERF, BUILD) are legitimately empty until painted.
  for (const inst of schedule.instances) {
    if (!config.rules.some((r) => r.envTypeId === inst.typeId)) continue;
    if (schedule.cells[inst.id]?.some((c) => c.active)) continue;
    warnings.push({
      kind: 'empty-environment',
      envTypeId: inst.typeId,
      envInstanceId: inst.id,
      message: `${inst.name} has no active months, so it costs nothing. Its rules produced no window — fix the phase order above, or paint months in the grid.`,
    });
  }

  return warnings;
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
  const seenOfType = new Map<string, number>();
  for (const inst of instances) {
    const ordinal = (seenOfType.get(inst.typeId) ?? 0) + 1;
    seenOfType.set(inst.typeId, ordinal);
    const row: ScheduleCell[] = Array.from({ length: horizon }, () => ({
      active: false,
      ruleIds: [],
      rolloutIds: [],
      overridden: false,
    }));
    for (const w of windows.get(inst.typeId) ?? []) {
      if (w.firstInstanceOnly && ordinal > 1) continue;
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
