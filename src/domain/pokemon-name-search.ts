/**
 * このファイルの役割: ポケモン名検索で共通利用する、ひらがな・カタカナの正規化処理。
 */

/** ひらがなをカタカナへ寄せ、DB検索でカナ表記を別パターンとして投げられるようにする。 */
export function toKatakana(value: string) {
  return value.replace(/[ぁ-ゖ]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) + 0x60),
  );
}

/** カタカナをひらがなへ寄せ、検索語と候補名の表記揺れを吸収する。 */
export function toHiragana(value: string) {
  return value.replace(/[ァ-ヶ]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0x60),
  );
}

/** ポケモン名検索で比較しやすいよう、空白・大小文字・かな表記を正規化する。 */
export function normalizePokemonSearchText(value: string) {
  return toHiragana(value.trim()).toLocaleLowerCase("ja");
}

/** 候補名が検索語を含むかを、ひらがな/カタカナ差を無視して判定する。 */
export function pokemonNameIncludes(
  candidate: string,
  query: string,
): boolean {
  return normalizePokemonSearchText(candidate).includes(
    normalizePokemonSearchText(query),
  );
}
