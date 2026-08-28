import ExcelJS from 'exceljs';
import type {
  Estimate,
  EstimateResult,
  EstimatorConfig,
  ItemCategory,
} from '../engine/types';
import {
  bucketTotals,
  byCategoryMonth,
  byEnvMonth,
  CATEGORY_LABELS,
  grandTotal,
  monthLabel,
  monthlyTotals,
  parseYearMonth,
  yearBuckets,
} from '../engine/aggregate';
import { subscriptionStartMonth } from '../engine/licensing';
import { mirrorsProdStorage, mirrorSourceFor } from '../engine/storage';
import { STORAGE_POOLS, STORAGE_POOL_LABELS } from '../engine/types';
import { isoDateStamp, triggerDownload } from '../model/persistence';

const MONEY_FMT = '#,##0.00;[Red]-#,##0.00';

export async function exportXlsx(
  estimate: Estimate,
  config: EstimatorConfig,
  result: EstimateResult,
): Promise<void> {
  const buffer = await buildWorkbook(estimate, config, result);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const safeName = estimate.meta.name.replace(/[^\w\- ]+/g, '').trim() || 'estimate';
  triggerDownload(`${safeName} ${isoDateStamp()}.xlsx`, blob);
}

/** Pure workbook construction — no DOM; unit-testable. */
export async function buildWorkbook(
  estimate: Estimate,
  config: EstimatorConfig,
  result: EstimateResult,
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'D365 F&SCM Cost Estimator';
  const months = estimate.horizonMonths;
  const start = parseYearMonth(estimate.startYearMonth);
  const monthHeaders = Array.from({ length: months }, (_, i) =>
    monthLabel(i + 1, start),
  );

  // --- Inputs -------------------------------------------------------------
  const inputs = wb.addWorksheet('Inputs');
  inputs.columns = [{ width: 42 }, { width: 60 }];
  const addKV = (k: string, v: string | number) => inputs.addRow([k, v]);
  addKV('Estimate', estimate.meta.name);
  addKV('Created', estimate.meta.createdAt);
  addKV('Catalog version', estimate.meta.catalogVersion);
  addKV('Horizon (months)', months);
  if (estimate.startYearMonth) addKV('Anticipated start', estimate.startYearMonth);
  addKV('Concurrent developers', estimate.team.concurrentDevs);
  addKV('Functional consultants', estimate.team.functionalConsultants);
  addKV('Solution architects', estimate.team.solutionArchitects);
  addKV('Microsoft-hosted ADO agents', estimate.team.hostedAgents);
  addKV(
    'License cost mode',
    estimate.licenseCostMode.kind === 'lumpSum'
      ? `Negotiated total: $${estimate.licenseCostMode.monthlyTotal}/mo`
      : 'Computed from list prices',
  );
  addKV('Subscriptions start', `Month ${subscriptionStartMonth(estimate)} (first count step with users)`);
  addKV('PROD lead time (months)', estimate.settings.prodLeadMonths);
  const growth = STORAGE_POOLS.map((pool) => {
    const gb = estimate.settings.prodGrowthGBPerYear?.[pool] ?? 0;
    return gb > 0 ? `${STORAGE_POOL_LABELS[pool]}: ${gb}` : null;
  }).filter(Boolean);
  addKV('PROD storage growth (GB/yr)', growth.length ? growth.join(', ') : 'none');
  const mirroring = result.schedule.instances
    .filter((inst) => mirrorsProdStorage(inst, config) && mirrorSourceFor(result.schedule, config, inst))
    .map((inst) => inst.name);
  addKV('Mirrors PROD storage after go-live', mirroring.length ? mirroring.join(', ') : 'none');
  for (const r of estimate.rollouts) {
    addKV(
      `${r.name} phases`,
      r.phases.map((p) => `${p.name} (M${p.startMonth}+${p.lengthMonths})`).join(', '),
    );
  }
  for (const g of result.goLiveMonths) {
    addKV(`Go-live (${g.rolloutId})`, `Month ${g.month}`);
  }
  for (const step of estimate.licenseSteps) {
    addKV(
      `Licenses from month ${step.fromMonth}`,
      Object.entries(step.counts)
        .filter(([, n]) => n > 0)
        .map(([id, n]) => `${id}: ${n}`)
        .join(', ') || 'none',
    );
  }
  inputs.getColumn(1).font = { bold: true };

  // --- Schedule -----------------------------------------------------------
  const sched = wb.addWorksheet('Schedule');
  sched.addRow(['Environment', ...monthHeaders]);
  for (const inst of result.schedule.instances) {
    const row = sched.addRow([
      inst.name,
      ...result.schedule.cells[inst.id].map((c) => (c.active ? 1 : '')),
    ]);
    result.schedule.cells[inst.id].forEach((c, i) => {
      const cell = row.getCell(i + 2);
      if (c.active) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: c.overridden ? 'FFF2A900' : 'FF0F6CBD' },
        };
        cell.font = { color: { argb: 'FFFFFFFF' }, size: 9 };
      } else if (c.overridden) {
        cell.fill = { type: 'pattern', pattern: 'lightUp', fgColor: { argb: 'FFF2A900' } };
      }
    });
  }
  styleHeader(sched, months);
  sched.addRow([]);
  sched.addRow(['Orange = manually overridden cell; blue = scheduled by methodology rule.']);

  // --- Worksheet (line items × months) --------------------------------------
  const detail = wb.addWorksheet('Worksheet');
  detail.addRow(['Line item', 'Category', 'Environment', ...monthHeaders, 'Total']);
  const byLabel = new Map<string, { category: string; env: string; byMonth: number[] }>();
  for (const line of result.lines) {
    const env = line.envInstanceId ?? '';
    const key = `${line.label}|${env}`;
    let entry = byLabel.get(key);
    if (!entry) {
      entry = {
        category: CATEGORY_LABELS[line.category],
        env,
        byMonth: new Array(months).fill(0),
      };
      byLabel.set(key, entry);
    }
    entry.byMonth[line.month - 1] += line.amount;
  }
  for (const [key, e] of byLabel) {
    const label = key.split('|')[0];
    const row = detail.addRow([
      label,
      e.category,
      e.env,
      ...e.byMonth.map((v) => (v ? round2(v) : '')),
      round2(e.byMonth.reduce((a, b) => a + b, 0)),
    ]);
    for (let c = 4; c <= 4 + months; c++) row.getCell(c).numFmt = MONEY_FMT;
  }
  styleHeader(detail, months + 3);
  detail.getColumn(1).width = 44;
  detail.getColumn(2).width = 26;
  detail.getColumn(3).width = 14;

  // --- Report (category × month) -------------------------------------------
  const report = wb.addWorksheet('Report');
  report.addRow(['Category', ...monthHeaders, 'Total']);
  const cats = byCategoryMonth(result.lines, months);
  for (const [cat, arr] of cats) {
    const row = report.addRow([
      CATEGORY_LABELS[cat as ItemCategory],
      ...arr.map(round2),
      round2(grandTotal(arr)),
    ]);
    for (let c = 2; c <= 2 + months; c++) row.getCell(c).numFmt = MONEY_FMT;
  }
  const monthly = monthlyTotals(result.lines, months);
  const totalRow = report.addRow(['Grand total', ...monthly.map(round2), round2(grandTotal(monthly))]);
  totalRow.font = { bold: true };
  for (let c = 2; c <= 2 + months; c++) totalRow.getCell(c).numFmt = MONEY_FMT;
  report.addRow([]);
  const elapsed = yearBuckets(months, null);
  bucketTotals(monthly, elapsed).forEach((y, i) => {
    const r = report.addRow([elapsed[i].label, round2(y)]);
    r.getCell(2).numFmt = MONEY_FMT;
  });
  if (start) {
    report.addRow([]);
    const calendar = yearBuckets(months, start);
    bucketTotals(monthly, calendar).forEach((y, i) => {
      const r = report.addRow([`CY ${calendar[i].label}`, round2(y)]);
      r.getCell(2).numFmt = MONEY_FMT;
    });
  }
  styleHeader(report, months + 1);
  report.getColumn(1).width = 30;

  // --- Per-environment rollup ------------------------------------------------
  const envSheet = wb.addWorksheet('By Environment');
  envSheet.addRow(['Environment', ...monthHeaders, 'Total']);
  for (const [env, arr] of byEnvMonth(result.lines, months)) {
    const inst = result.schedule.instances.find((i) => i.id === env);
    const row = envSheet.addRow([
      inst?.name ?? env,
      ...arr.map(round2),
      round2(grandTotal(arr)),
    ]);
    for (let c = 2; c <= 2 + months; c++) row.getCell(c).numFmt = MONEY_FMT;
  }
  styleHeader(envSheet, months + 1);
  envSheet.getColumn(1).width = 24;

  // --- Assumptions -----------------------------------------------------------
  const assumptions = wb.addWorksheet('Assumptions');
  assumptions.columns = [{ width: 44 }, { width: 14 }, { width: 12 }, { width: 60 }, { width: 12 }];
  assumptions.addRow([
    'BUDGETARY ESTIMATE ONLY — USD list prices as of the dates below. Actual pricing varies by agreement (EA/CSP, discounts). No inflation or future Microsoft price changes are assumed. Environments are created, destroyed, and rescheduled as needed to support efficient project work.',
  ]).font = { bold: true };
  assumptions.addRow([]);
  // Schedule problems travel with the workbook: a reviewer looking at an empty
  // environment row on the Schedule sheet needs to know it was a mistake, not a choice.
  if (result.warnings.length > 0) {
    assumptions.addRow([`SCHEDULE WARNINGS (${result.warnings.length})`]).font = {
      bold: true,
    };
    for (const w of result.warnings) assumptions.addRow([w.message]);
    assumptions.addRow([]);
  }
  const hdr = assumptions.addRow(['Price', 'Value', 'Unit', 'Source', 'As of']);
  hdr.font = { bold: true };
  for (const p of config.pricing.entries) {
    const r = assumptions.addRow([p.label, p.value, p.unit, p.guideSection ?? p.sourceUrl, p.asOf]);
    r.getCell(2).numFmt = MONEY_FMT;
    r.getCell(4).value = { text: p.guideSection ?? p.sourceUrl, hyperlink: p.sourceUrl };
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

function styleHeader(ws: ExcelJS.Worksheet, cols: number): void {
  const row = ws.getRow(1);
  row.font = { bold: true };
  for (let c = 1; c <= cols + 1; c++) {
    row.getCell(c).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF2F4F7' },
    };
  }
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
