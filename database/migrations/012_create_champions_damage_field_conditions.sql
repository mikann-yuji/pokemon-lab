CREATE TABLE champions_damage_weathers (
  id TEXT PRIMARY KEY,
  name_ja TEXT NOT NULL,
  smogon_weather TEXT NOT NULL CHECK (
    smogon_weather IN (
      'Sand',
      'Sun',
      'Rain',
      'Hail',
      'Snow',
      'Harsh Sunshine',
      'Heavy Rain',
      'Strong Winds'
    )
  ),
  sort_order INTEGER NOT NULL,
  normally_available INTEGER NOT NULL DEFAULT 1 CHECK (normally_available IN (0, 1))
);

CREATE TABLE champions_damage_terrains (
  id TEXT PRIMARY KEY,
  name_ja TEXT NOT NULL,
  smogon_terrain TEXT NOT NULL CHECK (
    smogon_terrain IN ('Electric', 'Grassy', 'Psychic', 'Misty')
  ),
  sort_order INTEGER NOT NULL,
  normally_available INTEGER NOT NULL DEFAULT 1 CHECK (normally_available IN (0, 1))
);
