/** DRAFT: never import from src/ or production Edge Functions.
 * Adapters must supply canonical, known-at evidence. Gates are server assertions, not client settings.
 * This candidate deliberately LOCKS O=12 and A=6; future activation needs a new reviewed formula.
 */
import { f, add, mul, div, clamp, sum, blend, maturity, approx, money, exact, type Fraction } from './rational';
export const FORMULA = 'candidate-v4-phase5-neutral-oa';
export const DAY = 86400000;
export const WINDOWS = { R:30*DAY, Q:90*DAY, J:7*DAY, A:14*DAY };
export const inWindow = (at: number, asOf: number, duration: number) => Number.isSafeInteger(at) && Number.isSafeInteger(asOf) && Number.isSafeInteger(duration) && duration>0 && at>=asOf-duration && at<asOf;
type Base = { key: string; occurredAt: number; knownAt: number; verified: boolean; synthetic?: boolean; revision?: number; supersedesRevision?: number | null };
export type Outcome = Base & { kind: 'success'|'late'|'worker_cancel'|'no_show'|'excluded'; attributed: boolean };
export type Quality = Base & { rating: number; source: 'genuine_rating'|'complaint'; reliabilityIncident?: boolean };
export type Opportunity = Base & { response: 'accept'|'reject'|'none'|'failed'; confirmed: boolean; openAtResponse: boolean; actionableMs: number; trustedVisibility: boolean; eligible: boolean; online: boolean; technicalFailure: boolean; withdrawnEarly: boolean };
export type Completion = Base;
export type Input = { asOf: number; outcomes: Outcome[]; quality: Quality[]; opportunities: Opportunity[]; completions: Completion[]; reliabilityTrusted: boolean; qualityTrusted: boolean; opportunityCoverageTrusted: boolean; latePolicyApproved?: boolean };
export type Result = { formula: string; total: string; components: Record<'R'|'Q'|'O'|'J'|'A',number>; exactComponents: Record<string,string>; validOpportunityCount: number; provisional: boolean; exclusions: string[]; neutralReasons: string[] };
const decay = (asOf: number, at: number, window: number) => f(window-(asOf-at),window);
/** Conflicting duplicates are all quarantined: input order cannot choose an adjudication. */
function canonical<T extends Base>(rows: T[], asOf: number, window: number | undefined, exclusions: string[]): T[] {
  const groups = new Map<string,T[]>();
  for (const row of rows) {
    if (!row || typeof row!=='object' || typeof row.key!=='string' || !row.key || !Number.isSafeInteger(row.occurredAt) || row.occurredAt<0 || !Number.isSafeInteger(row.knownAt) || row.knownAt < row.occurredAt || row.occurredAt >= asOf) { exclusions.push('invalid-or-future-evidence'); continue; }
    if(row.knownAt>asOf) continue; // Replay sees only decisions already known at cutoff.
    groups.set(row.key,[...(groups.get(row.key) ?? []),row]);
  }
  const result: T[] = [];
  for (const [key, values] of [...groups.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0)) {
    const signature = (row: T) => JSON.stringify(Object.entries(row).sort(([a],[b])=>a<b?-1:a>b?1:0));
    const unique = [...new Map(values.map(v=>[signature(v),v])).values()];
    if(unique.length<values.length) exclusions.push(`deduplicated:${key}`);
    let selected = unique[0]; if(!selected) continue;
    if(unique.some(v=>v.revision!==undefined)) {
      unique.sort((a,b)=>(a.revision ?? 0)-(b.revision ?? 0));
      const initial=unique[0]; if(!initial) continue;
      if(unique.some((v,i)=>v.revision!==i+1 || (i===0?v.supersedesRevision!=null:v.supersedesRevision!==i) || v.occurredAt!==initial.occurredAt || (i>0 && v.knownAt<(unique[i-1]?.knownAt ?? 0)))) { exclusions.push(`invalid-revision-chain:${key}`); continue; }
      selected=unique[unique.length-1]; if(!selected) continue;
    } else if(unique.length>1) { exclusions.push(`conflicting:${key}`); continue; }
    if(selected.verified!==true || selected.synthetic===true) { exclusions.push('unverified-or-test'); continue; }
    if(window!==undefined && !inWindow(selected.occurredAt,asOf,window)) continue;
    result.push(selected);
  }
  return result;
}
function validOpportunity(o: Opportunity): boolean {
  if (o.eligible!==true || o.online!==true || o.technicalFailure!==false || o.withdrawnEarly!==false || o.response==='failed' || !Number.isSafeInteger(o.actionableMs) || o.actionableMs<0) return false;
  const confirmedResponse = o.confirmed===true && o.openAtResponse===true && (o.response==='accept'||o.response==='reject');
  return confirmedResponse || (o.response==='none' && o.trustedVisibility===true && o.actionableMs>=15000);
}
export function calculate(input: Input): Result {
  if (!input || !Number.isSafeInteger(input.asOf) || input.asOf<0) throw new Error('Fixed nonnegative asOf required');
  if(![input.outcomes,input.quality,input.opportunities,input.completions].every(Array.isArray) || ![input.reliabilityTrusted,input.qualityTrusted,input.opportunityCoverageTrusted].every(v=>typeof v==='boolean') || (input.latePolicyApproved!==undefined && typeof input.latePolicyApproved!=='boolean')) throw new Error('Malformed input envelope');
  const exclusions: string[] = [], neutralReasons = ['Responsiveness locked at 12: provenance approval pending','Availability locked at 6: duration/attribution approval pending'];
  const assignments = canonical(input.outcomes,input.asOf,WINDOWS.R,exclusions).filter(o=>o.kind==='success'||(o.kind==='late' && input.latePolicyApproved===true && o.attributed===true)||((o.kind==='worker_cancel'||o.kind==='no_show')&&o.attributed===true));
  let R = f(18), Q = f(15), J = f(9);
  if (input.reliabilityTrusted) {
    const successful = assignments.filter(o=>o.kind==='success'), faults = assignments.filter(o=>o.kind!=='success');
    const weighted = (rows: Outcome[], cap: number) => { const weights = rows.map(o=>decay(input.asOf,o.occurredAt,30*DAY)); const mass=sum(weights); const scale=mass.n===0n?f(1):clamp(div(f(cap),mass),f(0),f(1)); return rows.map((o,i)=>({ w:mul(weights[i] ?? f(0),scale),u:o.kind==='success'?f(1):o.kind==='late'?f(3,4):o.kind==='worker_cancel'?f(7,20):f(0) })); };
    const rows=[...weighted(successful,20),...weighted(faults,5)];
    const W=sum(rows.map(r=>r.w)), U=sum(rows.map(r=>mul(r.w,r.u)));
    R=blend(18,mul(f(30),div(add(f(3),U),add(f(5),W))),maturity(assignments.length));
  } else neutralReasons.push('Reliability attribution gate failed');
  const ratings = canonical(input.quality,input.asOf,90*DAY,exclusions).filter(q=>{
    if (!Number.isInteger(q.rating)||q.rating<1||q.rating>5||q.source!=='genuine_rating'||q.reliabilityIncident) { exclusions.push(`quality-policy:${q.key}`); return false; } return true;
  });
  if (input.qualityTrusted) {
    const weights=ratings.map(q=>decay(input.asOf,q.occurredAt,90*DAY)); const mass=sum(weights); const scale=mass.n===0n?f(1):clamp(div(f(50),mass),f(0),f(1)); const W=mul(mass,scale);
    const U=sum(ratings.map((q,i)=>mul(mul(weights[i] ?? f(0),scale),f(q.rating-1,4))));
    Q=blend(15,mul(f(25),div(add(f(6),U),add(f(10),W))),maturity(ratings.length));
  } else neutralReasons.push('Quality provenance gate failed');
  const lifetime = canonical(input.opportunities,input.asOf,undefined,exclusions).filter(validOpportunity);
  const weekly = lifetime.filter(o=>inWindow(o.occurredAt,input.asOf,WINDOWS.J));
  const completions=canonical(input.completions,input.asOf,7*DAY,exclusions);
  if(input.opportunityCoverageTrusted) {
    const c=sum(completions.map(c=>decay(input.asOf,c.occurredAt,7*DAY)));
    const target=mul(f(15),clamp(div(c,f(5)),f(0),f(1)));
    J=clamp(blend(9,target,maturity(weekly.length)),f(9),f(15));
  } else neutralReasons.push('Recent jobs held neutral: opportunity coverage untrusted');
  const components={R,Q,O:f(12),J,A:f(6)};
  const total=money(clamp(sum(Object.values(components)),f(0),f(100)));
  return {formula:FORMULA,total,components:{R:approx(R),Q:approx(Q),O:12,J:approx(J),A:6},exactComponents:Object.fromEntries(Object.entries(components).map(([k,v])=>[k,exact(v)])),validOpportunityCount:lifetime.length,provisional:lifetime.length<10,exclusions:exclusions.sort(),neutralReasons};
}
