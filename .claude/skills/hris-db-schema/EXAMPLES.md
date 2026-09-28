# Contoh integration test constraint

Pola dari `apps/api/tests/integration/employee-schema.test.ts`:

```ts
const prisma = getPrisma();
const RUN = crypto.randomUUID().slice(0, 8);          // penanda data milik test ini
const attempt = <T>(run: () => PromiseLike<T>) => (async () => run())();

beforeAll(async () => { /* buat master data dengan nama berakhiran RUN */ });
afterAll(async () => {                                  // bersihkan urut dari anak ke induk
  await prisma.employee.deleteMany({ where: { employeeNumber: { startsWith: `T-${RUN}-` } } });
  // ... master data
  await disconnectPrisma();
});

test("kunci unik", async () => {
  await create("dup");
  await expect(attempt(() => create("dup"))).rejects.toMatchObject({ code: "P2002" });
});
test("FK restrict", async () => {
  await expect(attempt(() => prisma.position.delete({ where: { id } }))).rejects
    .toMatchObject({ code: "P2003" });
});
```

Setelah test: pastikan tidak ada sisa data (`SELECT count(*)` di tabel yang disentuh).
