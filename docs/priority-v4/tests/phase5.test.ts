import { describe, test, expect } from 'bun:test';
import { calculate, DAY, WINDOWS, inWindow, type Input, type Quality, type Outcome } from '../engine/calculate';
import { shouldPublish } from '../engine/projection';
import { maturity, exact } from '../engine/rational';
import { AS_OF, empty, outcomes, opportunities } from './fixtures';

describe('Phase 5 pure boundary contracts',()=>{
 for(const [lane,days] of [['R',30],['Q',90],['A',14],['J',7]] as const) {
  for(const [offset,accepted] of [[-1,false],[0,true],[1,true]] as const) {
   test(`${lane} ${days}-day lower boundary ${offset}ms`,()=>expect(inWindow(AS_OF-days*DAY+offset,AS_OF,WINDOWS[lane])).toBe(accepted));
  }
  test(`${lane} upper boundary excludes asOf`,()=>expect(inWindow(AS_OF,AS_OF,WINDOWS[lane])).toBe(false));
  test(`${lane} just before asOf included`,()=>expect(inWindow(AS_OF-1,AS_OF,WINDOWS[lane])).toBe(true));
 }
 test('14-day predicate is NOT availability scoring integration',()=>{
  expect(inWindow(AS_OF-14*DAY,AS_OF,WINDOWS.A)).toBe(true);
  expect(calculate(empty()).components.A).toBe(6);
 });
 for(const lane of ['R','Q','J'] as const) {
  for(const offset of [-1,0,1]) {
   test(`${lane} calculator exact lower boundary ${offset}ms`,()=>{
    const e=empty(); const duration=WINDOWS[lane];
    const at=AS_OF-duration+offset;
    if(lane==='R') e.outcomes=outcomes(10).map(o=>({...o,occurredAt:at,knownAt:at}));
    if(lane==='Q') e.quality=outcomes(10).map(o=>({...o,occurredAt:at,knownAt:at,rating:5,source:'genuine_rating'}));
    if(lane==='J') {e.opportunityCoverageTrusted=true;e.opportunities=opportunities(10).map(o=>({...o,occurredAt:at,knownAt:at}));e.completions=outcomes(10);}
    const r=calculate(e);
    if(offset<0) expect(r.components[lane]).toBe(lane==='R'?18:lane==='Q'?15:9);
    else if(lane==='J') expect(r.components.J).toBe(15);
    else if(offset===0) expect(r.components[lane]).toBe(lane==='R'?18:15); // included, but zero decay mass
    else expect(r.components[lane]).toBeGreaterThan(lane==='R'?18:15);
   });
  }
 }
});

describe('Phase 5 rational mass and maturity',()=>{
 test('success mass saturates at exactly 20',()=>{
  for(const n of [21,100,500]) {
   const r=calculate({...empty(),outcomes:outcomes(n)});
   expect(r.exactComponents.R).toBe('138/5');
  }
 });
 test('fault mass saturates at exactly 5',()=>{
  for(const n of [10,100,500]) expect(calculate({...empty(),outcomes:outcomes(n,'no_show')}).exactComponents.R).toBe('9/1');
 });
 test('success and fault caps are separate, not a shared cap',()=>{
  const faults=outcomes(100,'no_show').map(o=>({...o,key:`fault:${o.key}`}));
  expect(calculate({...empty(),outcomes:[...outcomes(100),...faults]}).exactComponents.R).toBe('23/1');
 });
 for(let n=0;n<=11;n++) {
  test(`sample maturity ${n}`,()=>expect(exact(maturity(n))).toBe(exact(maturity(Math.min(10,Math.max(5,n))))));
 }
 test('five through ten monotonic maturity fractions',()=>{
  expect([5,6,7,8,9,10].map(n=>exact(maturity(n)))).toEqual(['0/1','1/5','2/5','3/5','4/5','1/1']);
  const scores=[5,6,7,8,9,10].map(n=>calculate({...empty(),outcomes:outcomes(n)}).components.R);
  expect(scores[0]).toBe(18);
  for(let i=1;i<scores.length;i++) expect(scores[i]).toBeGreaterThan(scores[i-1] ?? 0);
 });
 test('quality mass cap is exactly 50',()=>expect(calculate({...empty(),quality:outcomes(100).map(o=>({...o,rating:5,source:'genuine_rating'}))}).exactComponents.Q).toBe('70/3'));
});

