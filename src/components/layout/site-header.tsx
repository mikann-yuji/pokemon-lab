"use client";

/**
 * このファイルの役割:
 * 全ページで共通表示するヘッダーと、主要機能へのナビゲーションを定義する。
 */

import Link from "next/link";
import { useState } from "react";
import { TypeMatchupModalButton } from "./type-matchup-modal-button";
import styles from "./site-header.module.css";

const navigationItems = [
  { href: "/pokemon", label: "ポケモン検索" },
  { href: "/damage-calculator", label: "ダメージ計算" },
  { href: "/damage-quiz", label: "ダメージ計算クイズ" },
  { href: "/training", label: "育成シミュレーター" },
  { href: "/battle-team", label: "バトルチーム編成" },
  { href: "/battle-simulator", label: "対戦シミュレータ" },
  { href: "/battle-records", label: "バトル記録" },
  { href: "/quiz", label: "タイプ相性クイズ" },
  { href: "/move-quiz", label: "ポケモン技クイズ" },
  { href: "/base-stat-quiz", label: "種族値クイズ" },
  { href: "/knowledge", label: "ナレッジ" },
] as const;

/** モバイルでは開閉式、デスクトップでは常時表示の共通ヘッダー。 */
export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      className={styles.header}
      onKeyDown={(event) => {
        if (event.key === "Escape") setMenuOpen(false);
      }}
    >
      <div className={styles.inner}>
        <Link
          href="/"
          className={styles.homeLink}
          onClick={() => setMenuOpen(false)}
        >
          PokemonLab
        </Link>

        <nav
          id="site-navigation"
          className={`${styles.navigation} ${
            menuOpen ? styles.navigationOpen : ""
          }`}
          aria-label="メインメニュー"
        >
          {navigationItems.map(({ href, label }) => (
            <Link
              href={href}
              key={href}
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className={styles.headerActions}>
          <TypeMatchupModalButton onOpen={() => setMenuOpen(false)} />
          <button
            type="button"
            className={styles.menuButton}
            aria-label={menuOpen ? "メニューを閉じる" : "メニューを開く"}
            aria-expanded={menuOpen}
            aria-controls="site-navigation"
            onClick={() => setMenuOpen((current) => !current)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>
    </header>
  );
}
