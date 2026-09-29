import { cn } from "@/lib/utils";

// Logo resmi Arthasia horizontal (ikon + tulisan) — public/logo/logo-horizontal.svg, rasio 1028:216.
// Menggantikan teks "Arthasia HRIS / PT Arthasia Cipta Pratama" di top bar, menu mobile, dan halaman auth.
export function BrandLogo({
  className,
  decorative = false,
}: {
  className?: string;
  decorative?: boolean;
}) {
  return (
    <img
      src="/logo/logo-horizontal.svg"
      alt={decorative ? "" : "Arthasia"}
      width={152}
      height={32}
      decoding="async"
      draggable={false}
      className={cn("h-8 w-auto shrink-0 select-none", className)}
    />
  );
}
