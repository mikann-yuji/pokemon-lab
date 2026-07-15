"use client";

import styles from "../styles/training-simulator.module.css";

export type TrainingToastState = {
  type: "success" | "error";
  message: string;
} | null;

export function TrainingToast({ toast }: { toast: TrainingToastState }) {
  if (!toast) return null;

  return (
    <div
      className={`${styles.toast} ${
        toast.type === "success" ? styles.toastSuccess : styles.toastError
      }`}
      role={toast.type === "error" ? "alert" : "status"}
      aria-live={toast.type === "error" ? "assertive" : "polite"}
    >
      {toast.message}
    </div>
  );
}
