import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { defaultConfig } from '../src/model/config';
import { newEstimate } from '../src/model/estimate';
import { computeEstimate, grandTotal, monthlyTotals } from '../src/engine';
import { buildWorkbook } from '../src/export/xlsx';

const NL = String.fromCharCode(10);

describe('xlsx export', () => {
  it('Report sheet grand total matches the engine', async () => {
    const config = defaultConfig();
    const est = newEstimate(config);
    est.licenseCostMode = { kind: 'lumpSum', monthlyTotal: 5000 };
    const result = computeEstimate(est, config);
    const engineTotal = grandTotal(monthlyTotals(result.lines, est.horizonMonths));

    const buffer = await buildWorkbook(est, config, result);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);

    const report = wb.getWorksheet('Report')!;
    let grandRow: ExcelJS.Row | undefined;
    report.eachRow((row) => {
      if (row.getCell(1).value === 'Grand total') grandRow = row;
    });
    expect(grandRow).toBeDefined();
    const exported = grandRow!.getCell(2 + est.horizonMonths).value as number;
    expect(exported).toBeCloseTo(engineTotal, 2);

    // Sheets present
    for (const name of ['Inputs', 'Schedule', 'Worksheet', 'Report', 'By Environment', 'Assumptions']) {
      expect(wb.getWorksheet(name), name).toBeDefined();
    }

    // Disclaimer present on Assumptions
    const assumptions = wb.getWorksheet('Assumptions')!;
    expect(String(assumptions.getRow(1).getCell(1).value)).toContain('BUDGETARY');
    // A healthy estimate carries no warning block
    let text = '';
    assumptions.eachRow((row) => {
      text += String(row.getCell(1).value ?? '') + NL;
    });
    expect(text).not.toContain('SCHEDULE WARNINGS');
  });

  it('schedule warnings travel with the workbook', async () => {
    const config = defaultConfig();
    const est = newEstimate(config);
    // Prepare before Implement: several environments end up with no months.
    est.rollouts[0].phases = [
      { id: 'p1', kind: 'implement', name: 'Implement', startMonth: 20, lengthMonths: 4 },
      { id: 'p2', kind: 'prepare', name: 'Prepare', startMonth: 5, lengthMonths: 2 },
      { id: 'p3', kind: 'operate', name: 'Operate', startMonth: 24, lengthMonths: 13 },
    ];
    const result = computeEstimate(est, config);
    expect(result.warnings.length).toBeGreaterThan(0);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildWorkbook(est, config, result));
    let text = '';
    wb.getWorksheet('Assumptions')!.eachRow((row) => {
      text += String(row.getCell(1).value ?? '') + NL;
    });
    expect(text).toContain('SCHEDULE WARNINGS');
    expect(text).toContain('no active months');
  });
});
