-- このファイルの役割: タイプ名マスタとタイプ相性表を作成する初期マイグレーション。

CREATE TABLE IF NOT EXISTS types (
  name TEXT PRIMARY KEY,
  name_ja TEXT NOT NULL,
  sort_order INTEGER NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS type_matchups (
  attacker_type TEXT NOT NULL REFERENCES types(name),
  defender_type TEXT NOT NULL REFERENCES types(name),
  effectiveness REAL NOT NULL CHECK (effectiveness IN (0, 0.5, 1, 2)),
  PRIMARY KEY (attacker_type, defender_type)
);
