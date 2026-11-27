export interface PassbookFields {
  holder: string;
  account: string;
  ifsc: string;
  bankName: string;
}

const EMPTY: PassbookFields = { holder: "", account: "", ifsc: "", bankName: "" };
export const PASSBOOK_FIELD_COUNT = 4;

// Visible bank names only (longest first so "Union Bank of India" never reads as "Bank of India").
// The bank name is never derived from the IFSC code.
const BANKS: Array<[RegExp, string]> = ([
  ["state bank of india", "State Bank of India"], ["union bank of india", "Union Bank of India"],
  ["central bank of india", "Central Bank of India"], ["indian overseas bank", "Indian Overseas Bank"],
  ["punjab national bank", "Punjab National Bank"], ["punjab (?:&|and) sind bank", "Punjab & Sind Bank"],
  ["kotak mahindra bank", "Kotak Mahindra Bank"], ["bank of maharashtra", "Bank of Maharashtra"],
  ["india post payments? bank", "India Post Payments Bank"], ["airtel payments bank", "Airtel Payments Bank"],
  ["paytm payments bank", "Paytm Payments Bank"], ["au small finance bank", "AU Small Finance Bank"],
  ["equitas small finance bank", "Equitas Small Finance Bank"], ["ujjivan small finance bank", "Ujjivan Small Finance Bank"],
  ["andhra pragathi grameena bank", "Andhra Pragathi Grameena Bank"], ["telangana grameena bank", "Telangana Grameena Bank"],
  ["karur vysya bank", "Karur Vysya Bank"], ["city union bank", "City Union Bank"], ["south indian bank", "South Indian Bank"],
  ["idfc first bank", "IDFC First Bank"], ["bank of baroda", "Bank of Baroda"], ["bank of india", "Bank of India"],
  ["karnataka bank", "Karnataka Bank"], ["federal bank", "Federal Bank"], ["indusind bank", "IndusInd Bank"],
  ["bandhan bank", "Bandhan Bank"], ["canara bank", "Canara Bank"], ["indian bank", "Indian Bank"],
  ["hdfc bank", "HDFC Bank"], ["icici bank", "ICICI Bank"], ["axis bank", "Axis Bank"], ["idbi bank", "IDBI Bank"],
  ["yes bank", "Yes Bank"], ["uco bank", "UCO Bank"], ["rbl bank", "RBL Bank"], ["dbs bank", "DBS Bank"],
] as Array<[string, string]>).map(([pattern, name]) => [new RegExp(`\\b${pattern.replace(/ /g, "\\s+")}\\b`, "gi"), name]);

