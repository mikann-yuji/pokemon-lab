/**
 * SQLite WASM公式配布物をNext.jsのpublicディレクトリへ同期する。
 * 公式ランタイムをTurbopackの解析対象から外し、ブラウザES Moduleとして配信する。
 */

import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const source = path.join(
  process.cwd(),
  "node_modules",
  "@sqlite.org",
  "sqlite-wasm",
  "dist",
);
const destination = path.join(process.cwd(), "public", "sqlite-wasm");
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
