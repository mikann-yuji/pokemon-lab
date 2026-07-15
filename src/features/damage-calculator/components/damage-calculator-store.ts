"use client";

import { create } from "zustand";
import type {
  DamageCalculatorMove,
  DamageCalculatorPokemon,
} from "../domain/damage-calculator-types";
import {
  createDefaultAdjustmentState,
  type StatAdjustmentState,
} from "./damage-calculator-state";
import type {
  AdjustableStatId,
  DamageSide,
  StatAdjustment,
} from "./damage-calculator-types";

type TeamSelectionState = Record<DamageSide, number | null>;
type BuildSelectionState = Record<DamageSide, number | null>;
type AbilityConditionState = Record<DamageSide, boolean>;
type PokemonSelectionState = Record<DamageSide, DamageCalculatorPokemon | null>;
type PokemonQueryState = Record<DamageSide, string>;

type DamageCalculatorStore = {
  // 通常ダメージ計算ページの「ユーザーが直接編集する入力状態」だけを持つ。
  // 計算結果やカタログデータは別hook/storeに分け、ここをフォーム状態の置き場に限定する。
  pokemon: PokemonSelectionState;
  query: PokemonQueryState;
  moveId: string;
  preservedMove: DamageCalculatorMove | null;
  weatherId: string;
  terrainId: string;
  selectedTeamIds: TeamSelectionState;
  selectedBuildIds: BuildSelectionState;
  teamModalSide: DamageSide | null;
  speedModalOpen: boolean;
  metronomeConsecutiveUseCount: number;
  abilityConditionEnabled: AbilityConditionState;
  statAdjustments: StatAdjustmentState;

  /**
   * ダメージ計算ページで、ポケモン検索欄の入力文字列を更新する。
   *
   * @param side - 検索欄を更新する側。
   * @param query - 入力中の検索文字列。
   * @returns 戻り値なし。
   */
  setQuery: (side: DamageSide, query: string) => void;
  /**
   * ダメージ計算ページで、選択ポケモンと検索欄表示を同期して更新する。
   *
   * @param side - ポケモンを選択する側。
   * @param pokemon - 選択するポケモン。選択解除ならnull。
   * @returns 戻り値なし。
   */
  selectPokemon: (side: DamageSide, pokemon: DamageCalculatorPokemon | null) => void;
  /**
   * ダメージ計算ページで、攻撃側の使用技IDを更新する。
   *
   * @param moveId - 選択された技ID。
   * @returns 戻り値なし。
   */
  setMoveId: (moveId: string) => void;
  /**
   * ダメージ計算ページで、攻守交代後にも一時保持する技を保存する。
   *
   * @param move - 一時保持する技。不要ならnull。
   * @returns 戻り値なし。
   */
  setPreservedMove: (move: DamageCalculatorMove | null) => void;
  /**
   * ダメージ計算ページで、天候選択を更新する。
   *
   * @param weatherId - 選択された天候ID。
   * @returns 戻り値なし。
   */
  setWeatherId: (weatherId: string) => void;
  /**
   * ダメージ計算ページで、フィールド選択を更新する。
   *
   * @param terrainId - 選択されたフィールドID。
   * @returns 戻り値なし。
   */
  setTerrainId: (terrainId: string) => void;
  /**
   * ダメージ計算ページで、攻撃側/防御側に紐づくバトルチームIDを更新する。
   *
   * @param side - チームを選ぶ側。
   * @param teamId - 選択されたチームID。解除ならnull。
   * @returns 戻り値なし。
   */
  setSelectedTeamId: (side: DamageSide, teamId: number | null) => void;
  /**
   * ダメージ計算ページで、攻撃側/防御側に紐づく育成案IDを更新する。
   *
   * @param side - 育成案を選ぶ側。
   * @param buildId - 選択された育成案ID。解除ならnull。
   * @returns 戻り値なし。
   */
  setSelectedBuildId: (side: DamageSide, buildId: number | null) => void;
  /**
   * ダメージ計算ページで、開いているバトルチーム選択モーダルの側を更新する。
   *
   * @param side - モーダル対象の側。閉じる場合はnull。
   * @returns 戻り値なし。
   */
  setTeamModalSide: (side: DamageSide | null) => void;
  /**
   * ダメージ計算ページで、素早さ比較モーダルの開閉状態を更新する。
   *
   * @param open - 開くならtrue、閉じるならfalse。
   * @returns 戻り値なし。
   */
  setSpeedModalOpen: (open: boolean) => void;
  /**
   * ダメージ計算ページで、メトロノームの連続使用回数を更新する。
   *
   * @param count - 連続使用回数。
   * @returns 戻り値なし。
   */
  setMetronomeConsecutiveUseCount: (count: number) => void;
  /**
   * ダメージ計算ページで、手動発動する特性条件のON/OFFを更新する。
   *
   * @param side - 条件を切り替える側。
   * @param enabled - 有効ならtrue。
   * @returns 戻り値なし。
   */
  setAbilityConditionEnabled: (side: DamageSide, enabled: boolean) => void;
  /**
   * ダメージ計算ページで、単一能力の補正入力を部分更新する。
   *
   * @param side - 補正を更新する側。
   * @param statId - 補正対象の能力ID。
   * @param values - 更新する補正値。
   * @returns 戻り値なし。
   */
  setStatAdjustment: (
    side: DamageSide,
    statId: AdjustableStatId,
    values: Partial<StatAdjustment>,
  ) => void;
  /**
   * ダメージ計算ページで、片側の能力補正一式を育成案などから差し替える。
   *
   * @param side - 補正一式を更新する側。
   * @param adjustments - 能力IDごとの補正値。
   * @returns 戻り値なし。
   */
  setSideStatAdjustments: (
    side: DamageSide,
    adjustments: StatAdjustmentState[DamageSide],
  ) => void;
  /**
   * ダメージ計算ページで、攻撃側と防御側の入力状態をまとめて入れ替える。
   *
   * @returns 戻り値なし。
   */
  swapSides: () => void;
  /**
   * ダメージ計算ページで、直接ポケモン選択した側の育成案由来状態を初期化する。
   *
   * @param side - 初期化する側。
   * @returns 戻り値なし。
   */
  resetSideForDirectPokemon: (side: DamageSide) => void;
  /**
   * ダメージ計算ページで、通常計算store全体を初期状態へ戻す。
   *
   * @returns 戻り値なし。
   */
  reset: () => void;
};

