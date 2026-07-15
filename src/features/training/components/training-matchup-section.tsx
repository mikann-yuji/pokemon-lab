"use client";

import type {
  TrainingMatchupKind,
  TrainingMatchupNote,
} from "../infrastructure/training-build-repository";
import styles from "../styles/training-simulator.module.css";
import { MatchupNotePanel } from "./training-matchup-note-panel";
import type { MatchupSearchOption } from "./training-simulator-model";

export function TrainingMatchupSection({
  activeBuildId,
  matchupError,
  matchupNotes,
  matchupOptions,
  savingKind,
  onSave,
  onDelete,
}: {
  activeBuildId: number | null;
  matchupError: string;
  matchupNotes: TrainingMatchupNote[];
  matchupOptions: MatchupSearchOption[];
  savingKind: TrainingMatchupKind | null;
  onSave: (input: {
    matchupKind: TrainingMatchupKind;
    target: MatchupSearchOption | null;
    note: string;
  }) => Promise<boolean>;
  onDelete: (noteId: number) => void;
}) {
  return (
    <section className={styles.matchupNotes}>
      <div className={styles.matchupNotesHeader}>
        <h2>有利・不利メモ</h2>
        <span>{activeBuildId ? "この育成案に保存" : "育成案保存時に一緒に保存"}</span>
      </div>
      {matchupError ? (
        <p className={styles.matchupError} role="alert">
          {matchupError}
        </p>
      ) : null}
      <div className={styles.matchupColumns}>
        <MatchupNotePanel
          title="有利なポケモン"
          matchupKind="favorable"
          options={matchupOptions}
          notes={matchupNotes.filter((note) => note.matchupKind === "favorable")}
          disabled={false}
          saving={savingKind === "favorable"}
          onSave={onSave}
          onDelete={onDelete}
        />
        <MatchupNotePanel
          title="不利なポケモン"
          matchupKind="unfavorable"
          options={matchupOptions}
          notes={matchupNotes.filter((note) => note.matchupKind === "unfavorable")}
          disabled={false}
          saving={savingKind === "unfavorable"}
          onSave={onSave}
          onDelete={onDelete}
        />
      </div>
    </section>
  );
}
