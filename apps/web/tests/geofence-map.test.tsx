import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GeofenceMap } from "@/features/organization/components/geofence-map";

// BUG-002: MapContainer react-leaflet tidak meneruskan aria-label ke DOM, jadi peta tanpa nama aksesibel.
describe("GeofenceMap", () => {
  it("elemen peta punya label aksesibel", () => {
    const { container } = render(<GeofenceMap point={null} radius={null} onPick={() => {}} />);
    const map = container.querySelector(".leaflet-container");
    expect(map).not.toBeNull();
    expect(map?.getAttribute("aria-label")).toBe("Peta lokasi kerja: klik untuk menaruh titik");
  });
});