describe('Phase 5 corrected incident replay',()=>{
 const faultChain=(): Outcome[] => outcomes(10,'no_show').flatMap(o=>[
  {...o,revision:1,supersedesRevision:null},
  {...o,kind:'excluded' as const,revision:2,supersedesRevision:1,knownAt:AS_OF-100}
 ]);
 test('corrected excluded incidents recover prior, not counted twice',()=>expect(calculate({...empty(),outcomes:faultChain()}).components.R).toBe(18));
 test('replay before correction retains original fault',()=>expect(calculate({...empty(),asOf:AS_OF-200,outcomes:faultChain()}).components.R).toBeLessThan(18));
 test('duplicate complete correction chain idempotent',()=>expect(calculate({...empty(),outcomes:[...faultChain(),...faultChain()]}).total).toBe('60.00'));
 test('complete correction chain order deterministic',()=>expect(calculate({...empty(),outcomes:faultChain().reverse()})).toEqual(calculate({...empty(),outcomes:faultChain()})));
 for(const [name,patch] of [
  ['gap',{revision:3,supersedesRevision:1}],
  ['wrong predecessor',{revision:2,supersedesRevision:9}],
  ['earlier decision',{revision:2,supersedesRevision:1,knownAt:AS_OF-700}],
  ['moved event',{revision:2,supersedesRevision:1,occurredAt:AS_OF-900}],
  ['noninteger revision',{revision:1.5,supersedesRevision:1}]
 ] as const) test(`quarantine ${name}`,()=>{
  const rows=outcomes(10,'no_show').flatMap(o=>[{...o,revision:1},{...o,...patch}]);
  expect(calculate({...empty(),outcomes:rows}).components.R).toBe(18);
 });
 test('unverified latest decision never falls back to superseded blame',()=>expect(calculate({...empty(),outcomes:faultChain().map(o=>o.revision===2?{...o,verified:false}:o)}).components.R).toBe(18));
 test('missing original revision quarantined',()=>expect(calculate({...empty(),outcomes:faultChain().filter(o=>o.revision===2)}).components.R).toBe(18));
});

describe('Phase 5 rating and malformed input',()=>{
 for(const rating of [1,2,3,4,5]) test(`integer rating ${rating} accepted`,()=>{
  const q:Quality[]=outcomes(10).map(o=>({...o,rating,source:'genuine_rating'}));
  expect(calculate({...empty(),quality:q}).exclusions).toEqual([]);
 });
 for(const rating of [0,6,-1,1.5,3.5,NaN,Infinity,-Infinity,'5',null]) test(`reject rating ${String(rating)}`,()=>{
  const q=outcomes(10).map(o=>({...o,rating,source:'genuine_rating'})) as Quality[];
  expect(calculate({...empty(),quality:q}).components.Q).toBe(15);
 });
 for(const [name,patch] of [
  ['NaN time',{occurredAt:NaN}],['infinite knownAt',{knownAt:Infinity}],['negative time',{occurredAt:-1}],['fractional time',{occurredAt:AS_OF-1.5}],['known before event',{knownAt:AS_OF-2000}],['empty key',{key:''}],['nonboolean verification',{verified:'true'}]
 ] as const) test(`malformed row ${name}`,()=>expect(calculate({...empty(),outcomes:outcomes(10).map(o=>({...o,...patch})) as Outcome[]}).total).toBe('60.00'));
 test('null row quarantined without crashing',()=>expect(calculate({...empty(),outcomes:[null] as unknown as Outcome[]}).total).toBe('60.00'));
 for(const patch of [{outcomes:null},{quality:{}},{opportunities:'rows'},{completions:undefined},{reliabilityTrusted:'yes'},{latePolicyApproved:'yes'}]) test(`invalid envelope ${Object.keys(patch)[0]}`,()=>expect(()=>calculate({...empty(),...patch} as unknown as Input)).toThrow());
 test('malformed actionable duration never matures onboarding',()=>{
  for(const actionableMs of [-1,NaN,Infinity,1.2]) expect(calculate({...empty(),opportunities:opportunities(10).map(o=>({...o,actionableMs}))}).validOpportunityCount).toBe(0);
 });
});

