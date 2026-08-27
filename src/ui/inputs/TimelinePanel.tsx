import { useStore } from '../store';
import { addRollout, patchById } from '../../model/estimate';
import { goLiveMonth, monthLabel, parseYearMonth } from '../../engine';
import type { Phase, PhaseKind, Rollout } from '../../engine/types';
import { Warnings } from '../Warnings';

const KINDS: PhaseKind[] = ['initiate', 'implement', 'prepare', 'operate', 'custom'];

export function TimelinePanel() {
  const estimate = useStore((s) => s.estimate);
  const result = useStore((s) => s.result);
  const update = useStore((s) => s.update);

  const patchRollout = (rolloutId: string, patch: Partial<Rollout>) =>
    update((e) => ({ ...e, rollouts: patchById(e.rollouts, rolloutId, patch) }));

  const setPhase = (rollout: Rollout, phaseId: string, patch: Partial<Phase>) =>
    patchRollout(rollout.id, { phases: patchById(rollout.phases, phaseId, patch) });

  const start = parseYearMonth(estimate.startYearMonth);

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
        <div className="row">
          <label>Anticipated start</label>
          <input
            type="month"
            value={estimate.startYearMonth ?? ''}
            onChange={(ev) =>
              update((e) => ({ ...e, startYearMonth: ev.target.value || undefined }))
            }
          />
          <span className="muted">enables calendar-year view</span>
        </div>
        {estimate.rollouts.map((r) => (
          <div key={r.id} style={{ marginTop: 8 }}>
            <div className="row">
              <input
                type="text"
                value={r.name}
                onChange={(ev) => patchRollout(r.id, { name: ev.target.value })}
              />
              <span className="badge">
                go-live: month {goLiveMonth(r)}
                {start ? ` (${monthLabel(goLiveMonth(r), start)})` : ''}
              </span>
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
                  onChange={(ev) => setPhase(r, p.id, { name: ev.target.value })}
                />
                <select
                  value={p.kind}
                  onChange={(ev) =>
                    setPhase(r, p.id, { kind: ev.target.value as PhaseKind })
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
                    setPhase(r, p.id, { startMonth: parseInt(ev.target.value) || 1 })
                  }
                />
                <input
                  type="number"
                  min={1}
                  value={p.lengthMonths}
                  onChange={(ev) =>
                    setPhase(r, p.id, { lengthMonths: parseInt(ev.target.value) || 1 })
                  }
                />
                <button
                  className="small danger"
                  title="Remove phase"
                  onClick={() =>
                    patchRollout(r.id, { phases: r.phases.filter((q) => q.id !== p.id) })
                  }
                >
                  ✕
                </button>
              </div>
            ))}
            <Warnings
              warnings={result.warnings.filter((w) => w.rolloutId === r.id)}
              title="Phase order problem"
            />
            <button
              className="small"
              title="Add a phase to this rollout (rules anchor to phase kinds, so set the kind)"
              onClick={() =>
                patchRollout(r.id, {
                  phases: [
                    ...r.phases,
                    {
                      id: `${r.id}-p${Date.now()}`,
                      kind: 'custom',
                      name: 'New phase',
                      startMonth: 1,
                      lengthMonths: 1,
                    },
                  ],
                })
              }
            >
              + phase
            </button>
          </div>
        ))}
        <div className="row" style={{ marginTop: 8 }}>
          <button
            title="Add a phased-deployment rollout with its own Implement/Prepare phases and go-live, starting after the last one"
            onClick={() => update((e) => addRollout(e))}
          >
            + Add rollout
          </button>
          <span className="help">Phased deployment? Each rollout gets its own go-live.</span>
        </div>
      </div>
    </details>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