/**
 * ダメージ計算ページで、通常計算storeの初期状態を作る。
 *
 * @returns Zustand storeへ投入する初期状態。
 */
function initialState() {
  // 初期状態はresetでも使い回すため、store定義の外で毎回新しいオブジェクトとして作る。
  // statAdjustmentsのネストしたオブジェクトを共有しないことが、片側更新の事故防止になる。
  return {
    pokemon: { attacker: null, defender: null },
    query: { attacker: "", defender: "" },
    moveId: "",
    preservedMove: null,
    weatherId: "",
    terrainId: "",
    selectedTeamIds: { attacker: null, defender: null },
    selectedBuildIds: { attacker: null, defender: null },
    teamModalSide: null,
    speedModalOpen: false,
    metronomeConsecutiveUseCount: 1,
    abilityConditionEnabled: { attacker: false, defender: false },
    statAdjustments: createDefaultAdjustmentState(),
  };
}

/**
 * ダメージ計算ページで、通常計算フォームの入力状態を共有するZustand hook。
 *
 * @returns selectorで切り出したフォーム状態、またはフォーム更新アクション。
 */
export const useDamageCalculatorStore = create<DamageCalculatorStore>((set) => ({
  ...initialState(),

  setQuery: (side, query) =>
    set((state) => ({ query: { ...state.query, [side]: query } })),

  selectPokemon: (side, pokemon) =>
    set((state) => ({
      // ポケモン選択と検索欄表示は常に同時更新する。
      // 片方だけ更新すると、候補リストの表示名と計算対象がズレるため。
      pokemon: { ...state.pokemon, [side]: pokemon },
      query: { ...state.query, [side]: pokemon?.nameJa ?? "" },
    })),

  setMoveId: (moveId) => set({ moveId }),
  setPreservedMove: (preservedMove) => set({ preservedMove }),
  setWeatherId: (weatherId) => set({ weatherId }),
  setTerrainId: (terrainId) => set({ terrainId }),
  setTeamModalSide: (teamModalSide) => set({ teamModalSide }),
  setSpeedModalOpen: (speedModalOpen) => set({ speedModalOpen }),
  setMetronomeConsecutiveUseCount: (metronomeConsecutiveUseCount) =>
    set({ metronomeConsecutiveUseCount }),

  setSelectedTeamId: (side, teamId) =>
    set((state) => ({
      selectedTeamIds: { ...state.selectedTeamIds, [side]: teamId },
    })),

  setSelectedBuildId: (side, buildId) =>
    set((state) => ({
      selectedBuildIds: { ...state.selectedBuildIds, [side]: buildId },
    })),

  setAbilityConditionEnabled: (side, enabled) =>
    set((state) => ({
      abilityConditionEnabled: {
        ...state.abilityConditionEnabled,
        [side]: enabled,
      },
    })),

  setStatAdjustment: (side, statId, values) =>
    set((state) => ({
      // 能力補正は能力IDごとに部分更新する。
      // point/rank/natureのどれかだけを触っても、他の入力値は保持する。
      statAdjustments: {
        ...state.statAdjustments,
        [side]: {
          ...state.statAdjustments[side],
          [statId]: {
            ...state.statAdjustments[side][statId],
            ...values,
          },
        },
      },
    })),

  setSideStatAdjustments: (side, adjustments) =>
    set((state) => ({
      statAdjustments: { ...state.statAdjustments, [side]: adjustments },
    })),

  swapSides: () =>
    set((state) => ({
      // 攻守交代では、ポケモンだけでなく育成案・補正・特性条件も左右ごと入れ替える。
      // 技IDは攻撃側の技一覧に依存するため、親コンポーネント側で保存/復元を扱う。
      pokemon: {
        attacker: state.pokemon.defender,
        defender: state.pokemon.attacker,
      },
      query: {
        attacker: state.pokemon.defender?.nameJa ?? "",
        defender: state.pokemon.attacker?.nameJa ?? "",
      },
      statAdjustments: {
        attacker: state.statAdjustments.defender,
        defender: state.statAdjustments.attacker,
      },
      abilityConditionEnabled: {
        attacker: state.abilityConditionEnabled.defender,
        defender: state.abilityConditionEnabled.attacker,
      },
      selectedTeamIds: {
        attacker: state.selectedTeamIds.defender,
        defender: state.selectedTeamIds.attacker,
      },
      selectedBuildIds: {
        attacker: state.selectedBuildIds.defender,
        defender: state.selectedBuildIds.attacker,
      },
    })),

  resetSideForDirectPokemon: (side) =>
    set((state) => ({
      // 直接ポケモンを選び直した側は、育成案から持ってきた補正を残さない。
      // 手入力として再スタートできるよう、その側だけ初期化する。
      selectedBuildIds: { ...state.selectedBuildIds, [side]: null },
      statAdjustments: {
        ...state.statAdjustments,
        [side]: createDefaultAdjustmentState()[side],
      },
      abilityConditionEnabled: {
        ...state.abilityConditionEnabled,
        [side]: false,
      },
    })),

  reset: () => set(initialState()),
}));
