/**
 * Phase 4.5 verification — decimal arithmetic is exact.
 *
 * Each case is chosen because IEEE-754 doubles get it wrong. If these pass,
 * the migration achieved what it was for.
 */
// Direct module paths: Node's ESM resolver needs explicit extensions, and
// the barrel re-exports without them.
import { calcLine, calcDocument, dec } from '../packages/domain/src/sales.ts';
import { formatMoney } from '../packages/domain/src/money.ts';

const results = [];
function check(name, pass, detail = '') {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

// ── The classic float failure ───────────────────────────────
check(
  '0.1 + 0.2 === 0.3',
  dec('0.1').plus(dec('0.2')).equals(dec('0.3')),
  `float gives ${0.1 + 0.2}`,
);

// ── A line that floats round wrong ──────────────────────────
// 3 × 0.1 is 0.30000000000000004 in float.
const l1 = calcLine({ quantity: 3, unitPrice: '0.1' });
check('3 × 0.10 = 0.30 exactly', l1.gross.equals(dec('0.3')), `got ${l1.gross.toString()}`);

// 3 × 1.1 is 3.3000000000000003 in float. Asserting the float failure too,
// so this case cannot quietly stop demonstrating anything.
check('float 3 × 1.1 !== 3.3 (the problem)', 3 * 1.1 !== 3.3, `float ${3 * 1.1}`);
const l2 = calcLine({ quantity: 3, unitPrice: '1.1' });
check(
  'decimal 3 × 1.1 === 3.3 (the fix)',
  l2.gross.equals(dec('3.3')),
  `decimal ${l2.gross.toString()}`,
);

// ── Tax applies to the discounted net, not the gross ────────
const l3 = calcLine({ quantity: 10, unitPrice: 100, discountPercent: 10, taxRate: 14 });
check('gross 1000', l3.gross.equals(dec(1000)));
check('discount 100', l3.discount.equals(dec(100)));
check('net 900', l3.net.equals(dec(900)));
check('tax on NET not gross = 126', l3.taxAmount.equals(dec(126)), `got ${l3.taxAmount}`);
check('line total 1026', l3.lineTotal.equals(dec(1026)));

// ── Discount can never drive a line negative ────────────────
const l4 = calcLine({ quantity: 1, unitPrice: 50, discountAmount: 500 });
check('discount clamped at gross', l4.net.equals(dec(0)), `net=${l4.net}`);

// ── Accumulation across many lines ──────────────────────────
// 100 lines of 0.07 is 7.000000000000001 in float.
const many = Array.from({ length: 100 }, () => calcLine({ quantity: 1, unitPrice: '0.07' }));
const doc = calcDocument(many);
check(
  '100 × 0.07 accumulates to exactly 7.00',
  doc.subtotal.equals(dec(7)),
  `got ${doc.subtotal.toString()}, float ${Array.from({ length: 100 }).reduce((s) => s + 0.07, 0)}`,
);

// ── Real KAYAN case: the quotation created in Phase 4 ───────
const kayan = calcLine({ quantity: 25, unitPrice: 180, taxRate: 14 });
const kayanDoc = calcDocument([kayan]);
check('25 × 180 = 4500', kayan.net.equals(dec(4500)));
check('14% tax = 630', kayan.taxAmount.equals(dec(630)));
check('total 5130 — matches the pre-migration document', kayanDoc.total.equals(dec(5130)));

// ── Display formatting ──────────────────────────────────────
check('formatMoney pads to 2dp', formatMoney(5130) === '5130.00', formatMoney(5130));
check('formatMoney rounds half up', formatMoney('1.005') === '1.01', formatMoney('1.005'));

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
if (passed !== results.length) process.exitCode = 1;
