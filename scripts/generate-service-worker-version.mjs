/**
 * Service Workerがデプロイごとに更新されたと判定されるよう、ビルド識別子を生成する。
 * Vercel/GitHubではコミットSHAを優先し、ローカルなどでは毎回異なるUTC時刻を使う。
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const environmentVersion =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  process.env.SOURCE_VERSION;
const buildVersion = environmentVersion?.trim() || new Date().toISOString();
const publicDirectory = path.join(process.cwd(), "public");
const outputPath = path.join(publicDirectory, "sw-version.js");

mkdirSync(publicDirectory, { recursive: true });
writeFileSync(
  outputPath,
  `// Generated immediately before next build. Do not edit.\nself.POKEMON_LAB_BUILD_VERSION = ${JSON.stringify(buildVersion)};\n`,
  "utf8",
);

console.log(`Generated sw-version.js for build ${buildVersion}.`);
