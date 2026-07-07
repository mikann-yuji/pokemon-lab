import { BattleSimulatorTeamSelect } from "@/features/battle-simulator/components/battle-simulator";
import styles from "@/features/battle-simulator/styles/battle-simulator.module.css";

export default function BattleSimulatorPage() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <p>Solo Battle Lab</p>
        <h1>対戦シミュレータ</h1>
        <span>
          保存済みのバトルチームを2つ選び、対戦画面へ進みます。
        </span>
      </header>
      <BattleSimulatorTeamSelect />
    </main>
  );
}
