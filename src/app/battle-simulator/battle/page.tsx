import { BattleSimulator } from "@/features/battle-simulator/components/battle-simulator";
import styles from "@/features/battle-simulator/styles/battle-simulator.module.css";

function parseTeamId(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (!rawValue) return null;
  const numericValue = Number(rawValue);
  return Number.isFinite(numericValue) ? numericValue : null;
}

export default async function BattleSimulatorBattlePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const player1TeamId = parseTeamId(params.player1);
  const player2TeamId = parseTeamId(params.player2);

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <p>Solo Battle Lab</p>
        <h1>対戦シミュレータ</h1>
        <span>
          1人でPlayer 1とPlayer 2を操作し、技選択と交代を進めます。
        </span>
      </header>
      <BattleSimulator
        player1TeamId={player1TeamId}
        player2TeamId={player2TeamId}
      />
    </main>
  );
}
