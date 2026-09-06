import type { StatBlock } from '../battle/types.js';
import type { Effect } from '../battle/effects.js';

/** 素質の等級。A が最も伸びる。 */
export type Grade = 'A' | 'B' | 'C' | 'D' | 'E';

/**
 * 成長率。転職しても変わらない、その人物の地力。
 * 冒険レベルの伸びにだけ掛かり、素の値には掛からない。
 */
export type Aptitude = Readonly<Record<keyof StatBlock, Grade>>;

export type JobId = string;

/** ある職業での進み具合。職業ごとに独立して持つ。 */
export type JobProgress = { readonly level: number; readonly exp: number };

/**
 * 育成上のキャラクター。戦闘用の PartyMember とは別物で、
 * bridge.ts の toPartyMember だけが両者を繋ぐ。
 * 主人公も雇用メンバーもこの型ひとつで表す。
 */
export type Character = {
  id: string;
  name: string;
  /** 冒険レベル。転職しても絶対に下がらない */
  adventureLevel: number;
  adventureExp: number;
  aptitude: Aptitude;
  currentJob: JobId;
  /** 就いたことのある職業だけが載る */
  jobs: Readonly<Record<JobId, JobProgress>>;
  /** 習得済み。転職しても永久に消えない */
  learnedSkills: readonly string[];
  learnedPassives: readonly string[];
  /** 戦闘に持ち込むもの。習得済みの中から選ぶ */
  equippedActive: readonly string[];
  equippedPassive: readonly string[];
  /**
   * 武器1・防具1（設計書 §3）。省略可能にしてあるのは、装備という概念自体を
   * 知らない既存のテストフィクスチャや createCharacter 以前のコードを
   * 一切書き換えずに済ませるため（未設定は「装備なし」と同じ扱いになる。
   * bridge.ts の resolveEquipment を参照）。
   */
  equippedWeapon?: string | null;
  equippedArmor?: string | null;
};

/** 装備できるパッシブ。戦闘開始時から永続でかかる。 */
export type Passive = { id: string; name: string; effect: Effect };

export type ProgressEvent =
  | { t: 'adventureLevelUp'; level: number }
  | { t: 'jobLevelUp'; jobId: JobId; level: number }
  | { t: 'skillLearned'; skillId: string }
  | { t: 'passiveLearned'; passiveId: string }
  | { t: 'jobUnlocked'; jobId: JobId };
