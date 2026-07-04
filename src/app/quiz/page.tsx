/**
 * このファイルの役割: タイプ相性クイズ画面。DBから相性データと画像候補を読み込み、クイズUIへ渡す。
 */

import Link from "next/link";
import QuizGame from "@/features/quiz/components/quiz-game";
import TypeMatchupMatrix from "@/features/quiz/components/type-matchup-matrix";
import { createQuestions } from "@/features/quiz/quiz-logic";
import styles from "@/features/quiz/styles/quiz-page.module.css";
import { getTypeMatchups } from "@/infrastructure/database/type-matchup-repository";
import { getPokemonImagesByType } from "@/infrastructure/database/pokemon-image-repository";

/**
 * SQLiteからタイプ相性を読み込み、クイズと確認用マトリックスを表示するページ。
 */
export default function QuizPage() {
  // DBアクセスはServer Componentで行い、ブラウザ側には必要なデータだけを渡す。
  const typeMatchups = getTypeMatchups();
  const pokemonImagesByType = getPokemonImagesByType();
  const initialQuestions = createQuestions(typeMatchups, {
    pokemonImagesByType,
  });

  return (
    <main className={styles.container}>
      <Link href="/" className={styles.backLink}>
        ← けんきゅうじょへ もどる
      </Link>
      <header className={styles.hero}>
        <h1>タイプあいしょう チャレンジ！</h1>
        <p>わざの こうかを おぼえて、めざせ タイプマスター！</p>
      </header>
      <QuizGame
        initialQuestions={initialQuestions}
        typeMatchups={typeMatchups}
        pokemonImagesByType={pokemonImagesByType}
      />
      <TypeMatchupMatrix typeMatchups={typeMatchups} />
    </main>
  );
}
