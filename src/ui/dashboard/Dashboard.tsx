import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useStore } from '../store';
import {
  bucketTotals,
  byCategoryMonth,
  byEnvMonth,
  CATEGORY_LABELS,
  grandTotal,
  money,
  monthLabel,
  monthlyTotals,
  parseYearMonth,
  yearBuckets,
} from '../../engine';
import type { ItemCategory } from '../../engine/types';

const COLORS = ['#0f6cbd', '#77b7e5', '#f2a900', '#8764b8', '#1a7f37', '#d13438', '#5b6675', '#00b7c3'];

/**
 * Replaces Recharts' default tooltip, which lists the stack segments but not their
 * sum — the monthly total is the number people are usually after. Zero segments are
 * dropped so a month with one active category doesn't render a column of $0.00 rows.
 * Props are injected by Recharts via `content`.
 */
function CostTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: {
    name?: string;
    value?: number;
    color?: string;
    dataKey?: string | number;
    /** The whole chart row, which carries the project month/year numbers. */
    payload?: { monthNo?: number; yearNo?: number };
  }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((sum, p) => sum + (p.value ?? 0), 0);
  const rows = payload.filter((p) => (p.value ?? 0) !== 0);
  const row = payload[0]?.payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      {row?.monthNo !== undefined && (
        <div className="chart-tooltip-sub">
          Month {row.monthNo} · Year {row.yearNo}
        </div>
      )}
      {rows.map((p, i) => (
        <div key={String(p.dataKey ?? i)} style={{ color: p.color }}>
          {p.name} : {money(p.value ?? 0)}
        </div>
      ))}
      <div className="chart-tooltip-total">Total : {money(total)}</div>
    </div>
  );
}

