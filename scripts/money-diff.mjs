/**
 * Diff two money snapshots. Any changed value is a data-loss finding.
 *
 * Usage: node scripts/money-diff.mjs before.json after.json
 */
import { readFileSync } from 'node:fs';

const before = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const after = JSON.parse(readFileSync(process.argv[3], 'utf8'));

let compared = 0;
const diffs = [];

for (const table of Object.keys(before)) {
  const b = before[table];
  const a = after[table] ?? [];

  if (b.length !== a.length) {
    diffs.push(`${table}: row count ${b.length} -> ${a.length}`);
    continue;
  }

  for (let i = 0; i < b.length; i += 1) {
    for (const field of Object.keys(b[i])) {
      compared += 1;
      const bv = b[i][field];
      const av = a[i][field];
      // Decimal stringifies without a trailing ".0"; treat 5130 and 5130.0
      // as equal by comparing numerically when both parse as numbers.
      const same =
        bv === av ||
        (bv !== null && av !== null && Number(bv) === Number(av));
      if (!same) {
        diffs.push(`${table}[${i}].${field}: "${bv}" -> "${av}"`);
      }
    }
  }
}

console.log(`values compared: ${compared}`);
if (diffs.length === 0) {
  console.log('NO DATA LOSS — every value identical');
} else {
  console.log(`DIFFERENCES: ${diffs.length}`);
  for (const d of diffs.slice(0, 30)) console.log(`  ${d}`);
  process.exitCode = 1;
}
