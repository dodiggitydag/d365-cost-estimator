import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { defaultConfig } from '../src/model/config';
import { newEstimate } from '../src/model/estimate';
import { computeEstimate, grandTotal, monthlyTotals } from '../src/engine';
import { buildWorkbook } from '../src/export/xlsx';

describe('xlsx export', () => {
  it('Report sheet grand total matches the engine', async () => {
    const config = defaultConfig();
    const est = newEstimate(config.pricing.version);
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
  });
});
