-- このファイルの役割: 性格名と能力補正を全機能で共有するマスタを作成する。

CREATE TABLE natures (
  id TEXT PRIMARY KEY,
  name_ja TEXT NOT NULL UNIQUE,
  increased_stat_id TEXT REFERENCES stats(id),
  decreased_stat_id TEXT REFERENCES stats(id),
  sort_order INTEGER NOT NULL UNIQUE,
  CHECK (
    (increased_stat_id IS NULL AND decreased_stat_id IS NULL)
    OR (
      increased_stat_id IS NOT NULL
      AND decreased_stat_id IS NOT NULL
      AND increased_stat_id <> decreased_stat_id
    )
  )
);
