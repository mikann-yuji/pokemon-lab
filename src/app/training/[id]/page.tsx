import Link from "next/link";
import { notFound } from "next/navigation";
import { getPokemonDetail, isChampionsForm } from "@/infrastructure/database/pokemon-search-repository";
import { TrainingSimulator } from "@/features/training/components/training-simulator";
import {
  getHeldItems,
  getNatures,
} from "@/features/training/infrastructure/training-repository";
import pageStyles from "../../pokemon/pokemon-search.module.css";

export default async function TrainingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ build?: string | string[] }>;
}) {
  const id = Number((await params).id);
  const rawBuildId = (await searchParams).build;
  const buildId = Number(Array.isArray(rawBuildId) ? rawBuildId[0] : rawBuildId);
  if (!Number.isInteger(id) || !isChampionsForm(id)) notFound();
  const pokemon = getPokemonDetail(id);
  if (!pokemon) notFound();
  return <main className={pageStyles.page}><div className={pageStyles.container}>
    <nav className={pageStyles.trainingNavigation} aria-label="育成メニュー">
      <Link href="/training">← 育成ポケモン選択へ戻る</Link>
      <Link href="/training-builds">保存した育成案の一覧を見る</Link>
    </nav>
    <TrainingSimulator
      pokemon={pokemon}
      natures={getNatures()}
      heldItems={getHeldItems()}
      initialBuildId={Number.isInteger(buildId) && buildId > 0 ? buildId : undefined}
    />
  </div></main>;
}
