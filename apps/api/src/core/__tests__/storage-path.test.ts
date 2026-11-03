import { describe, expect, test } from "bun:test";
import { BusinessRuleError } from "../errors.ts";
import { assertOwnedPath } from "../storage.ts";

const UUID = "01234567-89ab-4cde-8fab-0123456789ab";

describe("assertOwnedPath", () => {
  for (const prefix of [
    "employees/owner/documents/",
    "test/env.v1/employees/owner/documents/",
    "attendance/owner/",
    "statements/owner/",
    "leave/owner/",
  ]) {
    test(`accepts server filenames and rejects traversal for ${prefix}`, () => {
      for (const ext of ["pdf", "jpg", "png", "webp"]) {
        expect(() => assertOwnedPath(`${prefix}${UUID}.${ext}`, prefix, "x")).not.toThrow();
      }
      for (const filename of [
        `../${UUID}.pdf`,
        `%2e%2e/${UUID}.pdf`,
        `%252e%252e/${UUID}.pdf`,
        `nested/${UUID}.pdf`,
        `..\\${UUID}.pdf`,
        `${UUID}%2epdf`,
        `${UUID}.pdf/other`,
        `${UUID}.pdf.exe`,
        `${UUID}.pdf\n`,
        `${UUID}.pdf?token=x`,
        `${UUID}.pdf#fragment`,
        "file.pdf",
      ]) {
        expect(() => assertOwnedPath(`${prefix}${filename}`, prefix, "x")).toThrow(
          BusinessRuleError,
        );
      }
      expect(() => assertOwnedPath(`other/${UUID}.pdf`, prefix, "x")).toThrow(BusinessRuleError);
      if (prefix.includes("env.v1")) {
        expect(() =>
          assertOwnedPath(`${prefix.replace("env.v1", "envXv1")}${UUID}.pdf`, prefix, "x"),
        ).toThrow(BusinessRuleError);
      }
    });
  }
});
