import "server-only";

import Database from "better-sqlite3";
import path from "node:path";
import type { TypeName } from "@/domain/type-matchup";

type PokemonSearchRow = {
  id: number;
  name: string;
  nameJa: string;
  imageUrl: string | null;
  typeName: TypeName;
};

export type PokemonSearchResult = {
  id: number;
  name: string;
  nameJa: string;
  imageUrl: string | null;
  types: TypeName[];
};

/**
 * 日本語名・英語名・フォーム名からポケモンを検索する。
 */
export function searchPokemon(query: string): PokemonSearchResult[] {
  const databasePath =
    process.env.DATABASE_PATH ??
    path.join(process.cwd(), "data", "pokemon-lab.db");
  const database = new Database(databasePath, { readonly: true });
  const normalizedQuery = query.trim();
  const escapedQuery = normalizedQuery.replaceAll(
    /([%_\\])/g,
    "\\$1",
  );
  const searchPattern = `%${escapedQuery}%`;

  try {
    const rows = database
      .prepare(`
        SELECT
          forms.id,
          forms.name,
          COALESCE(forms.name_ja, forms.form_name_ja, forms.name) AS nameJa,
          COALESCE(
            forms.artwork_default_url,
            forms.sprite_default_url
          ) AS imageUrl,
          form_types.type_name AS typeName
        FROM forms
        JOIN form_types ON form_types.form_id = forms.id
        WHERE
          @query = ''
          OR forms.name LIKE @pattern ESCAPE '\\'
          OR forms.name_ja LIKE @pattern ESCAPE '\\'
          OR forms.form_name LIKE @pattern ESCAPE '\\'
          OR forms.form_name_ja LIKE @pattern ESCAPE '\\'
        ORDER BY
          forms.species_id,
          forms.is_default DESC,
          forms.form_order,
          form_types.slot
        LIMIT 100
      `)
      .all({ query: normalizedQuery, pattern: searchPattern }) as PokemonSearchRow[];
    const results = new Map<number, PokemonSearchResult>();

    for (const row of rows) {
      const result = results.get(row.id) ?? {
        id: row.id,
        name: row.name,
        nameJa: row.nameJa,
        imageUrl: row.imageUrl,
        types: [],
      };
      result.types.push(row.typeName);
      results.set(row.id, result);
    }

    return [...results.values()];
  } finally {
    database.close();
  }
}