export function Dashboard() {
  const estimate = useStore((s) => s.estimate);
  const result = useStore((s) => s.result);
  const setExplain = useStore((s) => s.setExplain);
  const [stackBy, setStackBy] = useState<'category' | 'environment'>('category');
  const [yearMode, setYearMode] = useState<'elapsed' | 'calendar'>('elapsed');

  const months = estimate.horizonMonths;
  const start = parseYearMonth(estimate.startYearMonth);
  const monthly = useMemo(() => monthlyTotals(result.lines, months), [result.lines, months]);
  const buckets = useMemo(
    () => yearBuckets(months, yearMode === 'calendar' ? start : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [months, yearMode, estimate.startYearMonth],
  );
  const years = useMemo(() => bucketTotals(monthly, buckets), [monthly, buckets]);
  const total = grandTotal(monthly);

  const categories = useMemo(
    () => byCategoryMonth(result.lines, months),
    [result.lines, months],
  );

  const stacked = useMemo(() => {
    const groups =
      stackBy === 'category'
        ? new Map([...categories].map(([k, v]) => [CATEGORY_LABELS[k], v]))
        : byEnvMonth(result.lines, months);
    const keys = [...groups.keys()];
    const data = Array.from({ length: months }, (_, i) => {
      // monthNo/yearNo are elapsed project numbers for the tooltip; they are not
      // plotted (only `keys` become bars), and complement the calendar label.
      const row: Record<string, number | string> = {
        month: monthLabel(i + 1, start),
        monthNo: i + 1,
        yearNo: Math.floor(i / 12) + 1,
      };
      for (const k of keys) row[k] = groups.get(k)![i];
      return row;
    });
    return { keys, data };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, result.lines, months, stackBy, estimate.startYearMonth]);

  return (
    <div>
      <div className="cards">
        <div className="card">
          <div className="value">{money(total)}</div>
          <div className="label">Total over {months} months</div>
        </div>
        {years.map((y, i) => (
          <div className="card" key={i}>
            <div className="value">{money(y)}</div>
            <div className="label">
              {buckets[i].label}
              {buckets[i].to - buckets[i].from < 11 ? ' (partial)' : ''}
            </div>
          </div>
        ))}
        {start && (
          <div className="card">
            <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>
              years by
            </label>
            <select
              value={yearMode}
              onChange={(ev) => setYearMode(ev.target.value as 'elapsed' | 'calendar')}
            >
              <option value="elapsed">elapsed (Year 1, 2…)</option>
              <option value="calendar">calendar ({start.y}, {start.y + 1}…)</option>
            </select>
          </div>
        )}
        <div className="card">
          <div className="value">{money(avg(monthly.filter((m) => m > 0)))}</div>
          <div className="label">Avg active month</div>
        </div>
      </div>

      <div className="chart-panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>Monthly cost</strong>
          <label>
            stack by{' '}
            <select
              value={stackBy}
              onChange={(ev) => setStackBy(ev.target.value as 'category' | 'environment')}
            >
              <option value="category">category</option>
              <option value="environment">environment</option>
            </select>
          </label>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={stacked.data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e9ef" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} interval={2} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<CostTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {stacked.keys.map((k, i) => (
              <Bar
                key={k}
                dataKey={k}
                stackId="a"
                fill={COLORS[i % COLORS.length]}
                onClick={(_, idx) =>
                  setExplain({
                    kind: 'month',
                    month: (idx as number) + 1,
                    title: `Month ${(idx as number) + 1} — all cost lines`,
                  })
                }
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-panel" style={{ overflowX: 'auto' }}>
        <strong>Category × year</strong>
        <table className="report" style={{ marginTop: 8, width: '100%' }}>
          <thead>
            <tr>
              <th>Category</th>
              {buckets.map((b) => (
                <th key={b.label}>{b.label}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {[...categories.entries()].map(([cat, arr]) => {
              const catYears = bucketTotals(arr, buckets);
              return (
                <tr key={cat}>
                  <td>{CATEGORY_LABELS[cat as ItemCategory]}</td>
                  {catYears.map((v, i) => (
                    <td
                      key={i}
                      className="clickable"
                      title="Click for the lines behind this figure"
                      onClick={() =>
                        setExplain({
                          kind: 'category',
                          category: cat,
                          month: undefined,
                          title: `${CATEGORY_LABELS[cat as ItemCategory]} — all months`,
                        })
                      }
                    >
                      {money(v)}
                    </td>
                  ))}
                  <td>{money(grandTotal(arr))}</td>
                </tr>
              );
            })}
            <tr className="total">
              <td>Grand total</td>
              {years.map((v, i) => (
                <td key={i}>{money(v)}</td>
              ))}
              <td>{money(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <StoragePanel />
    </div>
  );
}

function StoragePanel() {
  const result = useStore((s) => s.result);
  const overageMonths = result.storage.filter((s) => s.overageGB > 0);
  if (overageMonths.length === 0) {
    return (
      <div className="chart-panel">
        <strong>Storage</strong>
        <p className="muted">
          No storage overage: entitled capacity (tenant base + per-license accrual) covers
          the demand of all active environments in every month.
        </p>
      </div>
    );
  }
  const byPool = new Map<
    string,
    { label: string; months: number; maxOver: number; cost: number }
  >();
  for (const s of overageMonths) {
    const cur = byPool.get(s.groupId) ?? {
      label: s.label,
      months: 0,
      maxOver: 0,
      cost: 0,
    };
    cur.months++;
    cur.maxOver = Math.max(cur.maxOver, s.overageGB);
    cur.cost += s.overageCost;
    byPool.set(s.groupId, cur);
  }
  return (
    <div className="chart-panel">
      <strong>Storage overage</strong>
      <table className="report" style={{ marginTop: 8 }}>
        <thead>
          <tr>
            <th>Billed pool</th>
            <th>Months with overage</th>
            <th>Peak overage (GB)</th>
            <th>Total cost</th>
          </tr>
        </thead>
        <tbody>
          {[...byPool.entries()].map(([groupId, v]) => (
            <tr key={groupId}>
              <td>{v.label}</td>
              <td>{v.months}</td>
              <td>{v.maxOver.toFixed(1)}</td>
              <td>{money(v.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="help">
        Overage = MAX(demand of active environments − entitlement, 0) × add-on price,
        computed per month. F&SCM and Dataverse share one data pool and one file pool, so
        spare entitlement in one absorbs demand from the other. Click a month in the chart
        for the full breakdown.
      </p>
    </div>
  );
}

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}
