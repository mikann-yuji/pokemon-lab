/**
 * このファイルの役割: タイプ相性クイズの出題候補生成、正解判定、問題文作成など純粋なロジックを集約する。
 */

import {
  TYPE_NAMES,
  type TypeMatchup,
  type TypeName,
} from "@/domain/type-matchup";

// 単タイプについて扱う、攻撃側3種類と防御側3種類の問題形式。
export const SINGLE_TYPE_QUIZ_TYPES = [
  "superEffectiveAgainst",
  "notVeryEffectiveAgainst",
  "noEffectAgainst",
  "vulnerableTo",
  "resistantTo",
  "noEffectTo",
] as const;

type SingleTypeQuizType = (typeof SINGLE_TYPE_QUIZ_TYPES)[number];
type DualTypeQuizType = "doubleVulnerableTo" | "doubleResistantTo";

type QuestionBase = {
  /** 画面上のkeyや進捗表示に使う、生成後の一時的な連番。 */
  id: number;
  /** 完全一致判定に使う正解タイプ一覧。複数選択問題では複数入る。 */
  correctAnswers: TypeName[];
  /** 問題に添える任意のポケモン画像。正解判定には使わない。 */
  pokemonImage?: PokemonImage;
};

/** クイズカードに添える、catalog.db由来のフォーム画像情報。 */
export type PokemonImage = {
  formId: number;
  nameJa: string;
  url: string;
};

/** 単タイプ名、または複合タイプキー "typeA|typeB" ごとの画像候補。 */
export type PokemonImagesByType = Record<string, PokemonImage[]>;

/** クイズは単タイプ問題と複合タイプ問題の判別共用体として扱う。 */
export type Question =
  | (QuestionBase & {
      quizType: SingleTypeQuizType;
      type: TypeMatchup;
    })
  | (QuestionBase & {
      quizType: DualTypeQuizType;
      types: [TypeMatchup, TypeMatchup];
    });

/**
 * シャッフルや出題設定が変わっても同じ問題を識別できるキーを返す。
 */
export function getQuestionKey(question: Question): string {
  const subject =
    "type" in question
      ? question.type.name
      : question.types
          .map(({ name }) => name)
          .sort()
          .join("|");

  return `${question.quizType}:${subject}`;
}

type CreateQuestionsOptions = {
  /** trueなら4倍/1/4倍になる複合タイプ問題も出題する。 */
  includeDualTypes?: boolean;
  /** タイプごとの画像候補。指定がない場合は画像なしで問題を作る。 */
  pokemonImagesByType?: PokemonImagesByType;
};

/**
 * 相性データから、正解が1つ以上存在する問題だけを作成して順番を混ぜる。
 */
export function createQuestions(
  typeMatchups: TypeMatchup[],
  {
    includeDualTypes = false,
    pokemonImagesByType = {},
  }: CreateQuestionsOptions = {},
): Question[] {
  const singleTypeQuestions = typeMatchups.flatMap((type) =>
    SINGLE_TYPE_QUIZ_TYPES.flatMap((quizType) => {
      const correctAnswers = type[quizType];
      return correctAnswers.length > 0
        ? [{ id: 0, type, quizType, correctAnswers }]
        : [];
    }),
  );
  const dualTypeQuestions = includeDualTypes
    ? createDualTypeQuestions(typeMatchups)
    : [];
  const questions: Question[] = [
    ...singleTypeQuestions,
    ...dualTypeQuestions,
  ].map((question, id) => {
    const pokemonImage = pickPokemonImage(question, pokemonImagesByType);
    return { ...question, id, ...(pokemonImage ? { pokemonImage } : {}) };
  });

  return shuffle(questions);
}

