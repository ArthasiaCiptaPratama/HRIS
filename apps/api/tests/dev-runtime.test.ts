import { describe, expect, test } from "bun:test";
import {
  parseEnvText,
  setSupabaseTarget,
  supabaseTarget,
  switchable,
} from "../src/core/dev-runtime.ts";

// Tombol switch DB (dev): target Supabase bisa ditukar saat runtime tanpa restart.
describe("dev-runtime", () => {
  test("parseEnvText: KEY=VALUE, kutip, komentar & baris rusak diabaikan", () => {
    const env = parseEnvText(
      ["# komentar", "A=1", "B='satu dua'", 'C="x=y"', "D=", "rusak", "  E = spasi  ", "\r"].join(
        "\n",
      ),
    );
    expect(env).toEqual({ A: "1", B: "satu dua", C: "x=y", D: "", E: "spasi" });
  });

  test("switchable: instance dibangun ulang hanya setelah target ditukar; method tetap terikat", () => {
    let builds = 0;
    const client = switchable(() => {
      builds += 1;
      const url = supabaseTarget().url;
      return {
        url,
        whoami() {
          return this.url;
        },
      };
    });
    expect(builds).toBe(0); // malas: belum dipakai
    const first = client.url;
    expect(client.whoami()).toBe(first);
    expect(builds).toBe(1);

    setSupabaseTarget({ url: "http://127.0.0.1:54321", serviceRoleKey: "k" });
    expect(client.url).toBe("http://127.0.0.1:54321");
    expect(client.whoami()).toBe("http://127.0.0.1:54321");
    expect(builds).toBe(2);
    expect(supabaseTarget()).toEqual({ url: "http://127.0.0.1:54321", serviceRoleKey: "k" });
  });
});
