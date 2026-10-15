import type { Input, Outcome, Opportunity } from '../engine/calculate';
export const AS_OF = 1800000000000;
const base = (key: string) => ({key,occurredAt:AS_OF-1000,knownAt:AS_OF-500,verified:true});
export const empty = (): Input => ({asOf:AS_OF,outcomes:[],quality:[],opportunities:[],completions:[],reliabilityTrusted:true,qualityTrusted:true,opportunityCoverageTrusted:false});
export const outcomes = (n: number, kind: Outcome['kind']='success'): Outcome[] => Array.from({length:n},(_,i)=>({...base(`assignment:${i}`),kind,attributed:true}));
export const opportunities = (n: number, response: Opportunity['response']='accept'): Opportunity[] => Array.from({length:n},(_,i)=>({...base(`round:${i}`),response,confirmed:response==='accept'||response==='reject',openAtResponse:true,actionableMs:15000,trustedVisibility:true,eligible:true,online:true,technicalFailure:false,withdrawnEarly:false}));
