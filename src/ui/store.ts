import { create } from 'zustand';
import type { Estimate } from '../engine/types';
import { computeEstimate } from '../engine';
import type { EstimateResult, EstimatorConfig } from '../engine/types';
import { defaultConfig, effectiveConfig, type ConfigOverrides } from '../model/config';
import { newEstimate } from '../model/estimate';
import {
  loadSavedEstimate,
  loadSavedOverrides,
  saveEstimate,
  saveOverrides,
} from '../model/persistence';

export interface ExplainTarget {
  kind: 'month' | 'cell' | 'env' | 'category';
  month?: number;
  category?: string;
  envInstanceId?: string | null;
  title: string;
}

interface Store {
  estimate: Estimate;
  overrides: ConfigOverrides | null;
  config: EstimatorConfig;
  result: EstimateResult;
  explain: ExplainTarget | null;
  view: 'schedule' | 'dashboard' | 'settings';
  setView: (v: Store['view']) => void;
  update: (fn: (e: Estimate) => Estimate) => void;
  replaceEstimate: (e: Estimate) => void;
  setOverrides: (o: ConfigOverrides | null) => void;
  setExplain: (t: ExplainTarget | null) => void;
  reset: () => void;
}

function recompute(estimate: Estimate, overrides: ConfigOverrides | null) {
  const config = effectiveConfig(overrides);
  return { config, result: computeEstimate(estimate, config) };
}

const initialOverrides = loadSavedOverrides();
const initialEstimate =
  loadSavedEstimate() ?? newEstimate(defaultConfig().pricing.version);

export const useStore = create<Store>((set, get) => ({
  estimate: initialEstimate,
  overrides: initialOverrides,
  ...recompute(initialEstimate, initialOverrides),
  explain: null,
  view: 'schedule',
  setView: (view) => set({ view }),
  update: (fn) => {
    const estimate = fn(get().estimate);
    saveEstimate(estimate);
    set({ estimate, ...recompute(estimate, get().overrides) });
  },
  replaceEstimate: (estimate) => {
    saveEstimate(estimate);
    set({ estimate, ...recompute(estimate, get().overrides) });
  },
  setOverrides: (overrides) => {
    saveOverrides(overrides);
    set({ overrides, ...recompute(get().estimate, overrides) });
  },
  setExplain: (explain) => set({ explain }),
  reset: () => {
    const estimate = newEstimate(defaultConfig().pricing.version);
    saveEstimate(estimate);
    set({ estimate, ...recompute(estimate, get().overrides), explain: null });
  },
}));
