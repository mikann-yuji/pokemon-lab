import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  signInAnonymously,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??
    "AIzaSyBqcvItvEk3YnYcESLP64lu2y57WKBs41M",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??
    "pokemon-lab.firebaseapp.com",
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "pokemon-lab",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
    "pokemon-lab.firebasestorage.app",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "234960790157",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ??
    "1:234960790157:web:e1084054d9799500b7f8c4",
  measurementId:
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "G-BLCG8R9LPB",
};

let anonymousUserPromise: Promise<User> | null = null;

export function getFirebaseApp(): FirebaseApp {
  return getApps()[0] ?? initializeApp(firebaseConfig);
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

export function getFirebaseFirestore(): Firestore {
  return getFirestore(getFirebaseApp());
}

export async function ensureAnonymousFirebaseUser() {
  const auth = getFirebaseAuth();
  if (auth.currentUser) return auth.currentUser;
  anonymousUserPromise ??= signInAnonymously(auth).then((result) => result.user);
  return anonymousUserPromise;
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(getFirebaseAuth(), provider);
}

export async function signInWithGoogleRedirect() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  await signInWithRedirect(getFirebaseAuth(), provider);
}

export async function getGoogleRedirectResult() {
  return getRedirectResult(getFirebaseAuth());
}

export async function signOutFirebaseUser() {
  await signOut(getFirebaseAuth());
}