function pickPokemonImage(
  question:
    | { type: TypeMatchup }
    | { types: [TypeMatchup, TypeMatchup] },
  pokemonImagesByType: PokemonImagesByType,
): PokemonImage | undefined {
  // 複合タイプは順序で別キーにならないよう、タイプ名をsortしてから連結する。
  const key =
    "type" in question
      ? question.type.name
      : question.types
          .map(({ name }) => name)
          .sort()
          .join("|");
  const candidates = pokemonImagesByType[key] ?? [];
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * 防御側2タイプの倍率を掛け合わせ、4倍と1/4倍になる組み合わせを問題にする。
 */
function createDualTypeQuestions(typeMatchups: TypeMatchup[]): Question[] {
  const questions: Question[] = [];

  for (let firstIndex = 0; firstIndex < typeMatchups.length; firstIndex++) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < typeMatchups.length;
      secondIndex++
    ) {
      const types: [TypeMatchup, TypeMatchup] = [
        typeMatchups[firstIndex],
        typeMatchups[secondIndex],
      ];
      const effectivenessByAttacker = new Map(
        typeMatchups.map((attacker) => [
          attacker.name,
          getEffectiveness(attacker, types[0].name) *
            getEffectiveness(attacker, types[1].name),
        ]),
      );
      const doubleVulnerableTo = TYPE_NAMES.filter(
        (attacker) => effectivenessByAttacker.get(attacker) === 4,
      );
      const doubleResistantTo = TYPE_NAMES.filter(
        (attacker) => effectivenessByAttacker.get(attacker) === 0.25,
      );

      if (doubleVulnerableTo.length > 0) {
        questions.push({
          id: 0,
          types,
          quizType: "doubleVulnerableTo",
          correctAnswers: doubleVulnerableTo,
        });
      }
      if (doubleResistantTo.length > 0) {
        questions.push({
          id: 0,
          types,
          quizType: "doubleResistantTo",
          correctAnswers: doubleResistantTo,
        });
      }
    }
  }

  return questions;
}

function getEffectiveness(
  attacker: TypeMatchup,
  defender: TypeName,
): 0 | 0.5 | 1 | 2 {
  // TypeMatchupは「特殊な倍率の一覧」だけを持つため、該当しなければ等倍として扱う。
  if (attacker.noEffectAgainst.includes(defender)) return 0;
  if (attacker.superEffectiveAgainst.includes(defender)) return 2;
  if (attacker.notVeryEffectiveAgainst.includes(defender)) return 0.5;
  return 1;
}

/**
 * 問題形式に応じた日本語の質問文を返す。
 */
export function getQuestionText(question: Question): string {
  switch (question.quizType) {
    case "superEffectiveAgainst":
      return `${question.type.nameJa}タイプの わざ！ こうかばつぐんな タイプを えらぼう！`;
    case "notVeryEffectiveAgainst":
      return `${question.type.nameJa}タイプの わざが いまひとつな タイプは どれ？`;
    case "noEffectAgainst":
      return `${question.type.nameJa}タイプの わざが きかない タイプは どれ？`;
    case "vulnerableTo":
      return `${question.type.nameJa}タイプに こうかばつぐんな わざは どれ？`;
    case "resistantTo":
      return `${question.type.nameJa}タイプに いまひとつな わざは どれ？`;
    case "noEffectTo":
      return `${question.type.nameJa}タイプに きかない わざは どれ？`;
    case "doubleVulnerableTo":
      return `${question.types[0].nameJa}・${question.types[1].nameJa}の ダブルタイプに ちょうばつぐん（4ばい）の わざは？`;
    case "doubleResistantTo":
      return `${question.types[0].nameJa}・${question.types[1].nameJa}の ダブルタイプに かなりいまひとつ（1/4ばい）の わざは？`;
  }
}

/**
 * 選択数と内容の両方が、正解一覧と完全に一致するかを判定する。
 */
export function isExactAnswer(
  selectedAnswers: Set<TypeName>,
  correctAnswers: TypeName[],
): boolean {
  const correctSet = new Set(correctAnswers);
  return (
    selectedAnswers.size === correctSet.size &&
    [...selectedAnswers].every((type) => correctSet.has(type))
  );
}

// Fisher–Yates法で、元の配列を変更せずにランダムな順番へ並べ替える。
function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [
      shuffled[randomIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}
