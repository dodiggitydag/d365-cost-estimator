import { useStore } from '../store';
import { patchById } from '../../model/estimate';
import { money, selectCommerceTier } from '../../engine';
import type { CommerceScaleUnit, CommerceStep } from '../../engine/types';

/** Derived tier/band preview for one volume step; null when it can't be priced. */
function StepBadge({ step }: { step: CommerceStep }) {
  const config = useStore((s) => s.config);
  if (step.transactionsPerMonth <= 0) return null;
  try {
    const choice = selectCommerceTier(
      step.transactionsPerMonth,
      step.averageOrderValue,
      config.commerce,
      config.pricing,
    );
    return (
      <div className="row">
        <label>Sized as</label>
        <span className="badge">
          {choice.tierLabel} · {choice.bandLabel}
          {choice.overageUnits > 0 ? ` + ${choice.overageUnits} overage units` : ''} ·{' '}
          {money(choice.total)}/mo
        </span>
        <span className="muted">cheapest of {Object.keys(choice.candidates).length} tiers</span>
      </div>
    );
  } catch {
    // A config override may have dropped a commerce price id; the engine will
    // surface the same problem — don't crash the panel over a badge.
    return null;
  }
}

export function CommercePanel() {
  const estimate = useStore((s) => s.estimate);
  const config = useStore((s) => s.config);
  const update = useStore((s) => s.update);

  const patchStep = (index: number, patch: Partial<CommerceStep>) =>
    update((e) => ({
      ...e,
      commerceSteps: e.commerceSteps.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));

  const patchCsu = (id: string, patch: Partial<CommerceScaleUnit>) =>
    update((e) => ({
      ...e,
      commerceScaleUnits: patchById(e.commerceScaleUnits, id, patch),
    }));

  return (
    <details className="section">
      <summary>Commerce (e-commerce &amp; APIs)</summary>
      <div className="body">
        <p className="help">
          Microsoft sizes e-commerce by transactions (completed carts — item count doesn't
          matter) and average order value; the tool picks the cheapest e-Commerce tier +
          overage per month. Each tier includes one cloud Commerce Scale Unit, which also
          serves headless / Commerce API traffic — there is no per-API-call meter. License
          POS registers as Operations – Device and HQ staff as Commerce full users in the
          Licenses panel.
        </p>

        {estimate.commerceSteps.map((step, si) => (
          <div
            key={si}
            style={{
              borderTop: si ? '1px dashed var(--border)' : undefined,
              paddingTop: si ? 6 : 0,
            }}
          >
            <div className="row">
              <label>From month</label>
              <input
                type="number"
                min={1}
                value={step.fromMonth}
                onChange={(ev) => patchStep(si, { fromMonth: parseInt(ev.target.value) || 1 })}
              />
              <button
                className="small danger"
                title="Remove this volume step"
                onClick={() =>
                  update((e) => ({
                    ...e,
                    commerceSteps: e.commerceSteps.filter((_, i) => i !== si),
                  }))
                }
              >
                ✕
              </button>
            </div>
            <div className="row">
              <label>Transactions / month</label>
              <input
                type="number"
                min={0}
                value={step.transactionsPerMonth}
                onChange={(ev) =>
                  patchStep(si, {
                    transactionsPerMonth: Math.max(0, parseInt(ev.target.value) || 0),
                  })
                }
              />
              <span className="muted">completed e-commerce carts</span>
            </div>
            <div className="row">
              <label>Average order value ($)</label>
              <input
                type="number"
                min={0}
                value={step.averageOrderValue}
                onChange={(ev) =>
                  patchStep(si, {
                    averageOrderValue: Math.max(0, parseFloat(ev.target.value) || 0),
                  })
                }
              />
              <span className="muted">annual GMV ÷ transactions</span>
            </div>
            <StepBadge step={step} />
          </div>
        ))}
        <div className="row">
          <button
            className="small"
            title="Add an e-commerce volume step; the tier and band are re-derived from the step in effect each month"
            onClick={() =>
              update((e) => {
                const last = e.commerceSteps[e.commerceSteps.length - 1];
                return {
                  ...e,
                  commerceSteps: [
                    ...e.commerceSteps,
                    {
                      fromMonth: last ? last.fromMonth + 6 : 1,
                      transactionsPerMonth: last?.transactionsPerMonth ?? 1000,
                      averageOrderValue: last?.averageOrderValue ?? 100,
                    },
                  ],
                };
              })
            }
          >
            + volume step
          </button>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <label>Extra Scale Units</label>
          <span className="muted">
            beyond the one each e-Commerce tier includes — extra geos, redundancy, device
            capacity
          </span>
        </div>
        {estimate.commerceScaleUnits.length > 0 && (
          <div className="item-row muted" style={{ fontSize: 12 }}>
            <span>Size</span>
            <span>Count</span>
            <span>From</span>
            <span>To</span>
            <span />
          </div>
        )}
        {estimate.commerceScaleUnits.map((row) => (
          <div className="item-row" key={row.id}>
            <select
              value={row.tier}
              onChange={(ev) => patchCsu(row.id, { tier: ev.target.value })}
            >
              {config.commerce.scaleUnits.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} ({s.devices} devices)
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              value={row.count}
              onChange={(ev) =>
                patchCsu(row.id, { count: Math.max(0, parseInt(ev.target.value) || 0) })
              }
            />
            <input
              type="number"
              min={1}
              value={row.fromMonth}
              onChange={(ev) =>
                patchCsu(row.id, { fromMonth: Math.max(1, parseInt(ev.target.value) || 1) })
              }
            />
            <input
              type="number"
              min={1}
              value={row.toMonth}
              onChange={(ev) =>
                patchCsu(row.id, { toMonth: Math.max(1, parseInt(ev.target.value) || 1) })
              }
            />
            <button
              className="small danger"
              title="Remove this Scale Unit row"
              onClick={() =>
                update((e) => ({
                  ...e,
                  commerceScaleUnits: e.commerceScaleUnits.filter((x) => x.id !== row.id),
                }))
              }
            >
              ✕
            </button>
          </div>
        ))}
        <div className="row">
          <button
            className="small"
            title="Add standalone Commerce Scale Unit – Cloud units billed monthly over a window"
            onClick={() =>
              update((e) => ({
                ...e,
                commerceScaleUnits: [
                  ...e.commerceScaleUnits,
                  {
                    id: `csu-${Date.now()}`,
                    tier: config.commerce.scaleUnits[0]?.id ?? 'basic',
                    count: 1,
                    fromMonth: 1,
                    toMonth: e.horizonMonths,
                  },
                ],
              }))
            }
          >
            + scale unit
          </button>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <label>Ratings and Reviews add-on</label>
          <input
            type="checkbox"
            checked={estimate.commerceRatingsReviews}
            onChange={(ev) =>
              update((e) => ({ ...e, commerceRatingsReviews: ev.target.checked }))
            }
          />
          <span className="muted">billed in months with e-commerce volume</span>
        </div>
      </div>
    </details>
  );
}
