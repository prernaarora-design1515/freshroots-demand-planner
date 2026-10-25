import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, passwordProblem, normEmail } from "./auth";

describe("passwords", () => {
  it("hashes with a random salt and verifies", async () => {
    const a = await hashPassword("correct horse battery");
    const b = await hashPassword("correct horse battery");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$16384$8$1$")).toBe(true);
    expect(await verifyPassword("correct horse battery", a)).toBe(true);
    expect(await verifyPassword("wrong horse battery", a)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
  it("policy and email normalisation", () => {
    expect(passwordProblem("short")).toMatch(/at least 10/);
    expect(passwordProblem("long enough pw")).toBeNull();
    expect(normEmail("  Raghav@FreshRoots.in ")).toBe("raghav@freshroots.in");
  });
});
