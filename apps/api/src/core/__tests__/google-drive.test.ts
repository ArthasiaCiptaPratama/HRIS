import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { createServiceAccountDrive, UNCONFIGURED_DRIVE } from "../google-drive.ts";

// D-060: klien Drive service account — token JWT di-cache, metadata/unduh, file tak terlihat = null.
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KEY = JSON.stringify({
  type: "service_account",
  client_email: "hris-test@example.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  token_uri: "https://oauth2.test/token",
});

function fakeFetch() {
  const calls: string[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url === "https://oauth2.test/token") {
      expect(String(init?.body)).toContain("grant_type=urn");
      return Response.json({ access_token: "tok", expires_in: 3600 });
    }
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer tok");
    if (url.includes("/files/hilang")) return new Response("{}", { status: 404 });
    if (url.includes("alt=media")) return new Response(new Uint8Array([1, 2, 3]));
    return Response.json({
      id: "f1",
      name: "ktp.jpg",
      mimeType: "image/jpeg",
      size: "3",
      sha256Checksum: "ABC",
    });
  }) as typeof fetch;
  return { fetcher, calls };
}

describe("createServiceAccountDrive", () => {
  test("metadata, unduh, token dipakai ulang; file tak terlihat = null", async () => {
    const { fetcher, calls } = fakeFetch();
    const drive = createServiceAccountDrive(KEY, fetcher);
    expect(drive.configured).toBe(true);
    expect(await drive.getMeta("f1")).toEqual({
      id: "f1",
      name: "ktp.jpg",
      mimeType: "image/jpeg",
      size: 3,
      sha256: "abc",
    });
    expect([...(await drive.download("f1"))]).toEqual([1, 2, 3]);
    expect(await drive.getMeta("hilang")).toBeNull();
    expect(calls.filter((c) => c.includes("oauth2")).length).toBe(1);
  });

  test("kunci bukan service account ditolak; belum dikonfigurasi = pesan jelas", async () => {
    expect(() => createServiceAccountDrive("{")).toThrow("not valid JSON");
    expect(() => createServiceAccountDrive(JSON.stringify({ type: "authorized_user" }))).toThrow(
      "not a service account key",
    );
    expect(UNCONFIGURED_DRIVE.configured).toBe(false);
    await expect(UNCONFIGURED_DRIVE.getMeta("x")).rejects.toThrow("belum dikonfigurasi");
  });
});
