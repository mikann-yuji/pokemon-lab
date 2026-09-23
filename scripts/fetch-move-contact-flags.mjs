/** Scrape the current contact-move list; no per-move requests are needed. */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { load } from "cheerio";

export const CONTACT_SOURCE = "https://bulbapedia.bulbagarden.net/wiki/Contact";
const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

export function parseContactMoves(html) {
  const $ = load(html);
  const table = $("#List_of_contact_moves").closest("h2").nextAll("table").first();
  const names = table.find('a[title$=" (move)"]').map((_, element) =>
    normalize($(element).attr("title").replace(/ \(move\)$/, "")),
  ).get();
  const contacts = new Set(names);
  // A layout change must never silently turn every move into a noncontact move.
  if (contacts.size < 200 || !contacts.has("tackle") || !contacts.has("grassknot") || contacts.has("earthquake")) {
    throw new Error("Contact move list is incomplete or its HTML structure has changed.");
  }
  return contacts;
}

export async function fetchContactMoves() {
  const response = await fetch(CONTACT_SOURCE, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Contact source returned HTTP ${response.status}`);
  return parseContactMoves(await response.text());
}

export function isContactMove(id, contacts) {
  // PokeAPI retains the old spelling of Vise Grip.
  return contacts.has(normalize(id === "vice-grip" ? "vise-grip" : id));
}

// Preserve the original CSV bytes inside each record, including multiline descriptions.
export function updateContactCsv(source, contacts) {
  const records = [];
  let start = 0;
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '"') {
      if (quoted && source[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (source[i] === "\n" && !quoted) {
      records.push(source.slice(start, i).replace(/\r$/, ""));
      start = i + 1;
    }
  }
  if (quoted) throw new Error("Unclosed CSV field");
  if (start < source.length) records.push(source.slice(start).replace(/\r$/, ""));
  const header = records.shift();
  const existing = header.endsWith(",is_contact");
  if (header.includes("is_contact") && !existing) throw new Error("Unexpected is_contact column position");
  return [existing ? header : `${header},is_contact`, ...records.filter(Boolean).map((record) => {
    const id = record.slice(0, record.indexOf(","));
    return `${existing ? record.replace(/,[01]$/, "") : record},${Number(isContactMove(id, contacts))}`;
  })].join("\n") + "\n";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const contacts = process.env.CONTACT_HTML_PATH
    ? parseContactMoves(readFileSync(process.env.CONTACT_HTML_PATH, "utf8"))
    : await fetchContactMoves();
  const path = new URL("../database/seeds/moves.csv", import.meta.url);
  writeFileSync(path, updateContactCsv(readFileSync(path, "utf8"), contacts));
  console.log(`Updated moves.csv from ${contacts.size} contact moves (${CONTACT_SOURCE}).`);
}
