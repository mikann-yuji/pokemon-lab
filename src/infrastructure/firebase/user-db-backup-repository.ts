import {
  Bytes,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { getFirebaseFirestore } from "./firebase-client";

const CHUNK_SIZE = 700 * 1024;
const BACKUP_ROOT = "userDbBackup";
const CURRENT_BACKUP_ID = "current";

export type UserDatabaseBackupMetadata = {
  chunkCount: number;
  totalBytes: number;
  updatedAt: number;
};

function getBackupDoc(database: Firestore, uid: string) {
  return doc(database, "users", uid, BACKUP_ROOT, CURRENT_BACKUP_ID);
}

function getChunksCollection(database: Firestore, uid: string) {
  return collection(
    database,
    "users",
    uid,
    BACKUP_ROOT,
    CURRENT_BACKUP_ID,
    "chunks",
  );
}

function chunkId(index: number) {
  return String(index).padStart(5, "0");
}

export async function getUserDatabaseBackupMetadata(
  uid: string,
): Promise<UserDatabaseBackupMetadata | null> {
  const snapshot = await getDoc(getBackupDoc(getFirebaseFirestore(), uid));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  if (
    typeof data.chunkCount !== "number" ||
    typeof data.totalBytes !== "number" ||
    typeof data.updatedAt !== "number"
  ) {
    return null;
  }
  return {
    chunkCount: data.chunkCount,
    totalBytes: data.totalBytes,
    updatedAt: data.updatedAt,
  };
}

export async function saveUserDatabaseBackup(uid: string, bytes: Uint8Array) {
  const database = getFirebaseFirestore();
  const chunksRef = getChunksCollection(database, uid);
  const existingChunks = await getDocs(chunksRef);
  let batch = writeBatch(database);
  let writeCount = 0;

  for (const snapshot of existingChunks.docs) {
    batch.delete(snapshot.ref);
    writeCount += 1;
    if (writeCount >= 450) {
      await batch.commit();
      batch = writeBatch(database);
      writeCount = 0;
    }
  }

  const chunkCount = Math.ceil(bytes.byteLength / CHUNK_SIZE);
  for (let index = 0; index < chunkCount; index += 1) {
    const start = index * CHUNK_SIZE;
    const end = Math.min(bytes.byteLength, start + CHUNK_SIZE);
    const chunk = bytes.slice(start, end);
    batch.set(doc(chunksRef, chunkId(index)), {
      index,
      bytes: Bytes.fromUint8Array(chunk),
      size: chunk.byteLength,
    });
    writeCount += 1;
    if (writeCount >= 450) {
      await batch.commit();
      batch = writeBatch(database);
      writeCount = 0;
    }
  }

  const updatedAt = Date.now();
  batch.set(getBackupDoc(database, uid), {
    chunkCount,
    totalBytes: bytes.byteLength,
    updatedAt,
    updatedAtServer: serverTimestamp(),
  });
  await batch.commit();
  return { chunkCount, totalBytes: bytes.byteLength, updatedAt };
}

export async function loadUserDatabaseBackup(uid: string) {
  const database = getFirebaseFirestore();
  const metadata = await getUserDatabaseBackupMetadata(uid);
  if (!metadata) return null;

  const chunks = await Promise.all(
    Array.from({ length: metadata.chunkCount }, async (_, index) => {
      const snapshot = await getDoc(doc(getChunksCollection(database, uid), chunkId(index)));
      if (!snapshot.exists()) {
        throw new Error("クラウド上のuser.dbバックアップが不完全です。");
      }
      const bytes = snapshot.data().bytes;
      if (!(bytes instanceof Bytes)) {
        throw new Error("クラウド上のuser.dbチャンク形式が正しくありません。");
      }
      return bytes.toUint8Array();
    }),
  );

  const merged = new Uint8Array(metadata.totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { metadata, bytes: merged };
}

export async function deleteUserDatabaseBackup(uid: string) {
  const database = getFirebaseFirestore();
  const chunks = await getDocs(getChunksCollection(database, uid));
  const batch = writeBatch(database);
  for (const snapshot of chunks.docs) {
    batch.delete(snapshot.ref);
  }
  batch.delete(getBackupDoc(database, uid));
  await batch.commit();
}
