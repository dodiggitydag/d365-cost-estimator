import { useStore } from '../store';
import { monthLabel, parseYearMonth, subscriptionStartMonth } from '../../engine';

export function LicensesPanel() {
  const estimate = useStore((s) => s.estimate);
  const config = useStore((s) => s.config);
  const update = useStore((s) => s.update);

  const mode = estimate.licenseCostMode;
  const start = subscriptionStartMonth(estimate);
  const calendarStart = parseYearMonth(estimate.startYearMonth);

  return (
    <details className="section" open>
      <summary>Licenses &amp; users</summary>
      <div className="body">
        <p className="help">
          User counts drive storage entitlements and Copilot Studio credits even when the
          subscription cost is entered as a negotiated total. Steps let counts change over
          time (e.g. pilot users at month 1, everyone at go-live) and also set when billing
          starts — the first step with users. To buy later, add a zero-count step at month 1.
        </p>
        {estimate.licenseSteps.map((step, si) => (
          <div key={si} style={{ borderTop: si ? '1px dashed var(--border)' : undefined, paddingTop: si ? 6 : 0 }}>
            <div className="row">
              <label>From month</label>
              <input
                type="number"
                min={1}
                value={step.fromMonth}
                onChange={(ev) =>
                  update((e) => ({
                    ...e,
                    licenseSteps: e.licenseSteps.map((s2, i) =>
                      i === si ? { ...s2, fromMonth: parseInt(ev.target.value) || 1 } : s2,
                    ),
                  }))
                }
              />
              {estimate.licenseSteps.length > 1 && (
                <button
                  className="small danger"
                  title="Remove this count step"
                  onClick={() =>
                    update((e) => ({
                      ...e,
                      licenseSteps: e.licenseSteps.filter((_, i) => i !== si),
                    }))
                  }
                >
                  ✕
                </button>
              )}
            </div>
            {config.licenses.types.map((lt) => (
              <div className="row" key={lt.id}>
                <label title={lt.notes}>{lt.label}</label>
                <input
                  type="number"
                  min={0}
                  value={step.counts[lt.id] ?? 0}
                  onChange={(ev) =>
                    update((e) => ({
                      ...e,
                      licenseSteps: e.licenseSteps.map((s2, i) =>
                        i === si
                          ? {
                              ...s2,
                              counts: {
                                ...s2.counts,
                                [lt.id]: Math.max(0, parseInt(ev.target.value) || 0),
                              },
                            }
                          : s2,
                      ),
                    }))
                  }
                />
              </div>
            ))}
          </div>
        ))}
        <button
          className="small"
          title="Add a step so user counts change over time (e.g. pilot users first, everyone at go-live)"
          onClick={() =>
            update((e) => ({
              ...e,
              licenseSteps: [
                ...e.licenseSteps,
                {
                  fromMonth:
                    (e.licenseSteps[e.licenseSteps.length - 1]?.fromMonth ?? 0) + 6,
                  counts: { ...e.licenseSteps[e.licenseSteps.length - 1]?.counts },
                },
              ],
            }))
          }
        >
          + count step
        </button>

        <div className="row" style={{ marginTop: 10 }}>
          <label>Subscription cost</label>
          <select
            value={mode.kind}
            onChange={(ev) =>
              update((e) => ({
                ...e,
                licenseCostMode:
                  ev.target.value === 'listPrices'
                    ? { kind: 'listPrices' }
                    : { kind: 'lumpSum', monthlyTotal: mode.kind === 'lumpSum' ? mode.monthlyTotal : 0 },
              }))
            }
          >
            <option value="lumpSum">negotiated monthly total</option>
            <option value="listPrices">compute from list prices</option>
          </select>
        </div>
        {mode.kind === 'lumpSum' && (
          <div className="row">
            <label>Monthly total (USD)</label>
            <input
              type="number"
              min={0}
              value={mode.monthlyTotal}
              onChange={(ev) =>
                update((e) => ({
                  ...e,
                  licenseCostMode: {
                    kind: 'lumpSum',
                    monthlyTotal: Math.max(0, parseFloat(ev.target.value) || 0),
                  },
                }))
              }
            />
            <span className="muted">mix of licenses &amp; discounts — one number</span>
          </div>
        )}
        <div className="row">
          <label>Subscriptions start</label>
          <span className="badge">
            month {start}
            {calendarStart ? ` (${monthLabel(start, calendarStart)})` : ''}
          </span>
          <span className="muted">first count step with users</span>
        </div>
        <div className="row">
          <label>Customer Insights</label>
          <input
            type="checkbox"
            checked={estimate.customerInsightsAddon}
            onChange={(ev) =>
              update((e) => ({ ...e, customerInsightsAddon: ev.target.checked }))
            }
          />
          <span className="muted">adds Dataverse entitlement (+15 data / +20 file GB)</span>
        </div>
      </div>
    </details>
  );
}
