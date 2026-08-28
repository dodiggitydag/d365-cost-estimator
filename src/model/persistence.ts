import type { Estimate, EstimatorConfig } from '../engine/types';
import type { ConfigOverrides } from './config';
import { migrateStandardItems } from './estimate';
import { configOverridesSchema, estimateSchema } from './schemas';

const ESTIMATE_KEY = 'd365-estimator.estimate';
const OVERRIDES_KEY = 'd365-estimator.config-overrides';

// localStorage works on file:// in Chrome/Edge; JSON export is the durable save.
function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — export/import still works */
  }
}

export function loadSavedEstimate(config: EstimatorConfig): Estimate | null {
  const raw = safeGet(ESTIMATE_KEY);
  if (!raw) return null;
  try {
    return migrateStandardItems(estimateSchema.parse(JSON.parse(raw)) as Estimate, config);
  } catch {
    return null;
  }
}

export function saveEstimate(estimate: Estimate): void {
  safeSet(ESTIMATE_KEY, JSON.stringify(estimate));
}

export function loadSavedOverrides(): ConfigOverrides | null {
  const raw = safeGet(OVERRIDES_KEY);
  if (!raw) return null;
  try {
    return configOverridesSchema.parse(JSON.parse(raw)) as ConfigOverrides;
  } catch {
    return null;
  }
}

export function saveOverrides(overrides: ConfigOverrides | null): void {
  if (!overrides) {
    try {
      window.localStorage.removeItem(OVERRIDES_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  safeSet(OVERRIDES_KEY, JSON.stringify(overrides));
}

export function parseEstimateJson(text: string, config: EstimatorConfig): Estimate {
  return migrateStandardItems(estimateSchema.parse(JSON.parse(text)) as Estimate, config);
}

export function parseOverridesJson(text: string): ConfigOverrides {
  return configOverridesSchema.parse(JSON.parse(text)) as ConfigOverrides;
}

/** Today as YYYY-MM-DD in the user's local timezone, for export filenames. */
export function isoDateStamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  triggerDownload(filename, blob);
}

export function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
