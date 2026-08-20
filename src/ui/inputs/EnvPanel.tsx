import { useStore } from '../store';
import type { EnvInstance, StoragePool } from '../../engine/types';

const EDIT_POOLS: StoragePool[] = ['fscmData', 'fscmFile', 'dvData', 'dvFile'];
const POOL_SHORT: Record<string, string> = {
  fscmData: 'F&SCM data',
  fscmFile: 'F&SCM file',
  dvData: 'DV data',
  dvFile: 'DV file',
};

export function EnvPanel() {
  const config = useStore((s) => s.config);
  const result = useStore((s) => s.result);
  const update = useStore((s) => s.update);

  const storageOf = (inst: EnvInstance, pool: StoragePool): number => {
    if (inst.storageSteps?.length) return inst.storageSteps[0].gb[pool] ?? 0;
    const t = config.environments.find((e) => e.id === inst.typeId);
    return t?.defaultStorageGB[pool] ?? 0;
  };

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
    <details className="section">
      <summary>Environments &amp; storage demand</summary>
      <div className="body">
        <p className="help">
          Instances are derived from the methodology rules (DEV count follows concurrent
          developers). Storage demand (GB while active) feeds the overage calculation —
          edit it per environment. Add extra instances if the project needs them.
        </p>
        {result.schedule.instances.map((inst) => {
          const t = config.environments.find((e) => e.id === inst.typeId);
          return (
            <div key={inst.id} style={{ borderBottom: '1px dashed var(--border)', padding: '4px 0' }}>
              <div className="row">
                <strong style={{ minWidth: 150 }} title={t?.description}>
                  {inst.name}
                </strong>
                {!inst.fromRule && (
                  <button
                    className="small danger"
                    onClick={() =>
                      update((e) => ({
                        ...e,
                        environments: e.environments.filter((x) => x.id !== inst.id),
                        gridOverrides: e.gridOverrides.filter(
                          (o) => o.envInstanceId !== inst.id,
                        ),
                      }))
                    }
                  >
                    remove
                  </button>
                )}
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
              </div>
            </div>
          );
        })}
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
