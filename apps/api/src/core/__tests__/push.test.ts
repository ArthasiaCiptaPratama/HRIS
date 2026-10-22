import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { createFcmSender, UNCONFIGURED_PUSH } from "../push.ts";

// MOB-D6: pengirim FCM HTTP v1 — token OAuth service account, 404 = token tidak berlaku lagi.
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const keyJson = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "service_account",
    project_id: "arthasia-test",
    client_email: "fcm@arthasia-test.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    token_uri: "https://oauth2.test/token",
    ...extra,
  });

function fakeFetch(status: number) {
  const bodies: unknown[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://oauth2.test/token") {
      expect(String(init?.body)).toContain("grant_type=urn");
      return Response.json({ access_token: "tok", expires_in: 3600 });
    }
    expect(url).toBe("https://fcm.googleapis.com/v1/projects/arthasia-test/messages:send");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer tok");
    bodies.push(JSON.parse(String(init?.body)));
    return new Response("{}", { status });
  }) as typeof fetch;
  return { fetcher, bodies };
}

const MESSAGE = { title: "Cuti disetujui", body: null, data: { notificationId: "n1" } };

describe("createFcmSender", () => {
  test("mengirim pesan ke token dengan data string + prioritas tinggi", async () => {
    const { fetcher, bodies } = fakeFetch(200);
    const sender = createFcmSender(keyJson(), fetcher);
    expect(await sender.send("token-1", MESSAGE)).toBe("sent");
    expect(bodies[0]).toEqual({
      message: {
        token: "token-1",
        notification: { title: "Cuti disetujui" },
        data: { notificationId: "n1" },
        android: { priority: "HIGH" },
      },
    });
  });

  test("404 → unregistered; galat lain → failed", async () => {
    expect(await createFcmSender(keyJson(), fakeFetch(404).fetcher).send("t", MESSAGE)).toBe(
      "unregistered",
    );
    expect(await createFcmSender(keyJson(), fakeFetch(500).fetcher).send("t", MESSAGE)).toBe(
      "failed",
    );
  });

  test("kunci tanpa project_id atau bukan service account ditolak tanpa membocorkan isi", () => {
    expect(() => createFcmSender(keyJson({ project_id: undefined }))).toThrow("no project_id");
    expect(() => createFcmSender("{")).toThrow("FCM_SERVICE_ACCOUNT_JSON is not valid JSON");
  });

  test("tanpa konfigurasi tidak mengirim apa pun", async () => {
    expect(UNCONFIGURED_PUSH.configured).toBe(false);
  });
});
