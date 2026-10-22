import { afterAll, describe, expect, it } from 'vitest';
import { CASES, type Row } from './cases.ts';

const table: Row[] = [];

describe('acceptance: the spec table against the Python prototype', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const rows = c.run();
      table.push(...rows);
      for (const row of rows) expect(row.pass, `${row.name}: ${row.measured}, want ${row.expected}`).toBe(true);
    });
  }
  afterAll(() => {
    const lines = table.map((r) => `${r.pass ? 'pass' : 'FAIL'}  ${r.name.padEnd(60)} ${r.measured.padEnd(32)} want ${r.expected}`);
    console.log(['', ...lines].join('\n'));
  });
});
