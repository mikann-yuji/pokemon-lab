import type { TypeMatchup, TypeName } from "@/domain/type-matchup";

// クイズ機能で扱う、攻撃側3種類と防御側3種類の問題形式。
export const QUIZ_TYPES = [
  "superEffectiveAgainst",
  "notVeryEffectiveAgainst",
  "noEffectAgainst",
  "vulnerableTo",
  "resistantTo",
  "noEffectTo",
] as const;

export type QuizType = (typeof QUIZ_TYPES)[number];

export type Question = {
  id: number;
  type: TypeMatchup;
  quizType: QuizType;
  correctAnswers: TypeName[];
};

/**
 * 相性データから、正解が1つ以上存在する問題だけを作成して順番を混ぜる。
 */
export function createQuestions(typeMatchups: TypeMatchup[]): Question[] {
  const questions = typeMatchups.flatMap((type) =>
    QUIZ_TYPES.flatMap((quizType) => {
      const correctAnswers = type[quizType];
      return correctAnswers.length > 0
        ? [{ id: 0, type, quizType, correctAnswers }]
        : [];
    }),
  ).map((question, id) => ({ ...question, id }));

  return shuffle(questions);
}

/**
 * 問題形式に応じた日本語の質問文を返す。
 */
export function getQuestionText(question: Question): string {
  const { nameJa } = question.type;

  switch (question.quizType) {
    case "superEffectiveAgainst":
      return `${nameJa}タイプの技は、どのタイプに こうかばつぐん かな？`;
    case "notVeryEffectiveAgainst":
      return `${nameJa}タイプの技は、どのタイプに こうかいまひとつ かな？`;
    case "noEffectAgainst":
      return `${nameJa}タイプの技は、どのタイプに こうかなし かな？`;
    case "vulnerableTo":
      return `${nameJa}タイプに対して、どのタイプの技が こうかばつぐん かな？`;
    case "resistantTo":
      return `${nameJa}タイプに対して、どのタイプの技が こうかいまひとつ かな？`;
    case "noEffectTo":
      return `${nameJa}タイプに対して、どのタイプの技が こうかなし かな？`;
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
