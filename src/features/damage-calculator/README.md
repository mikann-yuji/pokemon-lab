# ダメージ計算機能の構成

このフォルダには、Pokémon Champions向けダメージ計算に必要な処理をまとめています。
初めてコードを読む場合は、次の順番で追うと理解しやすくなります。

1. `domain/damage-calculator-types.ts`
   - 各処理が受け渡すポケモンと技の形を定義します。
   - React、SQLite、Smogonのどれにも依存しない境界です。
2. `infrastructure/damage-calculator-catalog-repository.ts`
   - SQLiteから種族値、タイプ、習得技を読みます。
   - DBの複数行をdomainの型へ組み立てます。
3. `config/champions-damage-ruleset.ts`
   - レベル、個体値、努力値、基準世代などを定義します。
   - Championsの仕様変更時に最初に確認する場所です。
4. `application/smogon-damage-calculator.ts`
   - domainのデータを`@smogon/calc`形式へ変換します。
   - 計算結果をHP割合などのアプリ用形式へ戻します。
5. `components/`
   - ユーザー入力と結果表示を担当します。
   - 計算式やSQLiteへの問い合わせは持ちません。
6. `infrastructure/damage-history-repository.ts`
   - 最近計算に使ったポケモンと技のIDをuser.dbへ保存します。
   - 攻撃側・防御側それぞれ最新6件まで保持します。
7. `styles/`
   - ダメージ計算ページ専用の見た目を定義します。

## データの流れ

```text
SQLite
  ↓ Server Componentで読み込み
DamageCalculatorPokemon[]
  ↓ propsとしてブラウザへ渡す
検索・ポケモン選択・技選択
  ↓
championsDamageCalculator.calculate(...)
  ↓
SmogonDamageCalculator
  ↓ @smogon/calc
ダメージ値・HP割合・確定数
```

## オフラインで動く理由

ページ生成時にチャンピオンズ対象データをまとめて受け取ります。
検索や計算のたびにAPIへアクセスしないため、一度PWAへキャッシュされた後は
ネットワーク接続がなくても計算できます。

最近使った履歴もブラウザ内のOPFS上にあるuser.dbへ保存されるため、オフラインで
画像ボタンからポケモンと技を再選択できます。種族値や技の詳細は重複保存せず、
SQLite由来カタログのIDを参照する設計です。

## Championsの仕様が変わった場合

まず`config/champions-damage-ruleset.ts`を確認します。
単純なレベル変更なら`level`だけを変更します。技やポケモンごとの補正は
`customizeMove`や`customizePokemon`、計算式全体の変更は`calculate`フックで
差し替えられます。画面コンポーネントへゲームルールを直接書かないことが重要です。
