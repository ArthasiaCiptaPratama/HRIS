import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Test merender app utuh (router + halaman); saat suite penuh berjalan paralel dan CPU jenuh,
// satu langkah bisa > 1 dtk bawaan findBy*/waitFor. Gagal acak lintas file, bukan state bocor.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
});

// jsdom tidak mengimplementasikan scrollTo (dipakai layout saat pindah halaman).
window.scrollTo = (() => undefined) as typeof window.scrollTo;

// jsdom tidak mengimplementasikan API pointer/scroll yang dipakai Radix Select saat dibuka.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => undefined;
Element.prototype.scrollIntoView ??= () => undefined;
