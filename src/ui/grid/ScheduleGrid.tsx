import { useRef, useState } from 'react';
import { useStore } from '../store';

/**
 * Environment × month grid. Rules paint the base schedule; clicking or dragging
 * toggles cells as overrides (badged). Right-click reverts a cell to its rule value.
 */
export function ScheduleGrid() {
  const estimate = useStore((s) => s.estimate);
  const result = useStore((s) => s.result);
  const config = useStore((s) => s.config);
  const update = useStore((s) => s.update);
  const setExplain = useStore((s) => s.setExplain);

  const months = estimate.horizonMonths;
  const paint = useRef<{ active: boolean } | null>(null);
  const [, force] = useState(0);

  const goLives = new Set(result.goLiveMonths.map((g) => g.month));

  const setCell = (envInstanceId: string, month: number, active: boolean) =>
    update((e) => ({
      ...e,
      gridOverrides: [
        ...e.gridOverrides.filter(
          (o) => !(o.envInstanceId === envInstanceId && o.month === month),
        ),
        { envInstanceId, month, active },
      ],
    }));

  const revertCell = (envInstanceId: string, month: number) =>
    update((e) => ({
      ...e,
      gridOverrides: e.gridOverrides.filter(
        (o) => !(o.envInstanceId === envInstanceId && o.month === month),
      ),
    }));

  return (
    <div>
      <p className="help">
        Solid cells come from the methodology rules — click a cell for the why. Click or
        drag to override (⤴ orange corner = manual override); right-click a cell to revert
        it to the rule. Green header = go-live month.
      </p>
      <div className="grid-wrap" onMouseLeave={() => (paint.current = null)}>
        <table
          className="schedule"
          onMouseUp={() => (paint.current = null)}
        >
          <thead>
            <tr>
              <th className="env-name">Environment</th>
              {Array.from({ length: months }, (_, i) => (
                <th key={i} className={goLives.has(i + 1) ? 'golive' : undefined} title={goLives.has(i + 1) ? 'Go-live' : undefined}>
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.schedule.instances.map((inst, rowIdx) => {
              const row = result.schedule.cells[inst.id];
              const envType = config.environments.find((t) => t.id === inst.typeId);
              return (
                <tr key={inst.id}>
                  <td
                    className="env-name"
                    title={envType?.description}
                    style={{ cursor: 'help' }}
                  >
                    {inst.name}
                  </td>
                  {row.map((cell, mIdx) => (
                    <td
                      key={mIdx}
                      className={[
                        'cell',
                        cell.active ? 'active' : '',
                        cell.active && rowIdx % 2 ? 'alt' : '',
                        cell.overridden ? 'overridden' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      title={cellTitle(inst.name, mIdx + 1, cell.active, cell.ruleIds, cell.overridden)}
                      onMouseDown={(ev) => {
                        if (ev.button !== 0) return;
                        ev.preventDefault();
                        const target = !cell.active;
                        paint.current = { active: target };
                        setCell(inst.id, mIdx + 1, target);
                        force((n) => n + 1);
                      }}
                      onMouseEnter={() => {
                        if (paint.current) setCell(inst.id, mIdx + 1, paint.current.active);
                      }}
                      onContextMenu={(ev) => {
                        ev.preventDefault();
                        revertCell(inst.id, mIdx + 1);
                      }}
                      onDoubleClick={() =>
                        setExplain({
                          kind: 'cell',
                          month: mIdx + 1,
                          envInstanceId: inst.id,
                          title: `${inst.name} — month ${mIdx + 1}`,
                        })
                      }
                    />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="help">
        Double-click an active cell to see its cost lines and the rule that scheduled it.
      </p>
      <RuleLegend />
    </div>
  );
}

function cellTitle(
  name: string,
  month: number,
  active: boolean,
  ruleIds: string[],
  overridden: boolean,
): string {
  const state = active ? 'running' : 'off';
  const why = overridden
    ? 'manual override'
    : ruleIds.length
      ? `rule: ${ruleIds.join(', ')}`
      : 'no rule';
  return `${name}, month ${month}: ${state} (${why})`;
}

function RuleLegend() {
  const estimate = useStore((s) => s.estimate);
  const config = useStore((s) => s.config);
  const rules = estimate.ruleOverrides ?? config.rules;
  return (
    <details className="section">
      <summary>Scheduling rules in effect</summary>
      <div className="body">
        {rules.map((r) => (
          <p key={r.id} style={{ margin: '6px 0' }}>
            <span className="badge">{r.envTypeId}</span>
            <strong>{r.id}</strong>
            <span className="muted"> ({r.scope})</span>
            <br />
            <span className="muted">{r.rationale}</span>
          </p>
        ))}
        <p className="help">Rules can be edited in Settings → Scheduling rules.</p>
      </div>
    </details>
  );
}
