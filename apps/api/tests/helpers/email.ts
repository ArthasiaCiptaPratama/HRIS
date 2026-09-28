import type { EmailMessage, EmailSender } from "../../src/core/email.ts";

/** EmailSender palsu: menyimpan pesan, bisa disetel gagal. Tidak pernah mengirim email sungguhan. */
export function createFakeEmailSender() {
  const sent: EmailMessage[] = [];
  let fail = false;
  const sender: EmailSender = {
    kind: "log",
    async send(message) {
      if (fail) throw new Error("fake SMTP failure");
      sent.push(message);
    },
  };
  return {
    sender,
    sent,
    setFail(value: boolean) {
      fail = value;
    },
  };
}
