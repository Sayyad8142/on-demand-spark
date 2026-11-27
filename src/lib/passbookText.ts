export interface PassbookFields {
  holder: string;
  account: string;
  ifsc: string;
  bankName: string;
}

/** Only explicitly labelled values. Ambiguous, masked or damaged values stay blank. */
export function parsePassbookText(text: string): PassbookFields {
  const lines = text.slice(0, 20000).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const read = (label: RegExp, valid: (value: string) => boolean, normalize = (s: string) => s) => {
    const values = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(label);
      if (!match) continue;
      const value = normalize(match[1]?.trim() || lines[i + 1] || "");
      if (valid(value)) values.add(value);
      else return ""; // An unreadable candidate is not permission to choose another.
    }
    return values.size === 1 ? Array.from(values)[0] : "";
  };
  const nameValid = (s: string) => s.length >= 2 && s.length <= 100 && /^[\p{L}\p{M} .'-]+$/u.test(s) && !/\b(account|ifsc|branch|bank name)\b/i.test(s);
  return {
    holder: read(/^(?:account holder(?:\s*name)?|a\/c holder(?:\s*name)?|customer name|name|खाताधारक(?: का नाम)?|खाता धारक(?: का नाम)?|खाताधारक का नाम|ఖాతాదారుని పేరు)\s*[:：-]?\s*(.*)$/i, nameValid),
    account: read(/^(?:account(?:\s*(?:number|no\.?))|a\/?c\s*(?:number|no\.?)|खाता (?:संख्या|नंबर)|బ్యాంక్ ఖాతా నంబర్|ఖాతా నంబర్)\s*[:：-]?\s*(.*)$/i, (s) => /^\d{9,18}$/.test(s), (s) => s.replace(/[ \t]/g, "")),
    ifsc: read(/^IFSC(?:\s*code)?\s*[:：-]?\s*(.*)$/i, (s) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(s), (s) => s.toUpperCase()),
    bankName: read(/^(?:bank name|बैंक का नाम|బ్యాంక్ పేరు)\s*[:：-]?\s*(.*)$/i, (s) => s.length <= 60 && nameValid(s)),
  };
}

/** Scan results never fill confirmation, including when replacing an earlier scan. */
export function scanToForm(fields: PassbookFields) {
  return { ...fields, confirmation: "" };
}