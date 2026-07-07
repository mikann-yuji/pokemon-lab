PRAGMA foreign_keys = OFF;

CREATE TABLE champions_item_damage_modifiers_new (
  item_id TEXT PRIMARY KEY REFERENCES champions_items(item_id) ON DELETE CASCADE,
  modifier_kind TEXT NOT NULL CHECK (
    modifier_kind IN ('power', 'attacking_stat', 'received_damage')
  ),
  multiplier REAL NOT NULL CHECK (multiplier > 0),
  max_multiplier REAL CHECK (max_multiplier IS NULL OR max_multiplier >= multiplier),
  condition TEXT NOT NULL CHECK (
    condition IN (
      'always',
      'type_match',
      'physical',
      'special',
      'super_effective',
      'super_effective_type_match',
      'consecutive_use',
      'pokemon_match'
    )
  ),
  move_type_name TEXT REFERENCES types(name),
  pokemon_name TEXT
);

DROP TABLE champions_item_damage_modifiers;
ALTER TABLE champions_item_damage_modifiers_new RENAME TO champions_item_damage_modifiers;

PRAGMA foreign_keys = ON;
