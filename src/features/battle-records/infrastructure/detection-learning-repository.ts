import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import {
  ensureAnonymousFirebaseUser,
  getFirebaseFirestore,
} from "@/infrastructure/firebase/firebase-client";

const COLLECTION_NAME = "battleDetectionSamples";
const REMOTE_SAMPLE_LIMIT = 800;
const MAX_SIGNATURE_LENGTH = 64;

export type DetectionLearningSample = {
  pokemonId: number;
  signature: number[];
  updatedAt: number;
};

function isValidSignature(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_SIGNATURE_LENGTH &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

export async function loadRemoteDetectionSamples(): Promise<
  DetectionLearningSample[]
> {
  const database = getFirebaseFirestore();
  const snapshot = await getDocs(
    query(
      collection(database, COLLECTION_NAME),
      orderBy("updatedAt", "desc"),
      limit(REMOTE_SAMPLE_LIMIT),
    ),
  );

  return snapshot.docs.flatMap((document) => {
    const data = document.data();
    const pokemonId = data.pokemonId;
    if (typeof pokemonId !== "number" || !isValidSignature(data.signature)) {
      return [];
    }
    return [
      {
        pokemonId,
        signature: data.signature,
        updatedAt:
          typeof data.updatedAt === "number" ? data.updatedAt : Date.now(),
      },
    ];
  });
}

export async function saveRemoteDetectionSample(
  sample: DetectionLearningSample,
) {
  if (!isValidSignature(sample.signature)) return;
  await ensureAnonymousFirebaseUser();
  await addDoc(collection(getFirebaseFirestore(), COLLECTION_NAME), {
    pokemonId: sample.pokemonId,
    signature: sample.signature,
    source: "battle-records",
    createdAt: serverTimestamp(),
    updatedAt: Date.now(),
  });
}
