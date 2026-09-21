import { ACTIVE_SLOTS, EQUIPMENT, JOBS, PASSIVES, PASSIVE_SLOTS, SKILLS, aptitudeQuality } from '@mq/core';
import type { Character, Recruit } from '@mq/core';

type ChoiceAnswer = { type: 'choice'; choice: string; confidence: number; probabilities?: Record<string, number> };
type TypeSafeResponse = { answers?: Record<string, ChoiceAnswer> };
export type RecruitAdvice = { recruitId: string | null; source: 'jev' | 'fallback'; confidence: number | null };
export type LoadoutAdvice = {
  weaponId: string | null;
  armorId: string | null;
  activeIds: string[];
  passiveIds: string[];
  source: 'jev' | 'fallback';
  confidence: number | null;
};

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const MIN_CONFIDENCE = 0.25;
const NONE = 'none';
const JOB_TABLE = JOBS as unknown as Readonly<Record<string, (typeof JOBS)[keyof typeof JOBS]>>;
const SKILL_TABLE = SKILLS as unknown as Readonly<Record<string, (typeof SKILLS)[keyof typeof SKILLS]>>;
const PASSIVE_TABLE = PASSIVES as unknown as Readonly<Record<string, (typeof PASSIVES)[keyof typeof PASSIVES]>>;
const EQUIPMENT_TABLE = EQUIPMENT as unknown as Readonly<Record<string, (typeof EQUIPMENT)[keyof typeof EQUIPMENT]>>;

async function ask(
  state: Record<string, unknown>, questions: Record<string, unknown>, apiKey: string | undefined, fetcher: typeof fetch,
): Promise<Record<string, ChoiceAnswer> | null> {
  if (!apiKey) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetcher(ENDPOINT, {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'jev-latest', state, questions }),
    });
    if (!response.ok) return null;
    return (await response.json() as TypeSafeResponse).answers ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function adviseRecruit(
  party: readonly Character[], recruits: readonly Recruit[], budget: number,
  apiKey: string | undefined, fetcher: typeof fetch = fetch,
): Promise<RecruitAdvice> {
  const fallback = [...recruits].sort((a, b) => aptitudeQuality(b.aptitude) - aptitudeQuality(a.aptitude))[0]?.id ?? null;
  if (recruits.length === 0) return { recruitId: null, source: 'fallback', confidence: null };
  const answers = await ask({
    party: party.map((member) => ({ name: member.name, job: JOB_TABLE[member.currentJob]?.name ?? member.currentJob,
      level: member.adventureLevel, aptitude: member.aptitude })),
    available_gold: budget,
    candidates: recruits,
  }, {
    recruit: {
      type: 'choice',
      instructions: { question: 'Which recruit best fills the current party weaknesses and offers long-term value?', rules: [
        'Choose only from the supplied candidates.', 'Prefer a missing combat role over a duplicate role.',
        'Consider aptitude, level, and hiring cost together.',
        'Do not choose an unaffordable recruit unless every candidate is unaffordable.',
      ] },
      criteria: Object.fromEntries(recruits.map((recruit) => [recruit.id, {
        name: recruit.name, job: JOB_TABLE[recruit.jobId]?.name ?? recruit.jobId, level: recruit.adventureLevel,
        aptitude: recruit.aptitude, cost: recruit.cost, affordable: recruit.cost <= budget,
      }])),
    },
  }, apiKey, fetcher);
  const answer = answers?.recruit;
  if (!answer || answer.type !== 'choice' || answer.confidence < MIN_CONFIDENCE
    || !recruits.some((recruit) => recruit.id === answer.choice)) {
    return { recruitId: fallback, source: 'fallback', confidence: null };
  }
  return { recruitId: answer.choice, source: 'jev', confidence: answer.confidence };
}

function selectBinary(
  answers: Record<string, ChoiceAnswer>, prefix: string, ids: readonly string[], max: number, fallback: readonly string[],
): string[] {
  const selected = ids.flatMap((id) => {
    const answer = answers[`${prefix}:${id}`];
    if (!answer || answer.type !== 'choice' || answer.choice !== 'equip' || answer.confidence < MIN_CONFIDENCE) return [];
    return [{ id, score: answer.probabilities?.equip ?? answer.confidence }];
  }).sort((a, b) => b.score - a.score).slice(0, max).map((entry) => entry.id);
  return selected.length === 0 ? fallback.filter((id) => ids.includes(id)).slice(0, max) : selected;
}

