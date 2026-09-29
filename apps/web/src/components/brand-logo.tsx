import { cn } from "@/lib/utils";

// Logo resmi Arthasia vertikal (ikon, tulisan "arthasia", tagline "energy for the future") —
// public/logo/logo-vertical.webp, dioptimasi dari logo-arthasia-ori.png (latar transparan), rasio 358:360.
// Dipakai di top bar, menu mobile, dan halaman auth (permintaan pemilik projek 2026-09-29).
export function BrandLogo({
  className,
  decorative = false,
}: {
  className?: string;
  decorative?: boolean;
}) {
  return (
    <img
      src="/logo/logo-vertical.webp"
      alt={decorative ? "" : "Arthasia — energy for the future"}
      width={358}
      height={360}
      decoding="async"
      draggable={false}
      className={cn("h-12 w-auto shrink-0 select-none", className)}
    />
  );
}
