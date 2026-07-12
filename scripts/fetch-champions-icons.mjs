import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const seedsDir = path.join(root, "database", "seeds");
const outputDir = path.join(root, "public", "champions-icons");

function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      field = "";
      row = [];
    } else {
      field += char;
    }
  }

  if (field || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  const [headers, ...records] = rows;
  return records
    .filter((record) => record.length === headers.length)
    .map((record) =>
      Object.fromEntries(headers.map((header, index) => [header, record[index]])),
    );
}

async function loadSeed(name) {
  return parseCsv(await readFile(path.join(seedsDir, name), "utf8"));
}

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

const [forms, championsForms] = await Promise.all([
  loadSeed("forms.csv"),
  loadSeed("champions_forms.csv"),
]);
const formById = new Map(forms.map((form) => [form.id, form]));

await mkdir(outputDir, { recursive: true });

const manifest = [];
for (const championForm of championsForms) {
  const form = formById.get(championForm.form_id);
  if (!form?.sprite_default_url) continue;

  const filename = `${form.id}.png`;
  const outputPath = path.join(outputDir, filename);
  const bytes = await fetchBytes(form.sprite_default_url);
  await writeFile(outputPath, bytes);
  manifest.push({
    id: Number(form.id),
    name: form.name,
    nameJa: form.name_ja || form.form_name_ja || form.name,
    iconPath: `/champions-icons/${filename}`,
  });
  console.log(`Fetched ${manifest.length}/${championsForms.length}: ${form.name}`);
}

manifest.sort((left, right) => left.id - right.id);
await writeFile(
  path.join(outputDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`Wrote ${manifest.length} icons to ${outputDir}`);
