import timelineJson from '../catalog/timeline.default.json';
import type { Estimate, Rollout } from '../engine/types';
import { STANDARD_ITEMS } from '../engine/costs';

/** Immutable single-item update for id-keyed lists — shared by the input panels. */
export function patchById<T extends { id: string }>(
  arr: T[],
  id: string,
  patch: Partial<T>,
): T[] {
  return arr.map((x) => (x.id === id ? { ...x, ...patch } : x));
}

export function newEstimate(catalogVersion: string): Estimate {
  const timeline = structuredClone(timelineJson) as {
    horizonMonths: number;
    rollouts: Rollout[];
  };
  return {
    schemaVersion: 1,
    meta: {
      name: '',
      createdAt: new Date().toISOString(),
      catalogVersion,
    },
    horizonMonths: timeline.horizonMonths,
    rollouts: timeline.rollouts,
    team: {
      concurrentDevs: 4,
      functionalConsultants: 6,
      solutionArchitects: 2,
    },
    licenseSteps: [
      {
        fromMonth: 1,
        counts: {
          erpPremium: 0,
          erpFull: 100,
          cePremium: 0,
          ceEnterprise: 0,
          csProfessional: 0,
          attach: 0,
          activity: 0,
          teamMember: 0,
          device: 0,
        },
      },
    ],
    licenseCostMode: { kind: 'lumpSum', monthlyTotal: 0 },
    licenseStartMonth: 1,
    copilotAgents: [],
    copilotPacksOwned: 0,
    customerInsightsAddon: false,
    environments: [],
    disabledEnvIds: [],
    customItems: [
      {
        id: 'example-fabric',
        name: 'Fabric capacity (example — replace with your sizing)',
        category: 'payg-ms',
        monthlyAmount: 0,
        fromMonth: 1,
        toMonth: timeline.horizonMonths,
        sourceUrl: 'https://azure.microsoft.com/pricing/details/microsoft-fabric/',
        notes: 'Reserved capacity example. Set the monthly amount for your F-SKU.',
      },
    ],
    gridOverrides: [],
    standardItems: Object.fromEntries(
      STANDARD_ITEMS.map((d) => [d.id, { enabled: d.enabledByDefault }]),
    ),
    settings: {
      prodLeadMonths: 2,
    },
  };
}

/** Append a rollout cloned from the SbD template, starting after the last one. */
export function addRollout(estimate: Estimate): Estimate {
  const last = estimate.rollouts[estimate.rollouts.length - 1];
  const lastPrepare =
    last.phases.find((p) => p.kind === 'prepare') ?? last.phases[last.phases.length - 1];
  const start = lastPrepare.startMonth + lastPrepare.lengthMonths;
  const n = estimate.rollouts.length + 1;
  const id = `rollout-${n}`;
  const rollout: Rollout = {
    id,
    name: `Rollout ${n}`,
    phases: [
      { id: `${id}-implement`, kind: 'implement', name: 'Implement', startMonth: start, lengthMonths: 4 },
      { id: `${id}-prepare`, kind: 'prepare', name: 'Prepare', startMonth: start + 4, lengthMonths: 2 },
      { id: `${id}-operate`, kind: 'operate', name: 'Operate', startMonth: start + 6, lengthMonths: Math.max(1, estimate.horizonMonths - (start + 6) + 1) },
    ],
  };
  return { ...estimate, rollouts: [...estimate.rollouts, rollout] };
}
