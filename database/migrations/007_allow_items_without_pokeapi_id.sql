-- Champions has new Mega Stones that have not been added to PokeAPI.
CREATE TABLE items_new (
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

CREATE TABLE champions_items_new (
  item_id TEXT PRIMARY KEY REFERENCES items_new(id) ON DELETE CASCADE,
  name_ja TEXT NOT NULL,
  effect_ja TEXT NOT NULL,
  major_category TEXT NOT NULL,
  minor_category TEXT,
  source_url TEXT NOT NULL
);

INSERT INTO items_new SELECT * FROM items;
INSERT INTO champions_items_new SELECT * FROM champions_items;

DROP TABLE champions_items;
DROP TABLE items;
ALTER TABLE items_new RENAME TO items;
ALTER TABLE champions_items_new RENAME TO champions_items;

CREATE INDEX items_category_name_index ON items(category_name);
