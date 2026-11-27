import { describe, expect, it } from "vitest";
import { countPassbookFields, mergePassbookReadings, parsePassbookText, scanToForm } from "../passbookText";

const readable = "Account Holder Name: Asha Rao\nAccount Number: 123456789012\nIFSC Code: HDFC0001234\nBank Name: HDFC Bank";

describe("private passbook extraction rules", () => {
  it("extracts the four explicitly readable bank fields", () => {
    expect(parsePassbookText(readable)).toEqual({ holder: "Asha Rao", account: "123456789012", ifsc: "HDFC0001234", bankName: "HDFC Bank" });
  });
  it("requires the worker to type account confirmation, never OCR", () => {
    expect(scanToForm(parsePassbookText(readable)).confirmation).toBe("");
  });
  it("does not guess missing values from IFSC or unrelated transaction numbers", () => {
    expect(parsePassbookText("Transaction: 123456789012\nIFSC: HDFC0001234")).toEqual({ holder: "", account: "", ifsc: "HDFC0001234", bankName: "" });
  });
  it("never substitutes OCR letters for account digits or the IFSC zero", () => {
    expect(parsePassbookText("Account Number: 12345O789012\nIFSC: HDFCO001234")).toMatchObject({ account: "", ifsc: "" });
  });
  it("rejects conflicting accounts rather than choosing one", () => {
    expect(parsePassbookText("Account No: 123456789012\nA/C No: 987654321012").account).toBe("");
  });
  it("rejects masked and unreadable account candidates", () => {
    expect(parsePassbookText("Account Number: XXXX56789012").account).toBe("");
    expect(parsePassbookText("Account No: 123456789012\nAccount No: unreadable").account).toBe("");
  });
  it("accepts a next-line labelled value without inventing a missing name", () => {
    expect(parsePassbookText("Account Holder Name:\nAsha Rao\nBank Name:\nHDFC Bank")).toMatchObject({ holder: "Asha Rao", bankName: "HDFC Bank" });
    expect(parsePassbookText("Account Holder Name:\nIFSC: HDFC0001234").holder).toBe("");
  });
  it("retains leading zeroes and removes only visible account spaces", () => {
    expect(parsePassbookText("Account Number: 0012 3456 7890").account).toBe("001234567890");
  });
});
// Shaped like real Tesseract output from an HDFC cheque photo (test values, not a real account).
const hdfcCheque = `i J HDFC BANK =
RTGS / NEFT IFSC : HDFC0001234 DRIDE MEME
E Valid for 3 months only
|; Pay
Bo mt eo Or Bearer
£2 Nelo. Brn: 4216 Pdt:193
= SSN 50100123456789 | ssac
Payabla at par through clearing transfer at all branches of HDFC BANK LTD.
A
ASHA KUMARI RAO
3
AN
Ploase sign above / gray
"DO000S”* 500240083: 034810" 31`;

describe("cheque and printed bank details extraction", () => {
  it("reads all four fields from a patterned HDFC cheque", () => {
    expect(parsePassbookText(hdfcCheque)).toEqual({ holder: "ASHA KUMARI RAO", account: "50100123456789", ifsc: "HDFC0001234", bankName: "HDFC Bank" });
  });
  it("finds the IFSC after RTGS / NEFT labels mid-line", () => {
    expect(parsePassbookText("MG ROAD, PUNE RTGS/NEFT IFSC: SBIN0004321").ifsc).toBe("SBIN0004321");
  });
  it("reads A/c No. and A/c. No. labels, same line or below", () => {
    expect(parsePassbookText("A/c. No. 32109876543").account).toBe("32109876543");
    expect(parsePassbookText("A/c No.\nखाता क्र.\n32109876543").account).toBe("32109876543");
    expect(parsePassbookText("SB Account Number: 3210 9876 543").account).toBe("32109876543");
  });
  it("never takes cheque numbers, MICR codes, branch codes or customer IDs as the account", () => {
    const text = "Or Bearer\nCheque No. 456789123\nBranch Code 012345678\nCustomer ID 881234567\n\"456789\" 560002011: 004321\" 10\nPlease sign above";
    expect(parsePassbookText(text).account).toBe("");
  });
  it("needs cheque wording before accepting an unlabelled account number", () => {
    expect(parsePassbookText("50100123456789").account).toBe("");
  });
  it("fills each field on its own when others are missing", () => {
    expect(parsePassbookText("IFSC: ICIC0001234")).toEqual({ holder: "", account: "", ifsc: "ICIC0001234", bankName: "" });
    expect(parsePassbookText("Please sign above\nSome text\nICICI Bank Ltd")).toMatchObject({ bankName: "ICICI Bank", holder: "" });
  });
  it("does not read bank or signature wording as the holder name", () => {
    expect(parsePassbookText("HDFC BANK LTD\nPlease sign above").holder).toBe("");
    expect(parsePassbookText("For ACME TRADERS\nAuthorised Signatory").holder).toBe("");
  });
  it("keeps the longest visible bank name and blanks two different banks", () => {
    expect(parsePassbookText("Union Bank of India\nPassbook").bankName).toBe("Union Bank of India");
    expect(parsePassbookText("State Bank of India\nAxis Bank").bankName).toBe("");
  });
  it("leaves a misread IFSC blank instead of correcting it", () => {
    expect(parsePassbookText("IFSC: SBIN0O001234").ifsc).toBe("");
  });
});

describe("combining several readings of one photo", () => {
  const a = { holder: "ASHA RAO", account: "50100123456789", ifsc: "HDFC0001234", bankName: "" };
  it("keeps the value most readings agree on and fills gaps", () => {
    expect(mergePassbookReadings([a, { ...a, account: "5010012345678", bankName: "HDFC Bank" }, a]))
      .toEqual({ ...a, bankName: "HDFC Bank" });
  });
  it("blanks a field when readings disagree equally", () => {
    expect(mergePassbookReadings([a, { ...a, account: "5010012345678" }]).account).toBe("");
  });
  it("counts detected fields for the success message", () => {
    expect(countPassbookFields({ holder: "x", account: "", ifsc: "HDFC0001234", bankName: "HDFC Bank" })).toBe(3);
  });
});
