import { Crosshair, LoaderCircle, MapPin, Search } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { GeoPoint } from "./geofence-map";

// Leaflet (± 40 kB) hanya dimuat saat dialog lokasi dibuka.
const GeofenceMap = lazy(() => import("./geofence-map").then((m) => ({ default: m.GeofenceMap })));

interface SearchResult {
  label: string;
  point: GeoPoint;
}

/**
 * Cari tempat lewat Nominatim (OpenStreetMap). Kebijakan pemakaian: maks 1 permintaan/detik, tanpa
 * saran per ketikan — pencarian hanya saat tombol Cari ditekan. Yang dikirim hanya teks pencarian.
 */
async function searchPlaces(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    format: "jsonv2",
    limit: "5",
    countrycodes: "id",
    "accept-language": "id",
    q: query,
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const rows = (await res.json()) as { display_name?: string; lat?: string; lon?: string }[];
  return rows
    .map((row) => ({
      label: row.display_name ?? "",
      point: { lat: Number(row.lat), lng: Number(row.lon) },
    }))
    .filter((r) => r.label && Number.isFinite(r.point.lat) && Number.isFinite(r.point.lng));
}

export function GeofencePicker({
  point,
  radius,
  onPick,
}: {
  point: GeoPoint | null;
  radius: number | null;
  onPick: (point: GeoPoint) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [lastSearch, setLastSearch] = useState(0);

  const runSearch = async () => {
    const text = query.trim();
    if (text.length < 3) {
      toast.error("Ketik minimal 3 huruf untuk mencari.");
      return;
    }
    if (Date.now() - lastSearch < 1100) return; // batas 1 permintaan/detik
    setLastSearch(Date.now());
    setSearching(true);
    try {
      const found = await searchPlaces(text);
      setResults(found);
      if (found.length === 0) toast.info("Tempat tidak ditemukan. Coba nama kota/kecamatan.");
    } catch {
      toast.error("Pencarian peta gagal. Klik langsung di peta atau isi angka koordinat.");
    } finally {
      setSearching(false);
    }
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      toast.error("Browser ini tidak mendukung lokasi perangkat.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onPick({
          lat: Math.round(position.coords.latitude * 1e6) / 1e6,
          lng: Math.round(position.coords.longitude * 1e6) / 1e6,
        });
        toast.success(
          `Lokasi perangkat dipakai (akurasi ± ${Math.round(position.coords.accuracy)} m).`,
        );
      },
      () => {
        setLocating(false);
        toast.error("Lokasi perangkat tidak bisa dibaca. Izinkan akses lokasi di browser.");
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 gap-2">
          <Input
            aria-label="Cari tempat di peta"
            placeholder="Cari tempat (mis. Kuala Kapuas)"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void runSearch();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={runSearch} disabled={searching}>
            {searching ? <LoaderCircle className="animate-spin" /> : <Search />} Cari
          </Button>
        </div>
        <Button type="button" variant="outline" onClick={useMyLocation} disabled={locating}>
          {locating ? <LoaderCircle className="animate-spin" /> : <Crosshair />} Pakai lokasi saya
        </Button>
      </div>
      {results && results.length > 0 ? (
        <ul
          className="max-h-36 divide-y overflow-y-auto rounded-lg border text-sm"
          aria-label="Hasil pencarian"
        >
          {results.map((result) => (
            <li key={`${result.point.lat},${result.point.lng}`}>
              <button
                type="button"
                className="hover:bg-muted/60 flex w-full items-start gap-2 px-3 py-2 text-left"
                onClick={() => {
                  onPick(result.point);
                  setResults(null);
                }}
              >
                <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                <span className="line-clamp-2">{result.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-lg" />}>
        <GeofenceMap point={point} radius={radius} onPick={onPick} />
      </Suspense>
      <p className="text-muted-foreground text-xs">
        Klik peta untuk menaruh titik, geser pin untuk merapikan. Lingkaran = radius absensi.
      </p>
    </div>
  );
}
