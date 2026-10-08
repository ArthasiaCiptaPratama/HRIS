import { describe, expect, test } from "bun:test";
import { isAllowedWhileOnboarding } from "../onboarding-lock.ts";
import type { Actor } from "../rules.ts";

// D-045 b: daftar endpoint yang boleh bagi calon yang belum disetujui.
const SELF = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const actor = { employeeId: SELF } as Actor;

describe("isAllowedWhileOnboarding", () => {
  test.each([
    ["/api/v1/me", true],
    ["/api/v1/onboarding/me", true],
    ["/api/v1/onboarding/me/documents/upload-url", true],
    ["/api/v1/notifications/read-all", true],
    ["/api/v1/master-data", true],
    [`/api/v1/employees/${SELF}/photo`, true],
    [`/api/v1/employees/${SELF}/photo/upload-url`, true],
    [`/api/v1/employees/${OTHER}/photo`, false],
    [`/api/v1/employees/${SELF}`, false],
    ["/api/v1/employees", false],
    ["/api/v1/onboarding", false],
    ["/api/v1/org-structure", false],
  ] as const)("%s → %s", (path, allowed) => {
    expect(isAllowedWhileOnboarding(actor, path)).toBe(allowed);
  });
});
