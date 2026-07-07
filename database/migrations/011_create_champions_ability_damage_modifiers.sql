CREATE TABLE champions_ability_damage_modifiers (
  id INTEGER PRIMARY KEY,
  ability_id TEXT NOT NULL REFERENCES abilities(id) ON DELETE CASCADE,
  modifier_kind TEXT NOT NULL CHECK (
    modifier_kind IN ('power', 'attacking_stat', 'received_damage', 'stab')
  ),
  multiplier REAL NOT NULL CHECK (multiplier > 0),
  condition TEXT NOT NULL CHECK (
    condition IN (
      'always',
      'type_match',
      'physical',
      'special',
      'low_power_move',
      'critical_hit',
      'not_very_effective',
      'super_effective',
      'super_effective_received',
      'manual',
      'manual_type_match',
      'manual_physical',
      'manual_special'
    )
  ),
  move_type_name TEXT REFERENCES types(name)
);
