import { describe, it, expect } from "vitest";
import { buildFlatAnnouncement, spellDigits } from "../flatVoice";
describe("flat announcement", () => {
  it("reads flat 9198 digit by digit", () => {
    expect(buildFlatAnnouncement("9198", { lang: "en" }).text).toBe("Flat number nine one nine eight");
  });
  it("keeps letters as single characters", () => {
    expect(spellDigits("a12")).toBe("A one two");
  });
  it("uses Hindi digits for Hindi", () => {
    expect(buildFlatAnnouncement("90", { lang: "hi" })).toEqual({ text: "फ्लैट नंबर नौ शून्य", lang: "hi-IN" });
  });
});
