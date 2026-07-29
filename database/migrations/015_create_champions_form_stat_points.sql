CREATE TABLE champions_form_stat_points (
  form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  battle_format TEXT NOT NULL CHECK (battle_format IN ('single', 'double')),
  hp INTEGER NOT NULL CHECK (hp BETWEEN 0 AND 32),
  attack INTEGER NOT NULL CHECK (attack BETWEEN 0 AND 32),
  defense INTEGER NOT NULL CHECK (defense BETWEEN 0 AND 32),
  special_attack INTEGER NOT NULL CHECK (special_attack BETWEEN 0 AND 32),
  special_defense INTEGER NOT NULL CHECK (special_defense BETWEEN 0 AND 32),
  speed INTEGER NOT NULL CHECK (speed BETWEEN 0 AND 32),
  usage_rate REAL NOT NULL CHECK (usage_rate >= 0 AND usage_rate <= 100),
  season TEXT NOT NULL,
  source_url TEXT NOT NULL,
  scraped_at TEXT NOT NULL,
  PRIMARY KEY (form_id, battle_format)
);
