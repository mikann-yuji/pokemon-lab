/**
 * このファイルの役割: Next.js推奨ルールをFlat Config形式で読み込むESLint設定ファイル。
 */

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-sqlite-*/**",
    "out/**",
    "build/**",
    "public/sqlite-wasm/**",
    "public/sqlite-runtime-worker.mjs",
    "public/sqlite-runtime-diagnostic.html",
    "public/sqlite-catalog.db.gz",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
