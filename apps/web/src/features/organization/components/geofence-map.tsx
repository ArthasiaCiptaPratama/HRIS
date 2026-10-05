import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

// D-049 (diperbarui 2026-10-01): pemilih titik geofence dengan Leaflet + tile OpenStreetMap.
// Dimuat lazy dari dialog lokasi saja. Tile OSM hanya untuk pemakaian ringan (halaman admin);
// absensi karyawan (Fase 5) sebaiknya memakai penyedia tile sendiri (lihat CODEMAP).

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Pusat awal bila titik belum diisi: tengah Indonesia. */
const INDONESIA: GeoPoint = { lat: -2.5, lng: 118 };

// Ikon dari CSS (bukan gambar bawaan Leaflet yang path-nya rusak setelah dibundel Vite).
const pinIcon = L.divIcon({
  className: "",
  html: '<span class="block size-5 -translate-x-1/2 -translate-y-full rounded-full rounded-br-none rotate-45 border-2 border-white bg-brand shadow-md"></span>',
  iconSize: [0, 0],
});

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

/** Atribut SVG Leaflet tidak membaca var(--brand) → pakai nilai warna yang sudah dihitung. */
function brandColor() {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim();
  return value || "#0f766e";
}

function ClickToPlace({ onPick }: { onPick: (point: GeoPoint) => void }) {
  useMapEvents({
    click: (event) => onPick({ lat: round6(event.latlng.lat), lng: round6(event.latlng.lng) }),
  });
  return null;
}

/** Ikuti titik yang diubah dari luar peta (ketik angka, GPS, hasil cari). */
function FollowPoint({ point, radius }: { point: GeoPoint | null; radius: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (!point) return;
    if (radius && radius > 0) {
      map.fitBounds(L.latLng(point.lat, point.lng).toBounds(radius * 2.5), { maxZoom: 18 });
    } else if (!map.getBounds().contains([point.lat, point.lng]) || map.getZoom() < 14) {
      map.setView([point.lat, point.lng], 16);
    }
  }, [map, point, radius]);
  return null;
}

export function GeofenceMap({
  point,
  radius,
  onPick,
}: {
  point: GeoPoint | null;
  radius: number | null;
  onPick: (point: GeoPoint) => void;
}) {
  const center = point ?? INDONESIA;
  const markerHandlers = useMemo(
    () => ({
      dragend: (event: L.LeafletEvent) => {
        const { lat, lng } = (event.target as L.Marker).getLatLng();
        onPick({ lat: round6(lat), lng: round6(lng) });
      },
    }),
    [onPick],
  );
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={point ? 16 : 5}
      scrollWheelZoom
      className="h-64 w-full rounded-lg border"
      aria-label="Peta lokasi kerja: klik untuk menaruh titik"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <ClickToPlace onPick={onPick} />
      <FollowPoint point={point} radius={radius} />
      {point ? (
        <>
          <Marker
            position={[point.lat, point.lng]}
            icon={pinIcon}
            draggable
            eventHandlers={markerHandlers}
          />
          {radius && radius > 0 ? (
            <Circle
              center={[point.lat, point.lng]}
              radius={radius}
              pathOptions={{ color: brandColor(), weight: 2, fillOpacity: 0.12 }}
            />
          ) : null}
        </>
      ) : null}
    </MapContainer>
  );
}
