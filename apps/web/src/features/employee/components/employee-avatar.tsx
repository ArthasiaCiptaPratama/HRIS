import { useState } from "react";
import { cn } from "@/lib/utils";

// Avatar: foto profil (D-037) bila ada, selain itu inisial dengan rona netral yang stabil per nama.
// URL foto bertanda tangan & berlaku singkat; bila gagal dimuat (kedaluwarsa) kembali ke inisial.
const TONES = [
  "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200",
  "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200",
  "bg-lime-100 text-lime-800 dark:bg-lime-900/50 dark:text-lime-200",
  "bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-200",
];

function hash(text: string) {
  let value = 0;
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
  ).toUpperCase();
}

export function EmployeeAvatar({
  name,
  size = "md",
  inactive = false,
  photoUrl = null,
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  inactive?: boolean;
  photoUrl?: string | null | undefined;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showPhoto = photoUrl !== null && photoUrl !== failedUrl;
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-medium tracking-tight select-none",
        inactive ? "bg-muted text-muted-foreground grayscale" : TONES[hash(name) % TONES.length],
        size === "sm" && "size-7 text-[11px]",
        size === "md" && "size-9 text-xs",
        size === "lg" && "size-12 text-sm",
        size === "xl" && "size-16 text-lg",
        size === "2xl" && "size-24 text-3xl sm:size-28 sm:text-4xl",
        className,
      )}
    >
      {/* Inisial tetap di bawah foto: terlihat selama foto dimuat atau bila gagal. */}
      {initials(name)}
      {showPhoto ? (
        <img
          src={photoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedUrl(photoUrl)}
          className={cn("absolute inset-0 size-full object-cover", inactive && "grayscale")}
        />
      ) : null}
    </span>
  );
}
