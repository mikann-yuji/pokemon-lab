/**
 * このファイルの役割: ポケモン名検索で共通利用する、ひらがな・カタカナの正規化処理。
 */

export function toKatakana(value: string) {
  return value.replace(/[ぁ-ゖ]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) + 0x60),
  );
}

export function toHiragana(value: string) {
  return value.replace(/[ァ-ヶ]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0x60),
  );
}

export function normalizePokemonSearchText(value: string) {
  return toHiragana(value.trim()).toLocaleLowerCase("ja");
}

export function pokemonNameIncludes(
  candidate: string,
  query: string,
): boolean {
  return normalizePokemonSearchText(candidate).includes(
    normalizePokemonSearchText(query),
  );
}
