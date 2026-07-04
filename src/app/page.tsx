import Link from "next/link";
import styles from "./page.module.css";

const stats = [
  { label: "Indexed species", value: "151" },
  { label: "Lab notes", value: "24" },
  { label: "Offline ready", value: "PWA" },
];

const researchCards = [
  {
    title: "Type Matchups",
    body: "Compare strengths, resistances, and team coverage before you head into a battle.",
  },
  {
    title: "Field Journal",
    body: "Keep quick notes about sightings, habitats, moves, and evolution conditions.",
  },
  {
    title: "Team Builder",
    body: "Sketch balanced parties for raids, gyms, and friendly experiments in the lab.",
  },
  {
    title: "Type Quiz",
    body: "Test your knowledge of Pokémon type matchups with an interactive quiz.",
    link: "/quiz",
  },
];

export default function Home() {
  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>PokemonLab PWA</p>
          <h1 id="home-title">PokemonLab</h1>
          <p className={styles.lede}>
            A fast, installable research desk for Pokemon notes, type checks,
            and team planning.
          </p>
        </div>

        <div className={styles.device} aria-label="PokemonLab sample screen">
          <div className={styles.deviceHeader}>
            <span />
            <span />
            <span />
          </div>
          <div className={styles.pokemonMark}>
            <span className={styles.spark}>+</span>
          </div>
          <div className={styles.scanLines}>
            <span />
            <span />
            <span />
          </div>
        </div>
      </section>

      <section className={styles.stats} aria-label="Lab status">
        {stats.map((item) => (
          <div className={styles.stat} key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </section>

      <section className={styles.cards} aria-label="Research tools">
        {researchCards.map((card) => (
          <article className={styles.card} key={card.title}>
            {card.link ? (
              <Link href={card.link} style={{ textDecoration: "none", color: "inherit" }}>
                <h2>{card.title}</h2>
                <p>{card.body}</p>
              </Link>
            ) : (
              <>
                <h2>{card.title}</h2>
                <p>{card.body}</p>
              </>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
