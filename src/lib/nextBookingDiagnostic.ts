// Temporary preview-only verification for Next Booking (approved: read-only, authenticated verification only).
// Never active in the published site, custom domain or the Android app. Never exposes tokens, ids, phones or names.
export type DiagnosticContract = "valid" | "different" | null;
export interface NextBookingDiagnostic {
  signedIn: boolean;
  httpStatus: number | null;
  safeError: string | null;
  contract: DiagnosticContract;
  shape: string[];
  numbers: string[];
}
export const emptyDiagnostic = (signedIn: boolean): NextBookingDiagnostic => ({ signedIn, httpStatus: null, safeError: null, contract: null, shape: [], numbers: [] });

export function isPreviewVerificationHost(hostname: string, native: boolean): boolean {
  if (native) return false;
  return /^id-preview--[a-z0-9-]+\.lovable\.app$/.test(hostname) || hostname === "localhost" || hostname === "127.0.0.1";
}
export function previewVerificationEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return isPreviewVerificationHost(window.location.hostname, Boolean(cap?.isNativePlatform?.()));
}

const SAFE_KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const SAFE_CODE = /^[a-z][a-z0-9_]{0,39}$/i;
// Only short machine codes such as "unauthorized"; any other text is replaced.
export function safeErrorCode(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const value = (body as Record<string, unknown>).error ?? (body as Record<string, unknown>).code;
  return typeof value === "string" && SAFE_CODE.test(value) ? value : value === undefined ? null : "unreadable_error";
}
const kind = (v: unknown) => Array.isArray(v) ? `list(${v.length})` : v === null ? "null" : typeof v;
const keys = (v: unknown) => typeof v === "object" && v !== null && !Array.isArray(v) ? Object.keys(v).filter(k => SAFE_KEY.test(k)).slice(0, 30) : [];
// Field names and types only — never string values (names, phones, ids).
export function describeShape(input: unknown): string[] {
  if (typeof input !== "object" || input === null) return [kind(input)];
  if (Array.isArray(input)) return [`list(${input.length})`, ...keys(input[0]).map(k => `[0].${k}: ${kind((input[0] as Record<string, unknown>)[k])}`)];
  const out: string[] = [];
  for (const k of keys(input)) {
    const v = (input as Record<string, unknown>)[k];
    out.push(`${k}: ${kind(v)}`);
    const inner = Array.isArray(v) ? v[0] : v;
    for (const c of keys(inner).slice(0, 12)) out.push(`${k}${Array.isArray(v) ? "[0]" : ""}.${c}: ${kind((inner as Record<string, unknown>)[c])}`);
  }
  return out.slice(0, 60);
}
// Top-level and one-level-deep numbers/booleans (e.g. group number, position in line). Strings are never shown.
export function safeNumbers(input: unknown): string[] {
  const out: string[] = [];
  const visit = (v: unknown, prefix: string, depth: number) => {
    for (const k of keys(v)) {
      const x = (v as Record<string, unknown>)[k];
      if ((typeof x === "number" && Number.isFinite(x)) || typeof x === "boolean") out.push(`${prefix}${k} = ${x}`);
      else if (depth < 1 && typeof x === "object" && x !== null && !Array.isArray(x)) visit(x, `${prefix}${k}.`, depth + 1);
    }
  };
  visit(input, "", 0);
  return out.slice(0, 30);
}
