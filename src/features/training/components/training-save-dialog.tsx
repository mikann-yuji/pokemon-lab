"use client";

import styles from "../styles/training-simulator.module.css";

export function TrainingSaveDialog({
  buildName,
  saveError,
  isSaving,
  onBuildNameChange,
  onSaveErrorClear,
  onClose,
  onSubmit,
}: {
  buildName: string;
  saveError: string;
  isSaving: boolean;
  onBuildNameChange: (name: string) => void;
  onSaveErrorClear: () => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div
      className={styles.saveOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-dialog-title"
    >
      <button
        className={styles.saveBackdrop}
        type="button"
        aria-label="保存ダイアログを閉じる"
        onClick={onClose}
      />
      <form
        className={styles.saveDialog}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <h2 id="save-dialog-title">育成案を保存</h2>
        <label>
          保存名
          <input
            autoFocus
            maxLength={80}
            value={buildName}
            onChange={(event) => {
              onBuildNameChange(event.target.value);
              onSaveErrorClear();
            }}
          />
        </label>
        {saveError ? <p role="alert">{saveError}</p> : null}
        <div className={styles.saveDialogActions}>
          <button type="button" disabled={isSaving} onClick={onClose}>
            キャンセル
          </button>
          <button type="submit" disabled={isSaving}>
            {isSaving ? "保存中..." : "保存"}
          </button>
        </div>
      </form>
    </div>
  );
}