const ACCOUNT_LABEL = /(?:\b(?:savings|sb|current|ca)?\s*(?:account|a\s*\/?\s*c\.?)\s*(?:number|no\.?|num\.?|#)|खाता\s*(?:संख्या|नंबर|सं\.?|क्र\.?)|ఖాతా\s*(?:నంబర్|సంఖ్య))\s*[:：.\-]?\s*/i;
const HOLDER_LABEL = /^(?:(?:name\s+of\s+(?:the\s+)?)?(?:account|a\s*\/\s*c)\s*holder(?:'?s)?(?:\s*name)?|customer\s*name|name|खाता\s*धारक(?:\s*का\s*नाम)?|खाताधारक(?:\s*का\s*नाम)?|ఖాతాదారుని\s*పేరు)\s*[:：\-]?\s*(.*)$/i;
const BANK_LABEL = /^(?:bank\s*name|name\s+of\s+(?:the\s+)?bank|बैंक\s*का\s*नाम|బ్యాంక్\s*పేరు)\s*[:：\-]?\s*(.*)$/i;
const IFSC_LABEL = /\bIFS(?:C)?\b(?:\s*code)?\s*[:：.\-]?\s*/i;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const IFSC_TOKEN = /(?<![A-Za-z0-9])[A-Z]{4}0[A-Z0-9]{6}(?![A-Za-z0-9])/g;
// Numbers that are not the account: cheque, MICR, branch, customer and transaction identifiers.
const NOT_ACCOUNT = /\b(?:cheque|chq|micr|cust(?:omer)?|cif|crn|client|id|brn|branch|pdt|txn|transaction|ref|utr|phone|mobile|mob|tel|ph|pin|pincode|date|amount|balance|rs|inr|aadhaar|pan|card|loan)\b/i;
const CHEQUE_HINTS = /\b(?:or\s+bearer|payable\s+at\s+par|please\s+sign|sign\s+above|valid\s+for\s+3\s+months|rupees|cts[-\s]?2010)\b/i;
const SIGNATURE_LINE = /\b(?:please\s+si[gq][nh]|si[gq][nh]\s+above|authori[sz]ed\s+signator|signature)\b/i;
const NOT_NAME = /\b(?:bank|ltd|limited|branch|payable|please|sign|sigh|above|signature|signator\w*|authori[sz]ed|bearer|rupees|pay|valid|months|only|date|account|ifsc|rtgs|neft|micr|cheque|savings|current|address|customer|for)\b/i;

const nameValid = (s: string) => s.length >= 3 && s.length <= 100 && /^[\p{L}\p{M} .'-]+$/u.test(s)
  && /\p{L}{2}/u.test(s) && !NOT_NAME.test(s);
const tidy = (s: string) => s.replace(/\s+/g, " ").replace(/^[\s.'-]+|[\s.'-]+$/g, "").trim();
const unique = (values: string[]) => {
  const set = new Set(values.filter(Boolean));
  return set.size === 1 ? Array.from(set)[0] : "";
};

/** First digit group of a labelled value; masked or damaged values yield "invalid". */
function readAccountValue(rest: string): string | null {
  const text = rest.trim();
  if (!text) return null;
  const match = text.match(/^[\d][\d \t]{7,24}\d/);
  // Non-Latin label text (e.g. "खाता क्र.") may sit between label and number; Latin words or masks are damage.
  if (!match) return /^[^\x00-\x7F]/.test(text) ? null : "invalid";
  const after = text.slice(match[0].length);
  if (/^[A-Za-z0-9*]/.test(after)) return "invalid"; // e.g. 12345O789012 or a digit run glued to letters
  const digits = match[0].replace(/[ \t]/g, "");
  return /^\d{9,18}$/.test(digits) ? digits : "invalid";
}

function readAccount(lines: string[]): string {
  const labelled: string[] = [];
  let damaged = false;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(ACCOUNT_LABEL);
    if (!match || match.index === undefined) continue;
    let value = readAccountValue(lines[i].slice(match.index + match[0].length));
    // Labels on cheques/passbooks often sit above or beside the boxed number.
    for (let j = i + 1; value === null && j <= i + 2 && j < lines.length; j++) {
      if (ACCOUNT_LABEL.test(lines[j]) || IFSC_LABEL.test(lines[j])) break;
      value = readAccountValue(lines[j]);
    }
    if (value === "invalid") damaged = true;
    else if (value) labelled.push(value);
  }
  if (damaged) return ""; // An unreadable labelled number is not permission to choose another.
  if (labelled.length) return unique(labelled);
  // Cheques: the printed label is often lost in the security pattern. Accept a lone
  // whole-number token only on a cheque, outside MICR/branch/customer lines.
  if (!CHEQUE_HINTS.test(lines.join("\n"))) return "";
  const candidates: string[] = [];
  for (const line of lines) {
    if (NOT_ACCOUNT.test(line)) continue;
    if (/[⑆⑇⑈⑉"”“'`]/.test(line) || /(?<!\d)\d{6}(?!\d)/.test(line)) continue; // MICR band
    for (const token of line.match(/(?<![A-Za-z0-9*])\d{9,18}(?![A-Za-z0-9*:])/g) || []) candidates.push(token);
  }
  return unique(candidates);
}

function readIfsc(lines: string[]): string {
  const labelled: string[] = [];
  let damaged = false;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(IFSC_LABEL);
    if (!match || match.index === undefined) continue;
    const rest = lines[i].slice(match.index + match[0].length).trim() || lines[i + 1]?.trim() || "";
    const token = rest.split(/[\s,;|]+/)[0]?.toUpperCase() || "";
    if (IFSC.test(token)) labelled.push(token);
    else if (/^[A-Z0-9]{9,13}$/.test(token)) damaged = true; // e.g. HDFCO001234 – never correct OCR letters
  }
  if (damaged) return "";
  if (labelled.length) return unique(labelled);
  return unique(lines.flatMap((line) => line.match(IFSC_TOKEN) || []));
}

function readLabelled(lines: string[], label: RegExp, valid: (s: string) => boolean): string {
  const values: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(label);
    if (!match) continue;
    const value = tidy(match[1] || lines[i + 1] || "");
    if (!valid(value)) return "";
    values.push(value);
  }
  return unique(values);
}

function readHolder(lines: string[]): string {
  const labelled = readLabelled(lines, HOLDER_LABEL, nameValid);
  if (labelled || lines.some((line) => HOLDER_LABEL.test(line))) return labelled;
  // Cheques print the holder's name directly above "Please sign above".
  const names: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!SIGNATURE_LINE.test(lines[i])) continue;
    // Pattern noise can put a few junk lines between the name and the signature text.
    for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
      const above = tidy(lines[j]);
      const words = above.split(" ");
      if (nameValid(above) && words.length >= 2 && words.length <= 6 && words.every((w) => /^\p{L}[\p{L}\p{M}.'-]+$/u.test(w))) { names.push(above); break; }
    }
  }
  return unique(names);
}

function readBank(lines: string[]): string {
  const labelled = readLabelled(lines, BANK_LABEL, (s) => s.length <= 60 && /^[\p{L}\p{M} .&'()-]+$/u.test(s) && /\p{L}{2}/u.test(s));
  if (labelled || lines.some((line) => BANK_LABEL.test(line))) {
    const known = labelled ? BANKS.find(([re]) => { re.lastIndex = 0; return re.test(labelled); }) : undefined;
    return known ? known[1] : labelled;
  }
  let text = lines.join("\n");
  const found: string[] = [];
  for (const [re, name] of BANKS) {
    re.lastIndex = 0;
    if (re.test(text)) { found.push(name); re.lastIndex = 0; text = text.replace(re, " "); }
  }
  return unique(found);
}

/**
 * Reads each field independently from a passbook, cheque or printed bank details.
 * Only clearly readable values are returned; ambiguous, masked or damaged values stay blank.
 */
export function parsePassbookText(text: string): PassbookFields {
  const lines = text.slice(0, 20000).split(/\r?\n/).map((line) => line.replace(/[ \t]+/g, " ").trim()).filter(Boolean);
  if (!lines.length) return { ...EMPTY };
  return { holder: readHolder(lines), account: readAccount(lines), ifsc: readIfsc(lines), bankName: readBank(lines) };
}

/**
 * Combines several readings of one photo. A field keeps the value most readings saw;
 * a tie between different values leaves it blank for manual entry.
 */
export function mergePassbookReadings(readings: PassbookFields[]): PassbookFields {
  const pick = (key: keyof PassbookFields) => {
    const votes = new Map<string, number>();
    for (const r of readings) if (r[key]) votes.set(r[key], (votes.get(r[key]) || 0) + 1);
    const ranked = Array.from(votes).sort((a, b) => b[1] - a[1]);
    return ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1]) ? ranked[0][0] : "";
  };
  return { holder: pick("holder"), account: pick("account"), ifsc: pick("ifsc"), bankName: pick("bankName") };
}

export const countPassbookFields = (fields: PassbookFields) =>
  (["holder", "account", "ifsc", "bankName"] as const).filter((key) => fields[key]).length;

/** Scan results never fill confirmation, including when replacing an earlier scan. */
export function scanToForm(fields: PassbookFields) {
  return { ...fields, confirmation: "" };
}
