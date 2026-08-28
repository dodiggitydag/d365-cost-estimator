import { useStore } from '../store';
import { instanceStorageAt, mirrorsProdStorage } from '../../engine';
import { STORAGE_POOLS } from '../../engine/types';
import type { EnvInstance, StoragePool } from '../../engine/types';
import { NumberRow } from './NumberRow';

// dvLog is tracked but not billed, so it isn't edited per environment.
const EDIT_POOLS: StoragePool[] = STORAGE_POOLS.filter((p) => p !== 'dvLog');
const POOL_SHORT: Partial<Record<StoragePool, string>> = {
  fscmData: 'F&SCM data',
  fscmFile: 'F&SCM file',
  dvData: 'DV data',
  dvFile: 'DV file',
};

export function EnvPanel() {
  const config = useStore((s) => s.config);
  const result = useStore((s) => s.result);
  const estimate = useStore((s) => s.estimate);
  const update = useStore((s) => s.update);

  const storageOf = (inst: EnvInstance, pool: StoragePool): number =>
    instanceStorageAt(inst, config, 1, pool);

  const growthOf = (pool: StoragePool): number =>
    estimate.settings.prodGrowthGBPerYear?.[pool] ?? 0;

  const setGrowth = (pool: StoragePool, gb: number) =>
    update((e) => ({
      ...e,
      settings: {
        ...e.settings,
        prodGrowthGBPerYear: { ...e.settings.prodGrowthGBPerYear, [pool]: gb },
      },
    }));

  const setMirror = (inst: EnvInstance, on: boolean) =>
    update((e) => {
      const current = e.environments.find((x) => x.id === inst.id);
      const updated: EnvInstance = { ...(current ?? inst), mirrorProdStorage: on };
      return {
        ...e,
        environments: current
          ? e.environments.map((x) => (x.id === inst.id ? updated : x))
          : [...e.environments, updated],
      };
    });

  const setStorage = (inst: EnvInstance, pool: StoragePool, gb: number) =>
    update((e) => {
      const current = e.environments.find((x) => x.id === inst.id);
      const gbAll = Object.fromEntries(
        EDIT_POOLS.map((p) => [p, p === pool ? gb : storageOf(current ?? inst, p)]),
      );
      const updated: EnvInstance = {
        ...(current ?? inst),
        storageSteps: [{ fromMonth: 1, gb: gbAll }],
      };
      return {
        ...e,
        environments: current
          ? e.environments.map((x) => (x.id === inst.id ? updated : x))
          : [...e.environments, updated],
      };
    });

  return (
    <details className="section" open>
      <summary>Environments &amp; storage demand</summary>
      <div className="body">
        <p className="help">
          Instances are derived from the methodology rules (DEV count follows concurrent
          developers). Storage demand (GB while active) feeds the overage calculation —
          edit it per environment. Add extra instances if the project needs them.
        </p>
        <NumberRow
          label="PROD lead time (months)"
          value={estimate.settings.prodLeadMonths}
          onChange={(n) =>
            update((e) => ({ ...e, settings: { ...e.settings, prodLeadMonths: n } }))
          }
          help="before first go-live"
        />
        <div className="row" style={{ gap: 6 }}>
          <label title="Annual data growth added to Production, prorated monthly from the month PROD starts">
            PROD growth (GB/yr)
          </label>
          {EDIT_POOLS.map((pool) => (
            <span key={pool} style={{ whiteSpace: 'nowrap' }}>
              <span className="muted" style={{ fontSize: 11 }}>
                {POOL_SHORT[pool]}{' '}
              </span>
              <input
                style={{ width: 58 }}
                type="number"
                min={0}
                value={growthOf(pool)}
                onChange={(ev) =>
                  setGrowth(pool, Math.max(0, parseFloat(ev.target.value) || 0))
                }
              />
            </span>
          ))}
        </div>
        <p className="help">
          Growth accrues on Production only, prorated monthly from the month PROD starts
          (24 GB/yr = +2 GB after one month). The per-environment figures below are the
          starting demand.
        </p>
        {result.schedule.instances.map((inst) => {
          const t = config.environments.find((e) => e.id === inst.typeId);
          const mirrors = mirrorsProdStorage(inst, config);
          return (
            <div key={inst.id} style={{ borderBottom: '1px dashed var(--border)', padding: '4px 0' }}>
              <div className="row">
                <strong style={{ minWidth: 150 }} title={t?.description}>
                  {inst.name}
                </strong>
                {!t?.prodGrowthApplies && (
                  <label
                    className="muted"
                    style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                    title="Refreshed from Production after go-live: from the month after go-live this environment's storage demand tracks PROD (including growth) instead of the values below"
                  >
                    <input
                      type="checkbox"
                      checked={mirrors}
                      onChange={(ev) => setMirror(inst, ev.target.checked)}
                    />{' '}
                    mirrors PROD after go-live
                  </label>
                )}
                <button
                  className="small danger"
                  title="Remove this environment from the plan"
                  onClick={() =>
                    update((e) => {
                      // Rule-derived instances would regenerate, so they are
                      // disabled by id; user-added ones are deleted outright.
                      const isManual = e.environments.some(
                        (x) => x.id === inst.id && !x.fromRule,
                      );
                      return {
                        ...e,
                        disabledEnvIds: isManual
                          ? e.disabledEnvIds
                          : [...e.disabledEnvIds, inst.id],
                        environments: isManual
                          ? e.environments.filter((x) => x.id !== inst.id)
                          : e.environments,
                        gridOverrides: e.gridOverrides.filter(
                          (o) => o.envInstanceId !== inst.id,
                        ),
                      };
                    })
                  }
                >
                  remove
                </button>
              </div>
              <div className="row" style={{ gap: 6 }}>
                {EDIT_POOLS.map((pool) => (
                  <span key={pool} style={{ whiteSpace: 'nowrap' }}>
                    <span className="muted" style={{ fontSize: 11 }}>
                      {POOL_SHORT[pool]}{' '}
                    </span>
                    <input
                      style={{ width: 58 }}
                      type="number"
                      min={0}
                      value={storageOf(inst, pool)}
                      onChange={(ev) =>
                        setStorage(inst, pool, Math.max(0, parseFloat(ev.target.value) || 0))
                      }
                    />
                  </span>
                ))}
                {mirrors && (
                  <span className="muted" style={{ fontSize: 11 }}>
                    until go-live, then tracks Production
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {estimate.disabledEnvIds.length > 0 && (
          <div className="row" style={{ marginTop: 6 }}>
            <span className="muted">Removed:</span>
            {estimate.disabledEnvIds.map((id) => (
              <button
                key={id}
                className="small"
                title="Restore this environment"
                onClick={() =>
                  update((e) => ({
                    ...e,
                    disabledEnvIds: e.disabledEnvIds.filter((x) => x !== id),
                  }))
                }
              >
                {id} ↩
              </button>
            ))}
          </div>
        )}
        <div className="row" style={{ marginTop: 6 }}>
          <label>Add instance</label>
          <select
            defaultValue=""
            onChange={(ev) => {
              const typeId = ev.target.value;
              if (!typeId) return;
              ev.target.value = '';
              update((e) => {
                const t = config.environments.find((x) => x.id === typeId)!;
                const n =
                  result.schedule.instances.filter((i) => i.typeId === typeId).length + 1;
                return {
                  ...e,
                  environments: [
                    ...e.environments,
                    {
                      id: `${typeId}-x${n}`,
                      typeId,
                      name: `${t.label} ${n} (added)`,
                    },
                  ],
                };
              });
            }}
          >
            <option value="">choose type…</option>
            {config.environments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </details>
  );
}
