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
  byCategoryMonth,
  byEnvMonth,
  CATEGORY_LABELS,
  grandTotal,
  money,
  monthlyTotals,
  yearTotals,
} from '../../engine';
import type { ItemCategory } from '../../engine/types';

const COLORS = ['#0f6cbd', '#77b7e5', '#f2a900', '#8764b8', '#1a7f37', '#d13438', '#5b6675', '#00b7c3'];

export function Dashboard() {
  const estimate = useStore((s) => s.estimate);
  const result = useStore((s) => s.result);
  const setExplain = useStore((s) => s.setExplain);
  const [stackBy, setStackBy] = useState<'category' | 'environment'>('category');

  const months = estimate.horizonMonths;
  const monthly = useMemo(() => monthlyTotals(result.lines, months), [result, months]);
  const years = useMemo(() => yearTotals(monthly), [monthly]);
  const total = grandTotal(monthly);

  const stacked = useMemo(() => {
    const groups =
      stackBy === 'category'
        ? new Map(
            [...byCategoryMonth(result.lines, months)].map(([k, v]) => [
              CATEGORY_LABELS[k],
              v,
            ]),
          )
        : byEnvMonth(result.lines, months);
    const keys = [...groups.keys()];
    const data = Array.from({ length: months }, (_, i) => {
      const row: Record<string, number | string> = { month: `M${i + 1}` };
      for (const k of keys) row[k] = groups.get(k)![i];
      return row;
    });
    return { keys, data };
  }, [result, months, stackBy]);

  const categories = useMemo(() => byCategoryMonth(result.lines, months), [result, months]);

  return (
    <div>
      <div className="cards">
        <div className="card">
          <div className="value">{money(total)}</div>
          <div className="label">Total over {months} months</div>
        </div>
        {years.map((y, i) => (
          <div
            className="card clickable"
            key={i}
            title="Click a month in the table below for detail"
          >
            <div className="value">{money(y)}</div>
            <div className="label">Year {i + 1}</div>
          </div>
        ))}
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
            <Tooltip formatter={(v: number) => money(v)} />
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
              {years.map((_, i) => (
                <th key={i}>Year {i + 1}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {[...categories.entries()].map(([cat, arr]) => {
              const catYears = yearTotals(arr);
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
  const byPool = new Map<string, { months: number; maxOver: number; cost: number }>();
  for (const s of overageMonths) {
    const cur = byPool.get(s.pool) ?? { months: 0, maxOver: 0, cost: 0 };
    cur.months++;
    cur.maxOver = Math.max(cur.maxOver, s.overageGB);
    cur.cost += s.overageCost;
    byPool.set(s.pool, cur);
  }
  return (
    <div className="chart-panel">
      <strong>Storage overage</strong>
      <table className="report" style={{ marginTop: 8 }}>
        <thead>
          <tr>
            <th>Pool</th>
            <th>Months with overage</th>
            <th>Peak overage (GB)</th>
            <th>Total cost</th>
          </tr>
        </thead>
        <tbody>
          {[...byPool.entries()].map(([pool, v]) => (
            <tr key={pool}>
              <td>{pool}</td>
              <td>{v.months}</td>
              <td>{v.maxOver.toFixed(1)}</td>
              <td>{money(v.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="help">
        Overage = MAX(demand of active environments − entitlement, 0) × add-on price,
        computed per month. Click a month in the chart for the full breakdown.
      </p>
    </div>
  );
}

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}
