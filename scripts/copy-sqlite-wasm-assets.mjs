/**
 * SQLite WASM公式配布物をNext.jsのpublicディレクトリへ同期する。
 * 公式ランタイムをTurbopackの解析対象から外し、ブラウザES Moduleとして配信する。
 */

import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

// 公式パッケージのdistをそのまま静的配信し、Worker内の /sqlite-wasm/index.mjs から読む。
const source = path.join(
  process.cwd(),
  "node_modules",
  "@sqlite.org",
  "sqlite-wasm",
  "dist",
);
const destination = path.join(process.cwd(), "public", "sqlite-wasm");
// アプリ固有のWorker本体もpublicへ置き、new Worker("/sqlite-runtime-worker.mjs")で起動する。
const workerSource = path.join(
  process.cwd(),
  "scripts",
  "sqlite-runtime-worker.mjs",
);
const workerDestination = path.join(
  process.cwd(),
  "public",
  "sqlite-runtime-worker.mjs",
);
// Next.jsを介さずWorker単体を切り分け検証するための静的診断ページ。
const diagnosticSource = path.join(
  process.cwd(),
  "scripts",
  "sqlite-runtime-diagnostic.html",
);
const diagnosticDestination = path.join(
  process.cwd(),
  "public",
  "sqlite-runtime-diagnostic.html",
);

await mkdir(path.dirname(destination), { recursive: true });
await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true });
await cp(workerSource, workerDestination);
await cp(diagnosticSource, diagnosticDestination);

console.log(`Copied SQLite WASM assets to ${destination}`);
