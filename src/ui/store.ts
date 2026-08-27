import { create } from 'zustand';
import type { Estimate } from '../engine/types';
import { computeEstimate } from '../engine';
import type { EstimateResult, EstimatorConfig } from '../engine/types';
import { effectiveConfig, type ConfigOverrides } from '../model/config';
import { newEstimate } from '../model/estimate';
import {
  loadSavedEstimate,
  loadSavedOverrides,
  saveEstimate,
  saveOverrides,
} from '../model/persistence';

export interface ExplainTarget {
  kind: 'month' | 'cell' | 'category';
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
  update: (fn: (e: Estimate) => Estimate) => void;
  setOverrides: (o: ConfigOverrides | null) => void;
  setExplain: (t: ExplainTarget | null) => void;
  reset: () => void;
}

// Autosave is debounced: a synchronous JSON.stringify + localStorage write per
// keystroke or drag-paint mousemove is the main source of input lag.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSave(estimate: Estimate): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveEstimate(estimate), 300);
}

const initialOverrides = loadSavedOverrides();
const initialConfig = effectiveConfig(initialOverrides);
const initialEstimate =
  loadSavedEstimate(initialConfig) ?? newEstimate(initialConfig);

export const useStore = create<Store>((set, get) => ({
  estimate: initialEstimate,
  overrides: initialOverrides,
  config: initialConfig,
  result: computeEstimate(initialEstimate, initialConfig),
  explain: null,
  update: (fn) => {
    const estimate = fn(get().estimate);
    scheduleSave(estimate);
    // config is unchanged here — keeping its identity stable avoids re-rendering
    // every config subscriber (e.g. the Settings editors) on each keystroke.
    set({ estimate, result: computeEstimate(estimate, get().config) });
  },
  setOverrides: (overrides) => {
    saveOverrides(overrides);
    const config = effectiveConfig(overrides);
    set({ overrides, config, result: computeEstimate(get().estimate, config) });
  },
  setExplain: (explain) => set({ explain }),
  reset: () => {
    const estimate = newEstimate(get().config);
    saveEstimate(estimate);
    set({
      estimate,
      result: computeEstimate(estimate, get().config),
      explain: null,
    });
  },
}));