describe('Phase 5 aging, locks and correction tuple',()=>{
 test('zero history all priors and exact 60',()=>{
  const r=calculate(empty()); expect(r.total).toBe('60.00'); expect(r.exactComponents).toEqual({R:'18/1',Q:'15/1',O:'12/1',J:'9/1',A:'6/1'});
 });
 test('fault aging recovers and cannot become a persistent deduction',()=>{
  const e={...empty(),outcomes:outcomes(10,'no_show')};
  const now=calculate(e),later=calculate({...e,asOf:AS_OF+15*DAY}),expired=calculate({...e,asOf:AS_OF+30*DAY});
  expect(later.components.R).toBeGreaterThan(now.components.R);expect(expired.components.R).toBe(18);
 });
 test('quality reward ages back to neutral',()=>{
  const e={...empty(),quality:outcomes(10).map(o=>({...o,rating:5,source:'genuine_rating' as const}))};
  expect(calculate({...e,asOf:AS_OF+45*DAY}).components.Q).toBeLessThan(calculate(e).components.Q);
  expect(calculate({...e,asOf:AS_OF+90*DAY}).components.Q).toBe(15);
 });
 test('weekly reward ages to floor but lifetime maturity remains',()=>{
  const e={...empty(),opportunityCoverageTrusted:true,opportunities:opportunities(10),completions:outcomes(10)};
  const r=calculate({...e,asOf:AS_OF+7*DAY});expect(r.components.J).toBe(9);expect(r.provisional).toBe(false);
 });
 test('O and A stay locked across aging corrections and trust failures',()=>{
  for(const asOf of [AS_OF,AS_OF+14*DAY,AS_OF+90*DAY]) {
   const r=calculate({...empty(),asOf,outcomes:outcomes(100,'no_show'),opportunities:opportunities(100),opportunityCoverageTrusted:true});
   expect(r.components.O).toBe(12);expect(r.components.A).toBe(6);
  }
 });
 for(const [name,current,next,allowed] of [
  ['first',undefined,{asOf:AS_OF,revision:1},true],
  ['equal replay',{asOf:AS_OF,revision:1},{asOf:AS_OF,revision:1},false],
  ['same-time correction',{asOf:AS_OF,revision:1},{asOf:AS_OF,revision:2},true],
  ['stale correction',{asOf:AS_OF,revision:3},{asOf:AS_OF,revision:2},false],
  ['old timestamp high revision',{asOf:AS_OF,revision:1},{asOf:AS_OF-1,revision:100},false],
  ['new timestamp resets revision',{asOf:AS_OF,revision:100},{asOf:AS_OF+1,revision:1},true]
 ] as const) test(`projection ${name} (pure, not DB concurrency)`,()=>expect(shouldPublish(current,next)).toBe(allowed));
 test('invalid calculation position rejected',()=>expect(()=>shouldPublish(undefined,{asOf:AS_OF,revision:0})).toThrow());
 test('deterministic recalculation with all lanes and reversals',()=>{
  const e={...empty(),outcomes:outcomes(20),quality:outcomes(12).map(o=>({...o,rating:4,source:'genuine_rating' as const})),opportunities:opportunities(10),completions:outcomes(8),opportunityCoverageTrusted:true};
  expect(calculate(e)).toEqual(calculate(e));
  expect(calculate({...e,outcomes:e.outcomes.reverse(),quality:e.quality.reverse(),opportunities:e.opportunities.reverse(),completions:e.completions.reverse()})).toEqual(calculate(e));
 });
});