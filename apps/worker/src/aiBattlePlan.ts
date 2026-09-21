import type { BattlePlan, Enemy, PartyMember, Skill } from '@mq/core';

type ChoiceAnswer = {
  type: 'choice';
  choice: string;
  confidence: number;
};

type TypeSafeResponse = { answers?: Record<string, ChoiceAnswer> };

export type AiBattlePlanResult = {
  plan: BattlePlan;
  source: 'jev' | 'fallback';
  confidence: number | null;
};

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const TURN_COUNT = 8;
const MIN_CONFIDENCE = 0.25;
const TIMEOUT_MS = 5_000;
const WAIT = 'wait';

/** Jevが使えない場合にも、必ず編集可能な8ターンの作戦を返す。 */
export function fallbackBattlePlan(party: readonly PartyMember[]): BattlePlan {
  return Object.fromEntries(party.map((member) => {
    // 先頭は各職の消費0・クールダウン0の基本技。既存のfreshPlanと同じ既定値にする。
    const basic = member.skills[0];
    return [member.id, Array<string | null>(TURN_COUNT).fill(basic?.id ?? null)];
  }));
}

function skillDescription(skill: Skill): Record<string, unknown> {
  return {
    name: skill.name,
    mp_cost: skill.mpCost,
    cooldown_turns: skill.cooldown,
    target: skill.target,
    element: skill.element,
    damage: skill.damage ?? null,
    healing_power: skill.heal ?? null,
    effects: skill.effects ?? [],
    requires_pet: skill.requiresPet ?? false,
  };
}

/**
 * 敵・仲間・装備中の技をJevに渡し、各人8ターンの技順を提案してもらう。
 * 返答は装備中の技か待機だけに検証し、低信頼のマスは安全な既定作戦へ戻す。
 */
export async function suggestBattlePlan(
  enemy: Enemy,
  party: readonly PartyMember[],
  apiKey: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<AiBattlePlanResult> {
  const fallback = fallbackBattlePlan(party);
  if (!apiKey || party.length === 0) return { plan: fallback, source: 'fallback', confidence: null };

  const questions: Record<string, unknown> = {};
  for (const member of party) {
    const criteria = Object.fromEntries([
      ...member.skills.map((skill) => [skill.id, skillDescription(skill)] as const),
      [WAIT, { name: '待機', mp_cost: 0, purpose: 'Save MP or wait for a cooldown.' }],
    ]);
    for (let turn = 1; turn <= TURN_COUNT; turn += 1) {
      questions[`${member.id}__${turn}`] = {
        type: 'choice',
        instructions: {
          question: `Which action should ${member.name} prepare for turn ${turn} of 8?`,
          rules: [
            'Choose only one action from the supplied criteria.',
            'Build a practical sequence across eight turns; account for MP costs and cooldowns.',
            'Use healing or support when the enemy pattern makes it useful.',
            'The player will review and may edit this suggestion before battle.',
          ],
        },
        criteria,
      };
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'jev-latest',
        state: {
          game: 'A deterministic turn-based fantasy battle. The player presets eight turns.',
          enemy: {
            id: enemy.id,
            name: enemy.name,
            stats: enemy.stats,
            pattern: enemy.pattern,
            enrage: enemy.enrage ?? null,
            skills: enemy.skills.map(skillDescription),
          },
          party: party.map((member) => ({
            id: member.id,
            name: member.name,
            stats: member.stats,
            skills: member.skills.map((skill) => ({ id: skill.id, ...skillDescription(skill) })),
          })),
        },
        questions,
      }),
    });
    if (!response.ok) return { plan: fallback, source: 'fallback', confidence: null };

    const body = await response.json() as TypeSafeResponse;
    if (!body.answers) return { plan: fallback, source: 'fallback', confidence: null };

    const confidences: number[] = [];
    const plan: BattlePlan = {};
    for (const member of party) {
      const allowed = new Set(member.skills.map((skill) => skill.id));
      plan[member.id] = Array.from({ length: TURN_COUNT }, (_, index) => {
        const answer = body.answers?.[`${member.id}__${index + 1}`];
        if (!answer || answer.type !== 'choice' || !Number.isFinite(answer.confidence)
          || answer.confidence < MIN_CONFIDENCE) return fallback[member.id][index];
        confidences.push(answer.confidence);
        if (answer.choice === WAIT) return null;
        return allowed.has(answer.choice) ? answer.choice : fallback[member.id][index];
      });
    }
    if (confidences.length === 0) return { plan: fallback, source: 'fallback', confidence: null };
    const confidence = confidences.reduce((total, value) => total + value, 0) / confidences.length;
    return { plan, source: 'jev', confidence };
  } catch {
    return { plan: fallback, source: 'fallback', confidence: null };
  } finally {
    clearTimeout(timeout);
  }
}
