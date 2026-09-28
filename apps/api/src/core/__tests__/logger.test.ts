import { describe, expect, test } from "bun:test";
import { createLogger, REDACTED, redact } from "../logger.ts";

describe("redact", () => {
  test("menyamarkan field sensitif di level mana pun", () => {
    const output = redact({
      userId: "u-1",
      nik: "3201010101010001",
      nested: { npwp: "12.345.678.9-012.000", accountNumber: "1234567890", ok: 1 },
      list: [{ password: "x" }],
      headers: { authorization: "Bearer abc" },
    });
    expect(output).toEqual({
      userId: "u-1",
      nik: REDACTED,
      nested: { npwp: REDACTED, accountNumber: REDACTED, ok: 1 },
      list: [{ password: REDACTED }],
      headers: { authorization: REDACTED },
    });
  });
});

describe("createLogger", () => {
  test("menulis JSON satu baris dan menghormati level minimum", () => {
    const lines: string[] = [];
    const logger = createLogger("info", (line) => lines.push(line));
    logger.debug("skip");
    logger.info("hello", { requestId: "r-1", salary: 1_000_000 });
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0] ?? "{}");
    expect(entry).toMatchObject({
      level: "info",
      msg: "hello",
      requestId: "r-1",
      salary: REDACTED,
    });
    expect(typeof entry.time).toBe("string");
  });
});
