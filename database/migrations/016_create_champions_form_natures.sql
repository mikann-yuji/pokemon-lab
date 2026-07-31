CREATE TABLE champions_form_natures (
  form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  battle_format TEXT NOT NULL CHECK (battle_format IN ('single', 'double')),
  nature_id TEXT NOT NULL REFERENCES natures(id),
  usage_rate REAL NOT NULL CHECK (usage_rate >= 0 AND usage_rate <= 100),
  season TEXT NOT NULL,
  source_url TEXT NOT NULL,
  scraped_at TEXT NOT NULL,
  PRIMARY KEY (form_id, battle_format)
);
