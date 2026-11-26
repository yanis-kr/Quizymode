import { describe, expect, it } from "vitest";
import { ADMIN_GROUPS, isAdminGroups } from "./adminGroups";

describe("isAdminGroups (AC 4.1.4)", () => {
  it("AC 4.1.4: allowlist defaults to exactly Admins", () => {
    expect(ADMIN_GROUPS).toEqual(["Admins"]);
  });

  it("AC 4.1.4: treats the Admins group as admin", () => {
    expect(isAdminGroups(["Admins"])).toBe(true);
  });

  it("AC 4.1.4: treats a multi-group user including Admins as admin", () => {
    expect(isAdminGroups(["us-east-1_LiJbvT212_Google", "Admins"])).toBe(true);
  });

  it.each(["admin", "admins", "ADMINS", "Administrators", "AdminsX", "us-east-1_LiJbvT212_Google"])(
    "AC 4.1.4: does not treat %s as admin",
    (group) => {
      expect(isAdminGroups([group])).toBe(false);
    },
  );

  it("AC 4.1.4: does not treat no groups as admin", () => {
    expect(isAdminGroups([])).toBe(false);
  });
});
