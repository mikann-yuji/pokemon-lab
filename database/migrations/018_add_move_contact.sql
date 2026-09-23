ALTER TABLE moves ADD COLUMN is_contact INTEGER NOT NULL DEFAULT 0 CHECK (is_contact IN (0, 1));

ALTER TABLE champions_ability_damage_modifiers RENAME TO old_ability_damage_modifiers;
CREATE TABLE champions_ability_damage_modifiers (
  id INTEGER PRIMARY KEY,
  ability_id TEXT NOT NULL REFERENCES abilities(id) ON DELETE CASCADE,
  modifier_kind TEXT NOT NULL CHECK (modifier_kind IN ('power', 'attacking_stat', 'received_damage', 'stab')),
  multiplier REAL NOT NULL CHECK (multiplier > 0),
  condition TEXT NOT NULL CHECK (condition IN (
    'always', 'type_match', 'physical', 'special', 'contact', 'low_power_move',
    'critical_hit', 'not_very_effective', 'super_effective', 'super_effective_received',
    'manual', 'manual_type_match', 'manual_physical', 'manual_special'
  )),
  move_type_name TEXT REFERENCES types(name)
);
INSERT INTO champions_ability_damage_modifiers SELECT * FROM old_ability_damage_modifiers;
UPDATE champions_ability_damage_modifiers SET condition = 'contact' WHERE ability_id = 'tough-claws';
DROP TABLE old_ability_damage_modifiers;
