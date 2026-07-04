-- PokeAPI mapping:
--   species = /pokemon-species/{id}
--   forms   = /pokemon/{id} (battle-relevant variety, including Mega forms)
-- Cosmetic metadata from /pokemon-form/{id} is stored on forms when available.

CREATE TABLE species (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  name_ja TEXT,
  sort_order INTEGER NOT NULL,
  generation_id INTEGER,
  evolution_chain_id INTEGER,
  gender_rate INTEGER NOT NULL,
  capture_rate INTEGER NOT NULL,
  base_happiness INTEGER,
  hatch_counter INTEGER NOT NULL,
  growth_rate_name TEXT,
  color_name TEXT,
  shape_name TEXT,
  habitat_name TEXT,
  is_baby INTEGER NOT NULL CHECK (is_baby IN (0, 1)),
  is_legendary INTEGER NOT NULL CHECK (is_legendary IN (0, 1)),
  is_mythical INTEGER NOT NULL CHECK (is_mythical IN (0, 1)),
  has_gender_differences INTEGER NOT NULL
    CHECK (has_gender_differences IN (0, 1)),
  forms_switchable INTEGER NOT NULL CHECK (forms_switchable IN (0, 1))
);

CREATE TABLE forms (
  id INTEGER PRIMARY KEY,
  species_id INTEGER NOT NULL REFERENCES species(id) ON DELETE CASCADE,
  name TEXT NOT NULL UNIQUE,
  name_ja TEXT,
  form_name TEXT,
  form_name_ja TEXT,
  pokeapi_form_id INTEGER UNIQUE,
  sort_order INTEGER NOT NULL,
  form_order INTEGER,
  height INTEGER NOT NULL,
  weight INTEGER NOT NULL,
  base_experience INTEGER,
  is_default INTEGER NOT NULL CHECK (is_default IN (0, 1)),
  is_battle_only INTEGER NOT NULL DEFAULT 0
    CHECK (is_battle_only IN (0, 1)),
  is_mega INTEGER NOT NULL DEFAULT 0 CHECK (is_mega IN (0, 1)),
  sprite_default_url TEXT,
  sprite_shiny_url TEXT,
  artwork_default_url TEXT,
  artwork_shiny_url TEXT,
  cry_latest_url TEXT,
  cry_legacy_url TEXT
);

CREATE INDEX forms_species_id_index ON forms(species_id);

CREATE TABLE abilities (
  id TEXT PRIMARY KEY,
  pokeapi_id INTEGER NOT NULL UNIQUE,
  name_ja TEXT,
  generation_id INTEGER,
  is_main_series INTEGER NOT NULL CHECK (is_main_series IN (0, 1)),
  effect_en TEXT,
  effect_ja TEXT
);

CREATE TABLE form_abilities (
  form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  ability_id TEXT NOT NULL REFERENCES abilities(id),
  slot INTEGER NOT NULL CHECK (slot > 0),
  is_hidden INTEGER NOT NULL CHECK (is_hidden IN (0, 1)),
  PRIMARY KEY (form_id, ability_id, slot)
);

CREATE INDEX form_abilities_ability_id_index
  ON form_abilities(ability_id);

CREATE TABLE stats (
  id TEXT PRIMARY KEY,
  pokeapi_id INTEGER NOT NULL UNIQUE,
  name_ja TEXT,
  game_index INTEGER,
  is_battle_only INTEGER NOT NULL CHECK (is_battle_only IN (0, 1))
);

CREATE TABLE form_stats (
  form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  stat_id TEXT NOT NULL REFERENCES stats(id),
  base_stat INTEGER NOT NULL CHECK (base_stat >= 0),
  effort INTEGER NOT NULL CHECK (effort >= 0),
  PRIMARY KEY (form_id, stat_id)
);

CREATE INDEX form_stats_stat_id_index ON form_stats(stat_id);

CREATE TABLE form_types (
  form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  type_name TEXT NOT NULL REFERENCES types(name),
  slot INTEGER NOT NULL CHECK (slot IN (1, 2)),
  PRIMARY KEY (form_id, slot),
  UNIQUE (form_id, type_name)
);

CREATE INDEX form_types_type_name_index ON form_types(type_name);

CREATE TABLE moves (
  id TEXT PRIMARY KEY,
  pokeapi_id INTEGER NOT NULL UNIQUE,
  name_ja TEXT,
  generation_id INTEGER,
  type_name TEXT NOT NULL REFERENCES types(name),
  damage_class_name TEXT,
  target_name TEXT,
  ailment_name TEXT,
  power INTEGER CHECK (power IS NULL OR power >= 0),
  pp INTEGER CHECK (pp IS NULL OR pp >= 0),
  accuracy INTEGER CHECK (
    accuracy IS NULL OR accuracy BETWEEN 0 AND 100
  ),
  priority INTEGER NOT NULL,
  effect_chance INTEGER CHECK (
    effect_chance IS NULL OR effect_chance BETWEEN 0 AND 100
  ),
  effect_en TEXT,
  effect_ja TEXT
);

CREATE INDEX moves_type_name_index ON moves(type_name);

CREATE TABLE version_groups (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL UNIQUE,
  generation_id INTEGER NOT NULL
);

CREATE TABLE move_learn_methods (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  name_ja TEXT
);

CREATE TABLE form_moves (
  form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  move_id TEXT NOT NULL REFERENCES moves(id),
  version_group_id INTEGER NOT NULL REFERENCES version_groups(id),
  learn_method_id INTEGER NOT NULL REFERENCES move_learn_methods(id),
  level_learned_at INTEGER NOT NULL CHECK (level_learned_at >= 0),
  move_order INTEGER,
  PRIMARY KEY (
    form_id,
    move_id,
    version_group_id,
    learn_method_id,
    level_learned_at
  )
);

CREATE INDEX form_moves_move_id_index ON form_moves(move_id);
CREATE INDEX form_moves_version_group_id_index
  ON form_moves(version_group_id);
