import { BattleSimulator } from "@/features/battle-simulator/components/battle-simulator";
import styles from "@/features/battle-simulator/styles/battle-simulator.module.css";

export default function BattleSimulatorPage() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <p>Solo Battle Lab</p>
        <h1>対戦シミュレータ</h1>
        <span>
          保存済みのバトルチームを2つ選び、1人でPlayer 1とPlayer
          2を操作するための対戦準備画面です。
        </span>
      </header>
      <BattleSimulator />
    </main>
  );
}
