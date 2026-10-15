/** Pure draft contracts: no token verification/HTTP/DB implementation. */
export type Identity = { verified: boolean; uid: string; workerIds: string[] };
export function bindOffer(actor: Identity, ownerId: string, requestBooking: string, suppliedWorker?: string, suppliedBooking?: string): string {
 if(!actor.verified || !actor.uid) throw new Error('UNAUTHENTICATED');
 if(actor.workerIds.length!==1) throw new Error('IDENTITY_REPAIR_REQUIRED');
 const worker=actor.workerIds[0]; if(!worker) throw new Error('IDENTITY_REPAIR_REQUIRED');
 if(worker!==ownerId || (suppliedWorker!==undefined&&suppliedWorker!==worker) || (suppliedBooking!==undefined&&suppliedBooking!==requestBooking)) throw new Error('FORBIDDEN');
 return worker;
}
export function normalizeStatus(raw: string, authoritativeConfirmed: boolean): string {
 if(raw==='accepted'||raw==='rejected') return authoritativeConfirmed?raw:'unresolved';
 if(raw==='timeout'||raw==='timed_out') return 'timed_out';
 if(['lost','withdrawn','taken'].includes(raw)) return 'lost';
 if(['not_delivered','unreachable','expired_unsent','failed'].includes(raw)) return 'technical';
 return 'unresolved';
}
/** Final allowlist pending live privilege/payload inventory; deny unknown fields. */
export function profileFieldsSafe(fields: string[]): boolean { return fields.length>0 && fields.every(f=>['full_name','photo_url','upi_id'].includes(f)); }
