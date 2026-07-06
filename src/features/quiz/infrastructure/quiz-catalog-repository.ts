"use client";

import {
  TYPE_NAMES,
  type TypeMatchup,
  type TypeName,
} from "@/domain/type-matchup";
import { sqliteWorkerClient } from "@/infrastructure/sqlite-wasm/sqlite-client";
import type { SqliteRow } from "@/infrastructure/sqlite-wasm/worker-protocol";
import type {
  PokemonImage,
  PokemonImagesByType,
} from "../quiz-logic";

type TypeRow = SqliteRow & {
  name: TypeName;
  nameJa: string;
};

type MatchupRow = SqliteRow & {
  attackerType: TypeName;
  defenderType: TypeName;
  effectiveness: 0 | 0.5 | 1 | 2;
};

type PokemonTypeImageRow = SqliteRow &
  PokemonImage & {
    typeName: TypeName;
  };

export async function getTypeMatchups(): Promise<TypeMatchup[]> {
  const [types, rows] = await Promise.all([
    sqliteWorkerClient.catalogQuery<TypeRow>(`
      SELECT
        name,
        name_ja AS nameJa
      FROM types
      ORDER BY sort_order
    `),
    sqliteWorkerClient.catalogQuery<MatchupRow>(`
      SELECT
        attacker_type AS attackerType,
        defender_type AS defenderType,
        effectiveness
      FROM type_matchups
    `),
  ]);

  const byAttacker = new Map<TypeName, Map<TypeName, number>>();
  for (const row of rows) {
    const matchups =
      byAttacker.get(row.attackerType) ?? new Map<TypeName, number>();
    matchups.set(row.defenderType, row.effectiveness);
    byAttacker.set(row.attackerType, matchups);
  }

  return types.map(({ name, nameJa }) => {
    const attack = byAttacker.get(name);
    const targetsWith = (effectiveness: number) =>
      TYPE_NAMES.filter((defender) => attack?.get(defender) === effectiveness);
    const attackersWith = (effectiveness: number) =>
      TYPE_NAMES.filter(
        (attacker) => byAttacker.get(attacker)?.get(name) === effectiveness,
      );

    return {
      name,
      nameJa,
      superEffectiveAgainst: targetsWith(2),
      notVeryEffectiveAgainst: targetsWith(0.5),
      noEffectAgainst: targetsWith(0),
      vulnerableTo: attackersWith(2),
      resistantTo: attackersWith(0.5),
      noEffectTo: attackersWith(0),
    };
  });
}

export async function getPokemonImagesByType(): Promise<PokemonImagesByType> {
  const rows = await sqliteWorkerClient.catalogQuery<PokemonTypeImageRow>(`
    SELECT
      forms.id AS formId,
      COALESCE(forms.name_ja, forms.form_name_ja, forms.name) AS nameJa,
      COALESCE(forms.artwork_default_url, forms.sprite_default_url) AS url,
      form_types.type_name AS typeName
    FROM champions_forms
    JOIN forms ON forms.id = champions_forms.form_id
    JOIN form_types ON form_types.form_id = forms.id
    WHERE COALESCE(
      forms.artwork_default_url,
      forms.sprite_default_url
    ) IS NOT NULL
    ORDER BY forms.sort_order, form_types.slot
  `);

  const forms = new Map<number, { image: PokemonImage; types: TypeName[] }>();

  for (const { typeName, ...image } of rows) {
    const form = forms.get(image.formId) ?? { image, types: [] };
    form.types.push(typeName);
    forms.set(image.formId, form);
  }

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
}
