-- このファイルの役割: Pokémon Championsに登場するフォームと追加バージョンを記録する。

CREATE TABLE champions_forms (
  form_id INTEGER PRIMARY KEY REFERENCES forms(id) ON DELETE CASCADE,
  version_added TEXT NOT NULL,
  normally_available INTEGER NOT NULL
    CHECK (normally_available IN (0, 1)),
  source_section TEXT NOT NULL
    CHECK (source_section IN ('base', 'mega', 'other'))
);
