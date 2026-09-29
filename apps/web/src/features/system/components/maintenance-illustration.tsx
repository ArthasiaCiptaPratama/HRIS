import { memo } from "react";

// Karakter "petugas" berhelm proyek yang sedang memperbaiki sesuatu. SVG inline (tanpa aset luar),
// warna dari token tema, animasi hanya transform (melayang, kunci pas berayun, mata berkedip).
export const MaintenanceIllustration = memo(function MaintenanceIllustration({
  className,
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 320 280"
      role="img"
      aria-label="Ilustrasi petugas sedang memperbaiki halaman"
      className={className}
    >
      {/* Latar: kisi titik tipis + lingkaran lembut */}
      <defs>
        <pattern id="mt-dots" width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.2" className="fill-border" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="320" height="280" fill="url(#mt-dots)" opacity="0.8" />
      <circle cx="160" cy="138" r="104" className="fill-brand-soft" />

      {/* Kerucut lalu lintas */}
      <g transform="translate(236 176)">
        <path d="M18 0 L34 62 L2 62 Z" className="fill-warning" />
        <path d="M11 26 L25 26 L28 38 L8 38 Z" className="fill-background" opacity="0.9" />
        <rect
          x="-4"
          y="60"
          width="44"
          height="8"
          rx="3"
          className="fill-foreground"
          opacity="0.85"
        />
      </g>

      {/* Bayangan di lantai */}
      <ellipse cx="150" cy="250" rx="62" ry="8" className="fill-foreground" opacity="0.08" />

      <g className="animate-float" style={{ transformOrigin: "150px 150px" }}>
        {/* Badan */}
        <rect
          x="104"
          y="146"
          width="92"
          height="84"
          rx="26"
          className="fill-card stroke-border"
          strokeWidth="3"
        />
        <rect
          x="126"
          y="170"
          width="48"
          height="30"
          rx="8"
          className="fill-muted stroke-border"
          strokeWidth="2"
        />
        <circle cx="140" cy="185" r="4" className="fill-brand" />
        <rect
          x="150"
          y="181"
          width="16"
          height="3"
          rx="1.5"
          className="fill-muted-foreground"
          opacity="0.5"
        />
        <rect
          x="150"
          y="188"
          width="10"
          height="3"
          rx="1.5"
          className="fill-muted-foreground"
          opacity="0.5"
        />

        {/* Kaki */}
        <rect
          x="120"
          y="224"
          width="20"
          height="18"
          rx="8"
          className="fill-foreground"
          opacity="0.85"
        />
        <rect
          x="160"
          y="224"
          width="20"
          height="18"
          rx="8"
          className="fill-foreground"
          opacity="0.85"
        />

        {/* Lengan kiri memegang papan catatan */}
        <path
          d="M106 170 Q84 182 86 204"
          className="stroke-border"
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
        />
        <g transform="rotate(-8 80 206)">
          <rect
            x="62"
            y="190"
            width="36"
            height="44"
            rx="5"
            className="fill-card stroke-border"
            strokeWidth="2.5"
          />
          <rect
            x="72"
            y="186"
            width="16"
            height="7"
            rx="2"
            className="fill-muted-foreground"
            opacity="0.6"
          />
          <rect
            x="69"
            y="202"
            width="22"
            height="3"
            rx="1.5"
            className="fill-brand"
            opacity="0.7"
          />
          <rect
            x="69"
            y="210"
            width="16"
            height="3"
            rx="1.5"
            className="fill-muted-foreground"
            opacity="0.4"
          />
          <rect
            x="69"
            y="218"
            width="19"
            height="3"
            rx="1.5"
            className="fill-muted-foreground"
            opacity="0.4"
          />
        </g>

        {/* Lengan kanan + kunci pas yang berayun */}
        <g className="animate-swing" style={{ transformOrigin: "194px 168px" }}>
          <path
            d="M194 168 Q220 160 226 136"
            className="stroke-border"
            strokeWidth="10"
            strokeLinecap="round"
            fill="none"
          />
          <g transform="rotate(-30 228 128)">
            <rect x="224" y="96" width="8" height="40" rx="4" className="fill-muted-foreground" />
            <path d="M218 92 a12 12 0 1 1 20 0 l-5 -5 h-10 z" className="fill-muted-foreground" />
          </g>
        </g>

        {/* Kepala */}
        <rect
          x="112"
          y="78"
          width="76"
          height="66"
          rx="22"
          className="fill-card stroke-border"
          strokeWidth="3"
        />
        <rect
          x="122"
          y="92"
          width="56"
          height="36"
          rx="14"
          className="fill-foreground"
          opacity="0.9"
        />
        <g className="animate-blink" style={{ transformOrigin: "150px 110px" }}>
          <rect x="134" y="102" width="9" height="12" rx="4.5" className="fill-brand" />
          <rect x="157" y="102" width="9" height="12" rx="4.5" className="fill-brand" />
        </g>
        <path
          d="M143 121 q7 5 14 0"
          className="stroke-brand"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />

        {/* Helm proyek */}
        <path d="M110 84 Q112 50 150 48 Q188 50 190 84 Z" className="fill-warning" />
        <rect x="100" y="80" width="100" height="9" rx="4.5" className="fill-warning" />
        <rect
          x="145"
          y="48"
          width="10"
          height="34"
          rx="4"
          className="fill-background"
          opacity="0.35"
        />
      </g>

      {/* Percikan kecil */}
      <g className="animate-pulse-dot">
        <path
          d="M252 84 l4 -10 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 z"
          className="fill-brand"
          opacity="0.8"
        />
        <circle cx="70" cy="96" r="4" className="fill-warning" />
        <circle cx="86" cy="70" r="2.5" className="fill-brand" opacity="0.6" />
      </g>
    </svg>
  );
});
