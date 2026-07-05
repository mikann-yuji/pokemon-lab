import Link from "next/link";
import { notFound } from "next/navigation";
import { getPokemonDetail, isChampionsForm } from "@/infrastructure/database/pokemon-search-repository";
import { TrainingSimulator } from "@/features/training/components/training-simulator";
import {
  getHeldItems,
  getNatures,
} from "@/features/training/infrastructure/training-repository";
import pageStyles from "../../pokemon/pokemon-search.module.css";

export default async function TrainingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || !isChampionsForm(id)) notFound();
  const pokemon = getPokemonDetail(id);
  if (!pokemon) notFound();
  return <main className={pageStyles.page}><div className={pageStyles.container}>
    <Link href="/training" className={pageStyles.backLink}>← 育成ポケモン選択へ戻る</Link>
    <TrainingSimulator
      pokemon={pokemon}
      natures={getNatures()}
      heldItems={getHeldItems()}
    />
  </div></main>;
}