export async function adviseLoadout(
  character: Character,
  availableItemIds: readonly string[],
  apiKey: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<LoadoutAdvice> {
  const fallback: LoadoutAdvice = {
    weaponId: character.equippedWeapon ?? null, armorId: character.equippedArmor ?? null,
    activeIds: [...character.equippedActive], passiveIds: [...character.equippedPassive],
    source: 'fallback', confidence: null,
  };
  const weaponIds = [...new Set(availableItemIds.filter((id) => EQUIPMENT_TABLE[id]?.slot === 'weapon'))];
  const armorIds = [...new Set(availableItemIds.filter((id) => EQUIPMENT_TABLE[id]?.slot === 'armor'))];
  if (character.equippedWeapon && !weaponIds.includes(character.equippedWeapon)) weaponIds.push(character.equippedWeapon);
  if (character.equippedArmor && !armorIds.includes(character.equippedArmor)) armorIds.push(character.equippedArmor);

  const questions: Record<string, unknown> = {};
  const itemQuestion = (label: string, ids: readonly string[]) => ({
    type: 'choice', instructions: { question: `Which ${label} best fits this character's stats, job, and skills?`,
      rules: ['Choose only from the supplied criteria.', 'Choose none when no item improves the build.'] },
    criteria: Object.fromEntries([[NONE, { name: 'none', mods: {} }], ...ids.map((id) => [id, EQUIPMENT_TABLE[id]])]),
  });
  questions.weapon = itemQuestion('weapon', weaponIds);
  questions.armor = itemQuestion('armor', armorIds);
  for (const id of character.learnedSkills) {
    questions[`skill:${id}`] = { type: 'choice', instructions: { question: `Should ${SKILL_TABLE[id]?.name ?? id} be in the active six-skill loadout?`,
      rules: ['Balance damage, healing, support, MP costs, cooldowns, and role coverage.'] },
      criteria: { equip: SKILL_TABLE[id] ?? { id }, skip: { purpose: 'Leave this skill out.' } } };
  }
  for (const id of character.learnedPassives) {
    questions[`passive:${id}`] = { type: 'choice', instructions: { question: `Should ${PASSIVE_TABLE[id]?.name ?? id} be in the two-passive loadout?`,
      rules: ['Choose it only when its effect supports this character build.'] },
      criteria: { equip: PASSIVE_TABLE[id] ?? { id }, skip: { purpose: 'Leave this passive out.' } } };
  }

  const answers = await ask({ character: {
    name: character.name, job: JOB_TABLE[character.currentJob]?.name ?? character.currentJob,
    level: character.adventureLevel, aptitude: character.aptitude,
    current_active_skills: character.equippedActive, current_passives: character.equippedPassive,
  } }, questions, apiKey, fetcher);
  if (!answers) return fallback;
  const validItem = (answer: ChoiceAnswer | undefined, ids: readonly string[], current: string | null | undefined) =>
    answer && answer.type === 'choice' && answer.confidence >= MIN_CONFIDENCE
      && (answer.choice === NONE || ids.includes(answer.choice)) ? (answer.choice === NONE ? null : answer.choice) : current ?? null;
  const activeIds = selectBinary(answers, 'skill', character.learnedSkills, ACTIVE_SLOTS, character.equippedActive);
  const passiveIds = selectBinary(answers, 'passive', character.learnedPassives, PASSIVE_SLOTS, character.equippedPassive);
  const confidences = Object.values(answers).map((answer) => answer.confidence).filter(Number.isFinite);
  if (confidences.length === 0) return fallback;
  return {
    weaponId: validItem(answers.weapon, weaponIds, character.equippedWeapon),
    armorId: validItem(answers.armor, armorIds, character.equippedArmor), activeIds, passiveIds,
    source: 'jev', confidence: confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null,
  };
}
