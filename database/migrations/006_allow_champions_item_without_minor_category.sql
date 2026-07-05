-- Mega Stones have no minor category on the source page.
PRAGMA foreign_keys = OFF;

CREATE TABLE champions_items_new (
  item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  name_ja TEXT NOT NULL,
  effect_ja TEXT NOT NULL,
  major_category TEXT NOT NULL,
  minor_category TEXT,
  source_url TEXT NOT NULL
);

INSERT INTO champions_items_new
SELECT
  item_id,
  name_ja,
  effect_ja,
  major_category,
  minor_category,
  source_url
FROM champions_items;

DROP TABLE champions_items;
ALTER TABLE champions_items_new RENAME TO champions_items;

PRAGMA foreign_keys = ON;
