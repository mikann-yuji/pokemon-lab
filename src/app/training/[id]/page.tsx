import Link from "next/link";
import { TrainingSimulatorLoader } from "@/features/training/components/training-simulator-loader";
import pageStyles from "../../pokemon/pokemon-search.module.css";

/**
 * 育成シミュレーターの詳細ページ。
 * [id]はポケモンID、?build= は保存済み育成案IDとして扱う。
 */
export default async function TrainingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ build?: string | string[] }>;
}) {
  const id = Number((await params).id);
  const rawBuildId = (await searchParams).build;
  // buildは任意なので、正の整数に変換できた時だけLoaderへ渡す。
  const buildId = Number(Array.isArray(rawBuildId) ? rawBuildId[0] : rawBuildId);

  return (
    <main className={pageStyles.page}>
      <div className={pageStyles.container}>
        <nav className={pageStyles.trainingNavigation} aria-label="育成メニュー">
          <Link href="/training">← 育成ポケモン選択へ戻る</Link>
          <Link href="/training-builds">保存した育成案の一覧を見る</Link>
        </nav>
        <TrainingSimulatorLoader
          pokemonId={id}
          initialBuildId={Number.isInteger(buildId) && buildId > 0 ? buildId : undefined}
        />
      </div>
    </main>
  );
}
