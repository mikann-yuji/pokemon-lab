/**
 * このファイルの役割: SQLiteからクイズ用のポケモン画像をタイプ別に読み出すインフラ層リポジトリ。
 */

import "server-only";

import Database from "better-sqlite3";
import path from "node:path";
import type { TypeName } from "@/domain/type-matchup";
import type {
  PokemonImage,
  PokemonImagesByType,
} from "@/features/quiz/quiz-logic";

type PokemonTypeImageRow = PokemonImage & {
  typeName: TypeName;
};

/**
 * 単タイプ・複合タイプごとに、表示可能なフォーム画像をまとめる。
 */
export function getPokemonImagesByType(): PokemonImagesByType {
  const databasePath =
    process.env.DATABASE_PATH ??
    path.join(process.cwd(), "data", "pokemon-lab.db");
  const database = new Database(databasePath, { readonly: true });

  try {
    const rows = database
      .prepare(`
        SELECT
          forms.id AS formId,
          COALESCE(forms.name_ja, forms.form_name_ja, forms.name) AS nameJa,
          COALESCE(forms.artwork_default_url, forms.sprite_default_url) AS url,
          form_types.type_name AS typeName
        FROM forms
        JOIN form_types ON form_types.form_id = forms.id
        WHERE COALESCE(
          forms.artwork_default_url,
          forms.sprite_default_url
        ) IS NOT NULL
        ORDER BY forms.sort_order, form_types.slot
      `)
      .all() as PokemonTypeImageRow[];
        // JOIN結果はタイプ数ぶん行が増えるため、フォームID単位で画像とタイプ配列にまとめ直す。
    const forms = new Map<
      number,
      { image: PokemonImage; types: TypeName[] }
    >();

    for (const { typeName, ...image } of rows) {
      const form = forms.get(image.formId) ?? { image, types: [] };
      form.types.push(typeName);
      forms.set(image.formId, form);
    }

        // 単タイプキーと、複合タイプ用の「A|B」キーの両方に同じ画像を登録する。
    const imagesByType: PokemonImagesByType = {};
    for (const { image, types } of forms.values()) {
      for (const type of types) {
        (imagesByType[type] ??= []).push(image);
      }

      if (types.length === 2) {
        const dualTypeKey = [...types].sort().join("|");
        (imagesByType[dualTypeKey] ??= []).push(image);
      }
    }

    return imagesByType;
  } finally {
    database.close();
  }
}
