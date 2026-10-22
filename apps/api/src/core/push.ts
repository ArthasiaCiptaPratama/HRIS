// MOB-D6: push notification ke app mobile lewat FCM HTTP v1 (tanpa firebase-admin; token OAuth lewat
// core/google-auth.ts). Isi push = judul/isi notifikasi in-app, yang sudah bebas data sensitif (PLAN §5.6).
import { parseServiceAccountKey, serviceAccountTokenSource } from "./google-auth.ts";

export interface PushMessage {
  title: string;
  body: string | null;
  /** Semua nilai string (syarat FCM `data`). */
  data: Record<string, string>;
}

/** `unregistered` = token tidak berlaku lagi (app dihapus/token diganti) → pemanggil menghapusnya. */
export type PushOutcome = "sent" | "unregistered" | "failed";

export interface PushSender {
  readonly configured: boolean;
  send(token: string, message: PushMessage): Promise<PushOutcome>;
}

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

/** `json` = isi file kunci service account Firebase (env FCM_SERVICE_ACCOUNT_JSON). */
export function createFcmSender(json: string, fetcher: typeof fetch = fetch): PushSender {
  const key = parseServiceAccountKey(json, "FCM_SERVICE_ACCOUNT_JSON");
  if (!key.project_id) throw new Error("FCM_SERVICE_ACCOUNT_JSON has no project_id");
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(key.project_id)}/messages:send`;
  const accessToken = serviceAccountTokenSource(key, SCOPE, fetcher);

  return {
    configured: true,
    async send(token, message) {
      const response = await fetcher(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${await accessToken()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: message.title, ...(message.body ? { body: message.body } : {}) },
            data: message.data,
            android: { priority: "HIGH" },
          },
        }),
      });
      if (response.ok) return "sent";
      // FCM v1: 404 UNREGISTERED = token tidak berlaku lagi.
      if (response.status === 404) return "unregistered";
      return "failed";
    },
  };
}

/** Lokal/test/env kosong: push tidak dikirim, notifikasi in-app & email tetap jalan. */
export const UNCONFIGURED_PUSH: PushSender = {
  configured: false,
  send: async () => "failed",
};
