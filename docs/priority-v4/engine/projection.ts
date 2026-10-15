/** Pure tuple contract; does not implement PostgreSQL locking or transaction isolation. */
export type Position = { asOf: number; revision: number };
function validate(p: Position) {
  if(!Number.isSafeInteger(p.asOf) || p.asOf<0 || !Number.isSafeInteger(p.revision) || p.revision<1) throw new Error('Invalid calculation position');
}
export function shouldPublish(current: Position | undefined, next: Position): boolean {
  validate(next); if(!current) return true; validate(current);
  return next.asOf>current.asOf || (next.asOf===current.asOf && next.revision>current.revision);
}