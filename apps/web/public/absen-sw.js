// Service worker absen PWA (D-067): WAJIB ONLINE — tidak ada cache/offline. Hanya ada supaya aplikasi
// bisa dipasang ke layar utama (Add to Home Screen). Semua permintaan diteruskan ke jaringan.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // Sengaja kosong: browser memakai jaringan seperti biasa.
});
