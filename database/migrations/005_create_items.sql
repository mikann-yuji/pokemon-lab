-- PokeAPI item master and the subset available in Pokemon Champions.
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  pokeapi_id INTEGER UNIQUE,
  name_ja TEXT,
  category_name TEXT NOT NULL,
  cost INTEGER NOT NULL CHECK (cost >= 0),
  fling_power INTEGER CHECK (fling_power IS NULL OR fling_power >= 0),
  fling_effect_name TEXT,
  effect_en TEXT,
  effect_ja TEXT,
  sprite_default_url TEXT
);

CREATE INDEX items_category_name_index ON items(category_name);

CREATE TABLE champions_items (
  item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  name_ja TEXT NOT NULL,
  effect_ja TEXT NOT NULL,
  major_category TEXT NOT NULL,
  minor_category TEXT,
  source_url TEXT NOT NULL
);
