import { describe, it, expect } from "vitest";
import { priorityBadge } from "../priorityBadge";

describe("priorityBadge", () => {
  it("90-100 is Excellent", () => { expect(priorityBadge(90).label).toBe("Excellent"); expect(priorityBadge(100).label).toBe("Excellent"); });
  it("75-89 is Very Good", () => { expect(priorityBadge(75).label).toBe("Very Good"); expect(priorityBadge(89.9).label).toBe("Very Good"); });
  it("50-74 is Good", () => { expect(priorityBadge(50).label).toBe("Good"); expect(priorityBadge(74).label).toBe("Good"); });
  it("25-49 is Needs Improvement", () => { expect(priorityBadge(25).label).toBe("Needs Improvement"); expect(priorityBadge(49).label).toBe("Needs Improvement"); });
  it("0-24 is Low Priority, and 0 stays 0", () => { expect(priorityBadge(0).label).toBe("Low Priority"); expect(priorityBadge(24.9).label).toBe("Low Priority"); });
});
