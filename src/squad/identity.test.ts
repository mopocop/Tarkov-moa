import { describe, it, expect, beforeEach } from "vitest";
import { loadIdentity, saveIdentity, hasProfile } from "./identity";

beforeEach(() => localStorage.clear());

describe("squad identity", () => {
  it("mints a clientId on first load and persists it", () => {
    const a = loadIdentity();
    expect(a.clientId).toBeTruthy();
    expect(a.name).toBe("");
    expect(a.colorId).toBeNull();
    // Second load returns the SAME clientId (stable analytics key).
    const b = loadIdentity();
    expect(b.clientId).toBe(a.clientId);
  });

  it("remembers a saved name + color", () => {
    const id = loadIdentity();
    saveIdentity({ ...id, name: "Moacir", colorId: "cyan" });
    const again = loadIdentity();
    expect(again.name).toBe("Moacir");
    expect(again.colorId).toBe("cyan");
    expect(again.clientId).toBe(id.clientId);
  });

  it("hasProfile is true only once a non-blank name is set", () => {
    const id = loadIdentity();
    expect(hasProfile(id)).toBe(false);
    expect(hasProfile({ ...id, name: "  " })).toBe(false);
    expect(hasProfile({ ...id, name: "Gui" })).toBe(true);
  });

  it("backfills a clientId if stored data lacks one", () => {
    localStorage.setItem("tc_squad_identity_v1", JSON.stringify({ name: "X", colorId: "red" }));
    const id = loadIdentity();
    expect(id.clientId).toBeTruthy();
    expect(id.name).toBe("X");
    expect(id.colorId).toBe("red");
    // and it stuck
    expect(loadIdentity().clientId).toBe(id.clientId);
  });
});
