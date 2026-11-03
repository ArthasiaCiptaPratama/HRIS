import { ConflictError } from "../../core/errors.ts";
import { EMPLOYEE_DOCUMENT_BUCKET, type StorageAdmin } from "../../core/storage.ts";
import { Prisma } from "../../generated/prisma/client.ts";
import { findDocumentByStoragePath } from "./document.repository.ts";

export async function assertUnusedDocumentPath(path: string): Promise<void> {
  if (await findDocumentByStoragePath(path)) {
    throw new ConflictError("File sudah digunakan oleh dokumen lain. Unggah file baru.");
  }
}

export async function isDocumentPathConflict(error: unknown, path: string): Promise<boolean> {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    (await findDocumentByStoragePath(path)) !== null
  );
}

/** Recheck after storage I/O/transaction failure: another request may have claimed the path. */
export async function discardDocumentUpload(storage: StorageAdmin, path: string): Promise<void> {
  if (!(await findDocumentByStoragePath(path))) {
    await storage.removeObjects(EMPLOYEE_DOCUMENT_BUCKET, [path]);
  }
}
