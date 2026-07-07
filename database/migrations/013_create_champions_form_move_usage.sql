-- このファイルの役割: Pokémon Championsのフォーム別わざ採用率を保存する。

CREATE TABLE champions_form_move_usage (
  form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  move_id TEXT NOT NULL REFERENCES moves(id),
  usage_rate REAL NOT NULL CHECK (usage_rate >= 0),
  source_url TEXT NOT NULL,
  scraped_at TEXT NOT NULL,
  PRIMARY KEY (form_id, move_id)
);

CREATE INDEX champions_form_move_usage_move_id_index
  ON champions_form_move_usage(move_id);
