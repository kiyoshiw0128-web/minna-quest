import { computeStats, JOBS, unlockedJobs } from '@mq/core';
import type { Character, Job } from '@mq/core';
import { requirePlayer } from '../auth.js';
import { getOwnedCharacterFlags, getPartyCharacters, getPlayerGold } from '../store.js';
import { fail, ok } from '../respond.js';
import type { Env } from '../env.js';

/**
 * currentJob に対応する Job を引く。battle.ts の jobOf と同じ理由・同じ挙動
 * （見つからないのはマスタとDBがずれた異常事態なので投げる）。
 * 2箇所に同じ8行を置くのは、共有ヘルパーを増やすほどの重複ではないため。
 */
function jobOf(character: Character): Job {
  const job = JOBS[character.currentJob as keyof typeof JOBS] as Job | undefined;
  if (job === undefined) throw new Error(`unknown job: ${character.currentJob}`);
  return job;
}

/**
 * 自分の所持金とパーティ。酒場（いくら持っているか）とパーティ画面（誰がいるか）の
 * 両方がこれ一本で足りる（設計書 §2）。
 *
 * 装備中の技のMP・クールダウン等の定義そのものは @mq/core の SKILLS が
 * フロント側にバンドルされているため、ここでは技IDだけ返せば十分
 * （GET /api/battle が Skill の実体を返しているのとは事情が違う。
 * 戦闘中に持ち込む passives の実体解決は toPartyMember の仕事だが、
 * 育成画面はIDと実効ステータスだけで組み立てられる）。
 */
export async function handleMe(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(env.DB, request);
  if (player === null) return fail('unauthorized', 401);

  const [gold, characters, heroFlags] = await Promise.all([
    getPlayerGold(env.DB, player.id),
    getPartyCharacters(env.DB, player.id),
    getOwnedCharacterFlags(env.DB, player.id),
  ]);
  if (gold === null) return fail('player not found', 404);

  const party = characters.map((character) => {
    const job = jobOf(character);
    return {
      id: character.id,
      name: character.name,
      jobId: character.currentJob,
      adventureLevel: character.adventureLevel,
      jobLevel: character.jobs[character.currentJob]?.level ?? 1,
      stats: computeStats(character, job),
      learnedSkillIds: character.learnedSkills,
      equippedSkillIds: character.equippedActive,
      // パッシブも返す。返さないと画面が「いま何を装備しているか」を
      // 知らないまま装備の更新を送ることになり、触っていないパッシブが
      // 空で上書きされて消える。実際にそうなっていた。
      learnedPassiveIds: character.learnedPassives,
      equippedPassiveIds: character.equippedPassive,
      // 主人公は外せず解雇もできない。画面がそれを知らないと、
      // 押せるボタンを出しておいてサーバに断られる、という形になる。
      isHero: heroFlags.get(character.id) === true,
      // 転職画面が「就いたことのある職業とそのレベル」「いま就ける職業」を
      // 出すための材料（設計書 §3）。就ける条件が見えないと、満たしたことに
      // 誰も気づけない。
      jobLevels: Object.fromEntries(
        Object.entries(character.jobs).map(([jobId, progress]) => [jobId, progress.level]),
      ),
      unlockedJobIds: unlockedJobs(character, JOBS),
    };
  });

  return ok({ name: player.name, gold, party });
}
