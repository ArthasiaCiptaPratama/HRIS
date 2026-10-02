import { getPrisma } from "../../src/core/db.ts";

// D-045: isian onboarding lengkap (lolos onboardingCompleteness) langsung di DB — wizard diuji di
// onboarding-wizard.test; dipakai test review & login NIK.
const digits16 = () =>
  `62${Array.from({ length: 14 }, () => Math.floor(Math.random() * 10)).join("")}`;

export async function completeData(employeeId: string, accountId: string) {
  const ktpNumber = digits16();
  await getPrisma().employee.update({
    where: { id: employeeId },
    data: {
      gender: "FEMALE",
      phoneNumber: "081234567890",
      emergencyContactName: "Budi",
      emergencyContactRelationship: "Ayah",
      emergencyPhone: "081298765432",
      photoPath: `employees/${employeeId}/photo.jpg`,
      personal: {
        upsert: {
          create: {
            birthPlace: "Palangka Raya",
            birthDate: new Date("2001-02-03T00:00:00.000Z"),
            ktpNumber,
            kkNumber: digits16(),
            religion: "ISLAM",
            maritalStatus: "SINGLE",
            ktpAddress: "Jl. Contoh 1",
            domicileAddress: "Jl. Contoh 2",
            originCity: "Kuala Kapuas",
            npwpAbsent: true,
            bpjsEmploymentAbsent: true,
            bpjsHealthAbsent: true,
          },
          update: {
            birthPlace: "Palangka Raya",
            birthDate: new Date("2001-02-03T00:00:00.000Z"),
            kkNumber: digits16(),
            religion: "ISLAM",
            maritalStatus: "SINGLE",
            ktpAddress: "Jl. Contoh 1",
            domicileAddress: "Jl. Contoh 2",
            originCity: "Kuala Kapuas",
            npwpAbsent: true,
            bpjsEmploymentAbsent: true,
            bpjsHealthAbsent: true,
          },
        },
      },
      bankAccount: {
        create: { bankName: "BRI", accountNumber: "1234567890", accountHolder: "Ani" },
      },
      educations: { create: [{ level: "S1", schoolName: "Universitas Contoh" }] },
      documents: {
        create: ["KTP", "KK", "DIPLOMA", "BANK_BOOK"].map((type) => ({
          type: type as "KTP",
          storagePath: `employees/${employeeId}/documents/${type}.pdf`,
          mimeType: "application/pdf",
          sizeBytes: 1000,
          uploadedBy: accountId,
        })),
      },
    },
  });
}
