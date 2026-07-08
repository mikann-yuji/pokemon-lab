# PokemonLab プログラム設計書

このディレクトリは、PokemonLab のプログラム設計をまとめる。
外部設計が「利用者から見える仕様」、内部設計が「モジュール構成と処理方針」を扱うのに対し、プログラム設計では「実装単位のファイル、型、関数、状態、データアクセスの責務」を扱う。

## 目次

1. [実行入口とルーティング](./01-entrypoints-routing.md)
2. [共通基盤とSQLite Worker](./02-shared-infrastructure.md)
3. [機能別プログラム構成](./03-feature-programs.md)
4. [データモデルとリポジトリ](./04-data-models-repositories.md)
5. [状態管理と計算処理](./05-state-and-calculation.md)
6. [ビルド、検証、保守作業](./06-build-test-maintenance.md)

## 関連文書

- [外部設計書](../external-design/README.md)
- [内部設計書](../internal-design/README.md)

## 記述方針

- 実装者が修正箇所を探せるように、主要ファイル名、型名、関数名を明記する。
- すべてのローカル関数を網羅するのではなく、変更時に影響範囲を判断するための境界を中心に記述する。
- 画面仕様や利用者向け制約は外部設計、モジュール全体の方針は内部設計へ寄せる。
- DB生成物や自動生成差分は、運用上の注意として明記する。

## 対象範囲

- Next.js App Router のページ入口
- 共通レイアウト、PWA登録、タイプ相性モーダル
- SQLite WASM Worker と catalog/user DB アクセス
- ポケモン検索、詳細、クイズ、育成、バトルチーム、ダメージ計算、対戦シミュレータ
- DB初期化、seed取得、ビルド資産生成

