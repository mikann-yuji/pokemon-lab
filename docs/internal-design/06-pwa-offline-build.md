# PWA/オフライン/ビルド資産

## PWA構成

| ファイル | 役割 |
|---|---|
| `src/app/layout.tsx` | `manifest`、viewport、Service Worker登録コンポーネントを含む。 |
| `src/components/pwa/service-worker-register.tsx` | 本番環境で `/sw.js` を登録する。 |
| `public/manifest.webmanifest` | PWAマニフェスト。 |
| `public/sw.js` | Service Worker本体。 |
| `public/icons/` | PWAアイコン。 |

## Service Worker登録

`ServiceWorkerRegister` はClient Componentとして動く。

動作:

- `navigator.serviceWorker` がない場合は何もしない。
- 開発環境では既存Service Workerと `pokemon-lab-*` キャッシュを削除する。
- 本番環境では `/sw.js` を登録する。

## SQLite WASM資産

SQLite WASM関連資産は `public/sqlite-wasm/` に配置される。

生成スクリプト:

- `scripts/copy-sqlite-wasm-assets.mjs`

## catalog DB資産

ブラウザで読み込むカタログDBは圧縮済みファイルとして配置される。

生成スクリプト:

- `scripts/export-sqlite-catalog-db.mjs`

生成物:

- `public/sqlite-catalog.db.gz`

## npm scripts

| script | 内容 |
|---|---|
| `npm run sqlite:assets` | SQLite WASM資産コピーとcatalog DBエクスポート。 |
| `npm run db:init` | SQLite DBを初期化する。 |
| `npm run dev` | 開発サーバー起動。事前にDB/資産生成を行う。 |
| `npm run build` | 本番ビルド。事前にDB/資産生成を行う。 |
| `npm run start` | ビルド済みアプリを起動する。 |
| `npm run lint` | ESLintを実行する。 |
| `npm run seeds:fetch` | PokeAPI/Champions系seedを取得する。 |

## ビルド時の注意

`predev` と `prebuild` で以下が実行される。

1. `npm run sqlite:assets`
2. `npm run db:init`

そのため、ビルド確認だけでも以下のファイルが変更されることがある。

- `data/pokemon-lab.db`
- `public/sqlite-catalog.db.gz`
- `public/sqlite-wasm/` 配下

現在の運用では、意図しないDB生成差分はコミット対象から外す。

## Vercelへの影響を避けるpush

docsのみの更新でVercelデプロイを避けたい場合は、コミットメッセージにCIスキップ指示を含める。

例:

```text
docs: add design documents [skip ci]
```

この運用では、ドキュメント更新コミットをpushしても通常の自動ビルド/デプロイを走らせない意図を明示する。
