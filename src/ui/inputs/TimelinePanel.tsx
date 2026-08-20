import { useStore } from '../store';
import { addRollout } from '../../model/estimate';
import { goLiveMonth } from '../../engine';
import type { Phase, PhaseKind } from '../../engine/types';

const KINDS: PhaseKind[] = ['initiate', 'implement', 'prepare', 'operate', 'custom'];

export function TimelinePanel() {
  const estimate = useStore((s) => s.estimate);
  const update = useStore((s) => s.update);

  const setPhase = (rolloutId: string, phaseId: string, patch: Partial<Phase>) =>
    update((e) => ({
      ...e,
      rollouts: e.rollouts.map((r) =>
        r.id !== rolloutId
          ? r
          : {
              ...r,
              phases: r.phases.map((p) => (p.id === phaseId ? { ...p, ...patch } : p)),
            },
      ),
    }));

  return (
    <details className="section" open>
      <summary>Timeline &amp; rollouts</summary>
      <div className="body">
        <p className="help">
          Phases follow Microsoft Success by Design (Initiate → Implement → Prepare →
          Operate). Go-live defaults to the end of Prepare. Everything is editable.
        </p>
        <div className="row">
          <label>Horizon (months)</label>
          <input
            type="number"
            min={1}
            max={60}
            value={estimate.horizonMonths}
            onChange={(ev) =>
              update((e) => ({
                ...e,
                horizonMonths: clamp(parseInt(ev.target.value) || 36, 1, 60),
              }))
            }
          />
        </div>
        {estimate.rollouts.map((r) => (
          <div key={r.id} style={{ marginTop: 8 }}>
            <div className="row">
              <input
                type="text"
                value={r.name}
                onChange={(ev) =>
                  update((e) => ({
                    ...e,
                    rollouts: e.rollouts.map((x) =>
                      x.id === r.id ? { ...x, name: ev.target.value } : x,
                    ),
                  }))
                }
              />
              <span className="badge">go-live: month {goLiveMonth(r)}</span>
              {estimate.rollouts.length > 1 && (
                <button
                  className="small danger"
                  title="Remove rollout"
                  onClick={() =>
                    update((e) => ({
                      ...e,
                      rollouts: e.rollouts.filter((x) => x.id !== r.id),
                    }))
                  }
                >
                  ✕
                </button>
              )}
            </div>
            <div className="phase-row muted" style={{ fontSize: 12 }}>
              <span>Phase</span>
              <span>Kind</span>
              <span>Start</span>
              <span>Months</span>
              <span />
            </div>
            {r.phases.map((p) => (
              <div className="phase-row" key={p.id}>
                <input
                  type="text"
                  value={p.name}
                  onChange={(ev) => setPhase(r.id, p.id, { name: ev.target.value })}
                />
                <select
                  value={p.kind}
                  onChange={(ev) =>
                    setPhase(r.id, p.id, { kind: ev.target.value as PhaseKind })
                  }
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={p.startMonth}
                  onChange={(ev) =>
                    setPhase(r.id, p.id, { startMonth: parseInt(ev.target.value) || 1 })
                  }
                />
                <input
                  type="number"
                  min={1}
                  value={p.lengthMonths}
                  onChange={(ev) =>
                    setPhase(r.id, p.id, { lengthMonths: parseInt(ev.target.value) || 1 })
                  }
                />
                <button
                  className="small danger"
                  title="Remove phase"
                  onClick={() =>
                    update((e) => ({
                      ...e,
                      rollouts: e.rollouts.map((x) =>
                        x.id === r.id
                          ? { ...x, phases: x.phases.filter((q) => q.id !== p.id) }
                          : x,
                      ),
                    }))
                  }
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              className="small"
              onClick={() =>
                update((e) => ({
                  ...e,
                  rollouts: e.rollouts.map((x) =>
                    x.id === r.id
                      ? {
                          ...x,
                          phases: [
                            ...x.phases,
                            {
                              id: `${r.id}-p${Date.now()}`,
                              kind: 'custom',
                              name: 'New phase',
                              startMonth: 1,
                              lengthMonths: 1,
                            },
                          ],
                        }
                      : x,
                  ),
                }))
              }
            >
              + phase
            </button>
          </div>
        ))}
        <div className="row" style={{ marginTop: 8 }}>
          <button onClick={() => update((e) => addRollout(e))}>+ Add rollout</button>
          <span className="help">Phased deployment? Each rollout gets its own go-live.</span>
        </div>
      </div>
    </details>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
