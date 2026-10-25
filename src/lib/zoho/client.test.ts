import { describe, it, expect } from "vitest";
import { safeAccountsUrl, safeApiBase } from "./client";

describe("Zoho data-centre values are only trusted on Zoho domains", () => {
  it("accepts real Zoho accounts servers", () => {
    expect(safeAccountsUrl("https://accounts.zoho.in")).toBe("https://accounts.zoho.in");
    expect(safeAccountsUrl("https://accounts.zoho.com/")).toBe("https://accounts.zoho.com");
    expect(safeAccountsUrl("https://accounts.zohocloud.ca")).toBe("https://accounts.zohocloud.ca");
  });
  it("rejects anything else (prevents sending the client secret elsewhere)", () => {
    expect(safeAccountsUrl("https://evil.example.com")).toBeNull();
    expect(safeAccountsUrl("https://accounts.zoho.in.evil.com")).toBeNull();
    expect(safeAccountsUrl("http://accounts.zoho.in")).toBeNull();
    expect(safeAccountsUrl("not a url")).toBeNull();
    expect(safeAccountsUrl(null)).toBeNull();
  });
  it("maps api_domain to the Inventory base URL", () => {
    expect(safeApiBase("https://www.zohoapis.in")).toBe("https://www.zohoapis.in/inventory/v1");
    expect(safeApiBase("https://www.zohoapis.in.attacker.io")).toBeNull();
  });
});
