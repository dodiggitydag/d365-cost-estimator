import { useMemo } from 'react';
import { useStore } from '../store';
import { CATEGORY_LABELS, money } from '../../engine';
import type { CostLine, ItemCategory } from '../../engine/types';

/**
 * The explanation drill-in: every cost line shown with its formula in words,
 * the rule that scheduled it, and price citations back to the licensing guide.
 */
export function ExplainDrawer() {
  const explain = useStore((s) => s.explain);
  const setExplain = useStore((s) => s.setExplain);
  const result = useStore((s) => s.result);
  const config = useStore((s) => s.config);
  const estimate = useStore((s) => s.estimate);

  const lines = useMemo(() => {
    if (!explain) return [];
    return result.lines
      .filter((l) => {
        if (explain.month !== undefined && l.month !== explain.month) return false;
        if (explain.category !== undefined && l.category !== explain.category)
          return false;
        if (explain.kind === 'cell' && l.envInstanceId !== explain.envInstanceId)
          return false;
        return true;
      })
      .sort((a, b) => b.amount - a.amount);
  }, [explain, result]);

  if (!explain) return null;

  const rules = estimate.ruleOverrides ?? config.rules;
  const total = lines.reduce((s, l) => s + l.amount, 0);

  // For a schedule cell, also surface the environment's methodology description
  // and the rule rationale even when the cell has no cost lines.
  const cellEnv =
    explain.kind === 'cell' && explain.envInstanceId
      ? result.schedule.instances.find((i) => i.id === explain.envInstanceId)
      : undefined;
  const cellEnvType = cellEnv
    ? config.environments.find((t) => t.id === cellEnv.typeId)
    : undefined;
  const cell =
    cellEnv && explain.month
      ? result.schedule.cells[cellEnv.id][explain.month - 1]
      : undefined;

  return (
    <>
      <div className="drawer-backdrop" onClick={() => setExplain(null)} />
      <div className="drawer">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{explain.title}</h2>
          <button onClick={() => setExplain(null)}>Close</button>
        </div>
        <p className="muted">
          {lines.length} cost line{lines.length === 1 ? '' : 's'} · {money(total)}
        </p>

        {cellEnvType && (
          <div className="explain-line">
            <strong>{cellEnvType.label}</strong>
            <p className="why">{cellEnvType.description}</p>
            {cell && (
              <p className="why">
                {cell.overridden ? (
                  <span className="badge override">manual override</span>
                ) : (
                  cell.ruleIds.map((rid) => {
                    const rule = rules.find((r) => r.id === rid);
                    return (
                      <span key={rid}>
                        <span className="badge">{rid}</span>
                        {rule?.rationale}{' '}
                      </span>
                    );
                  })
                )}
                {!cell.active && ' (environment is OFF this month)'}
              </p>
            )}
          </div>
        )}

        {lines.map((line) => (
          <ExplainLine key={line.id} line={line} />
        ))}
        {lines.length === 0 && (
          <p className="muted">No cost lines match this selection.</p>
        )}
      </div>
    </>
  );
}

function ExplainLine({ line }: { line: CostLine }) {
  const config = useStore((s) => s.config);
  const estimate = useStore((s) => s.estimate);
  const rules = estimate.ruleOverrides ?? config.rules;

  return (
    <div className="explain-line">
      <span className="amount">{money(line.amount)}</span>
      <strong>{line.label}</strong>{' '}
      <span className="badge">{CATEGORY_LABELS[line.category as ItemCategory]}</span>
      <span className="badge">month {line.month}</span>
      {line.trace.overridden && <span className="badge override">override</span>}
      <div className="formula">{line.trace.formula}</div>
      {line.trace.ruleIds?.map((rid) => {
        const rule = rules.find((r) => r.id === rid);
        return rule ? (
          <p className="why" key={rid}>
            <strong>Why this month:</strong> {rule.rationale}
          </p>
        ) : null;
      })}
      {Object.entries(line.trace.inputs).length > 0 && (
        <details>
          <summary className="muted" style={{ cursor: 'pointer', fontSize: 12 }}>
            inputs
          </summary>
          <ul style={{ margin: '4px 0', fontSize: 12 }}>
            {Object.entries(line.trace.inputs).map(([k, v]) => (
              <li key={k}>
                {k}: {String(v)}
              </li>
            ))}
          </ul>
        </details>
      )}
      {line.trace.priceRefs.map((pid) => {
        const p = config.pricing.entries.find((e) => e.id === pid);
        return p ? (
          <p className="cite" key={pid}>
            {money(p.value)} per {p.unit} —{' '}
            <a href={p.sourceUrl} target="_blank" rel="noreferrer">
              {p.guideSection ?? p.sourceUrl}
            </a>{' '}
            <span className="muted">(as of {p.asOf})</span>
          </p>
        ) : null;
      })}
    </div>
  );
}
