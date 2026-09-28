import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

// jsdom tidak mengimplementasikan scrollTo (dipakai layout saat pindah halaman).
window.scrollTo = (() => undefined) as typeof window.scrollTo;
