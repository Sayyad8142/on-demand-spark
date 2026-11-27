import { describe, expect, it } from "vitest";
import { parsePassbookText, scanToForm } from "../passbookText";

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