/** Draft only. Exact rational arithmetic, no runtime imports or ambient services. */
export type Fraction = { n: bigint; d: bigint };
const gcd = (a: bigint, b: bigint): bigint => { a = a < 0n ? -a : a; while (b) { const t = a % b; a = b; b = t; } return a || 1n; };
export function f(n: number | bigint, d: number | bigint = 1): Fraction {
  if ((typeof n === 'number' && !Number.isSafeInteger(n)) || (typeof d === 'number' && !Number.isSafeInteger(d))) throw new Error('Integer rational input required');
  let nn = BigInt(n), dd = BigInt(d); if (dd === 0n) throw new Error('Zero denominator');
  if (dd < 0n) { nn = -nn; dd = -dd; } const g = gcd(nn, dd); return { n: nn / g, d: dd / g };
}
export const add = (a: Fraction, b: Fraction) => f(a.n*b.d+b.n*a.d,a.d*b.d);
export const sub = (a: Fraction, b: Fraction) => f(a.n*b.d-b.n*a.d,a.d*b.d);
export const mul = (a: Fraction, b: Fraction) => f(a.n*b.n,a.d*b.d);
export const div = (a: Fraction, b: Fraction) => f(a.n*b.d,a.d*b.n);
export const cmp = (a: Fraction, b: Fraction) => a.n*b.d < b.n*a.d ? -1 : a.n*b.d > b.n*a.d ? 1 : 0;
export const clamp = (v: Fraction, lo: Fraction, hi: Fraction) => cmp(v,lo)<0 ? lo : cmp(v,hi)>0 ? hi : v;
export const sum = (v: Fraction[]) => v.reduce(add,f(0));
export const blend = (baseline: number, target: Fraction, g: Fraction) => add(f(baseline),mul(sub(target,f(baseline)),g));
export const maturity = (n: number, m = 5) => clamp(f(n-m,m),f(0),f(1));
export const approx = (v: Fraction) => Number(v.n)/Number(v.d);
/** Nonnegative ROUND_HALF_UP; total rounded once, formatted with exactly two decimals. */
export function money(v: Fraction): string { if (v.n < 0n) throw new Error('Negative total'); const cents = (v.n*200n + v.d)/(2n*v.d); return `${cents/100n}.${String(cents%100n).padStart(2,'0')}`; }
export const exact = (v: Fraction) => `${v.n}/${v.d}`;
