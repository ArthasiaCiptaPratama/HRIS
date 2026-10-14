// Hari libur nasional & cuti bersama resmi Indonesia (SKB 3 Menteri: Menteri Agama, Menteri
// Ketenagakerjaan, Menteri PANRB). Sumber: setneg.go.id —
//   2026: SKB No. 1497/2/5 Tahun 2025 (ditandatangani 19 Sep 2025)
//   2027: SKB No. 1205/3/2 Tahun 2026 (ditandatangani 15 Sep 2026)
// Tanggal hari besar Islam dapat berubah mengikuti Keputusan Menteri Agama; SA bisa mengubah di kalender.
// Cuti bersama bagi pekerja swasta bersifat fakultatif (kebijakan perusahaan).

export interface OfficialHoliday {
  date: string;
  name: string;
  kind: "NATIONAL" | "COLLECTIVE_LEAVE";
}

const N = (date: string, name: string): OfficialHoliday => ({ date, name, kind: "NATIONAL" });
const C = (date: string, name: string): OfficialHoliday => ({
  date,
  name: `Cuti bersama ${name}`,
  kind: "COLLECTIVE_LEAVE",
});

export const OFFICIAL_HOLIDAYS_ID: Record<number, OfficialHoliday[]> = {
  2026: [
    N("2026-01-01", "Tahun Baru 2026 Masehi"),
    N("2026-01-16", "Isra Mikraj Nabi Muhammad SAW"),
    C("2026-02-16", "Tahun Baru Imlek 2577 Kongzili"),
    N("2026-02-17", "Tahun Baru Imlek 2577 Kongzili"),
    C("2026-03-18", "Hari Suci Nyepi (Tahun Baru Saka 1948)"),
    N("2026-03-19", "Hari Suci Nyepi (Tahun Baru Saka 1948)"),
    C("2026-03-20", "Idulfitri 1447 H"),
    N("2026-03-21", "Idulfitri 1447 H"),
    N("2026-03-22", "Idulfitri 1447 H (hari kedua)"),
    C("2026-03-23", "Idulfitri 1447 H"),
    C("2026-03-24", "Idulfitri 1447 H"),
    N("2026-04-03", "Wafat Yesus Kristus"),
    N("2026-04-05", "Kebangkitan Yesus Kristus (Paskah)"),
    N("2026-05-01", "Hari Buruh Internasional"),
    N("2026-05-14", "Kenaikan Yesus Kristus"),
    C("2026-05-15", "Kenaikan Yesus Kristus"),
    N("2026-05-27", "Iduladha 1447 H"),
    C("2026-05-28", "Iduladha 1447 H"),
    N("2026-05-31", "Hari Raya Waisak 2570 BE"),
    N("2026-06-01", "Hari Lahir Pancasila"),
    N("2026-06-16", "1 Muharam Tahun Baru Islam 1448 H"),
    N("2026-08-17", "Proklamasi Kemerdekaan RI"),
    N("2026-08-25", "Maulid Nabi Muhammad SAW"),
    C("2026-12-24", "Kelahiran Yesus Kristus (Natal)"),
    N("2026-12-25", "Kelahiran Yesus Kristus (Natal)"),
  ],
  2027: [
    N("2027-01-01", "Tahun Baru 2027 Masehi"),
    N("2027-01-05", "Isra Mikraj Nabi Muhammad SAW"),
    C("2027-02-05", "Tahun Baru Imlek 2578 Kongzili"),
    N("2027-02-06", "Tahun Baru Imlek 2578 Kongzili"),
    N("2027-03-08", "Hari Suci Nyepi (Tahun Baru Saka 1949)"),
    C("2027-03-09", "Idulfitri 1448 H"),
    N("2027-03-10", "Idulfitri 1448 H"),
    N("2027-03-11", "Idulfitri 1448 H (hari kedua)"),
    C("2027-03-12", "Idulfitri 1448 H"),
    C("2027-03-15", "Idulfitri 1448 H"),
    C("2027-03-25", "Wafat Yesus Kristus"),
    N("2027-03-26", "Wafat Yesus Kristus"),
    N("2027-03-28", "Kebangkitan Yesus Kristus (Paskah)"),
    N("2027-05-01", "Hari Buruh Internasional"),
    N("2027-05-06", "Kenaikan Yesus Kristus"),
    N("2027-05-17", "Iduladha 1448 H"),
    C("2027-05-18", "Iduladha 1448 H"),
    C("2027-05-19", "Hari Raya Waisak 2571 BE"),
    N("2027-05-20", "Hari Raya Waisak 2571 BE"),
    N("2027-06-01", "Hari Lahir Pancasila"),
    N("2027-06-06", "1 Muharam Tahun Baru Islam 1449 H"),
    N("2027-08-15", "Maulid Nabi Muhammad SAW"),
    N("2027-08-17", "Proklamasi Kemerdekaan RI"),
    C("2027-12-24", "Kelahiran Yesus Kristus (Natal)"),
    N("2027-12-25", "Kelahiran Yesus Kristus (Natal)"),
    N("2027-12-26", "Isra Mikraj Nabi Muhammad SAW"),
  ],
};
