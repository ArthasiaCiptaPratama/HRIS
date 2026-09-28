import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, createApiClient } from "@/lib/api-client";

const schema = z.object({ data: z.object({ value: z.number() }) });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createApiClient", () => {
  it("mengembalikan data yang lolos skema dan mengirim Bearer token", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: { value: 1 } }));
    const api = createApiClient({
      baseUrl: "http://api.test/api/v1",
      getAccessToken: async () => "jwt-123",
      fetchImpl,
    });

    await expect(api("/things", { schema })).resolves.toEqual({ data: { value: 1 } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/things");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer jwt-123");
  });

  it("mengubah envelope error menjadi ApiError", async () => {
    const api = createApiClient({
      baseUrl: "http://api.test",
      fetchImpl: async () =>
        jsonResponse(
          { error: { code: "FORBIDDEN", message: "Tidak berhak.", requestId: "r-1" } },
          403,
        ),
    });

    const error = await api("/x", { schema }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: "FORBIDDEN", requestId: "r-1" });
  });

  it("respons yang tidak sesuai skema dianggap error", async () => {
    const api = createApiClient({
      baseUrl: "http://api.test",
      fetchImpl: async () => jsonResponse({ data: { value: "bukan angka" } }),
    });
    await expect(api("/x", { schema })).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("status non-2xx yang diizinkan tetap diparse sebagai data", async () => {
    const api = createApiClient({
      baseUrl: "http://api.test",
      fetchImpl: async () => jsonResponse({ data: { value: 2 } }, 503),
    });
    await expect(api("/x", { schema, acceptStatuses: [503] })).resolves.toEqual({
      data: { value: 2 },
    });
  });

  it("gagal jaringan → ApiError dengan pesan ramah", async () => {
    const api = createApiClient({
      baseUrl: "http://api.test",
      fetchImpl: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    await expect(api("/x", { schema })).rejects.toMatchObject({
      status: 0,
      message: "Tidak dapat terhubung ke server.",
    });
  });
});
