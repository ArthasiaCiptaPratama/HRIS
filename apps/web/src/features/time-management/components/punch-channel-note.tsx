// MOB-D3: approver perlu tahu absen lewat app (lokasi palsu terdeteksi) atau web/PWA (tidak bisa dicek).
export function PunchChannelNote({
  source,
  channel,
  appVersion,
}: {
  source: "DEVICE" | "MANUAL";
  channel?: "APP" | "PWA" | undefined;
  appVersion?: string | null | undefined;
}) {
  if (source !== "DEVICE" || !channel) return null;
  return (
    <p className="text-muted-foreground text-xs">
      {channel === "APP"
        ? `Lewat aplikasi Android${appVersion ? ` v${appVersion}` : ""}`
        : "Lewat web/PWA (lokasi palsu tidak bisa dideteksi)"}
    </p>
  );
}
