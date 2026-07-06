import { SqliteDiagnostics } from "./sqlite-diagnostics";
import styles from "../pokemon/pokemon-search.module.css";

/**
 * SQLite WASM・OPFS基盤の動作確認ページ。主要機能からはリンクしない。
 */
export default function SqliteDiagnosticsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <p className={styles.kicker}>STORAGE DIAGNOSTICS</p>
          <h1>SQLite WASM診断</h1>
          <p>SQLite Worker、OPFS永続化、user.db内カタログの診断です。</p>
        </header>
        <SqliteDiagnostics />
      </div>
    </main>
  );
}
