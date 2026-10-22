import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PunchChannelNote } from "@/features/time-management/components/punch-channel-note";

// MOB-D3: kanal absen tampil untuk approver di Data Absen Harian.
describe("PunchChannelNote", () => {
  it("absen lewat app: tampil versi aplikasi", () => {
    render(<PunchChannelNote source="DEVICE" channel="APP" appVersion="1.2.0+5" />);
    expect(screen.getByText("Lewat aplikasi Android v1.2.0+5")).toBeInTheDocument();
  });

  it("absen lewat PWA: diberi catatan lokasi palsu tidak bisa dideteksi", () => {
    render(<PunchChannelNote source="DEVICE" channel="PWA" appVersion={null} />);
    expect(screen.getByText(/web\/PWA \(lokasi palsu tidak bisa dideteksi\)/)).toBeInTheDocument();
  });

  it("input manual HR atau respons lama tanpa kanal: tidak tampil apa pun", () => {
    const { container: manual } = render(<PunchChannelNote source="MANUAL" channel="PWA" />);
    expect(manual).toBeEmptyDOMElement();
    const { container: old } = render(<PunchChannelNote source="DEVICE" />);
    expect(old).toBeEmptyDOMElement();
  });
});
