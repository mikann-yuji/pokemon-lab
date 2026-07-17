-- Pokémon Champions のルール別ポケモン採用順位を保存する。
CREATE TABLE champions_form_usage_rankings (
  form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  battle_format TEXT NOT NULL CHECK (battle_format IN ('single', 'double')),
  usage_rank INTEGER NOT NULL CHECK (usage_rank > 0),
  season TEXT NOT NULL,
  source_url TEXT NOT NULL,
  scraped_at TEXT NOT NULL,
  PRIMARY KEY (form_id, battle_format),
  UNIQUE (battle_format, usage_rank)
);

CREATE INDEX champions_form_usage_rankings_usage_rank_index
  ON champions_form_usage_rankings(battle_format, usage_rank);
