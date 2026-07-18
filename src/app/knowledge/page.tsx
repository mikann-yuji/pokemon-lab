import KnowledgeBoard from "@/features/knowledge/components/knowledge-board";
import styles from "@/features/knowledge/styles/knowledge.module.css";

export default function KnowledgePage() {
  return (
    <main className={styles.container}>
      <header className={styles.hero}>
        <h1>ナレッジ</h1>
        <p>
          対戦で役立つ実数値の目安と、採用上位ポケモンの立ち位置を確認できます。
          アイコンを押すと、そのポケモンの育成シミュレーターへ移動します。
        </p>
      </header>
      <KnowledgeBoard />
    </main>
  );
}
