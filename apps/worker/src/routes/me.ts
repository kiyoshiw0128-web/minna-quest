import { EQUIPMENT, applyEquipment, computeStats, JOBS, unlockedJobs } from '@mq/core';
import type { Character, Job } from '@mq/core';
import { requirePlayer } from '../auth.js';
import {
  getActivePetId, getOwnedCharacterFlags, getPartyCharacters, getPlayerGold, getPlayerItemIds,
  getPlayerPetIds, isEmailRegistered,
} from '../store.js';
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

  const [gold, characters, heroFlags, pets, activePetId, items, emailRegistered] = await Promise.all([
    getPlayerGold(env.DB, player.id),
    getPartyCharacters(env.DB, player.id),
    getOwnedCharacterFlags(env.DB, player.id),
    getPlayerPetIds(env.DB, player.id),
    getActivePetId(env.DB, player.id),
    getPlayerItemIds(env.DB, player.id),
    isEmailRegistered(env.DB, player.id),
  ]);
  if (gold === null) return fail('player not found', 404);

  const party = characters.map((character) => {
    const job = jobOf(character);
    // 装備前の実効ステータス。画面が「候補の装備を選ぶとどれだけ上がるか」を
    // 数字で出す（設計書 §7）ためには、装備が乗った後の値だけでなく
    // 乗る前の値も要る。乗せた後の値だけ返すと、候補を差し替えるたびに
    // 差分を逆算しなければならなくなる。
    const baseStats = computeStats(character, job);
    const weaponId = character.equippedWeapon ?? null;
    const armorId = character.equippedArmor ?? null;
    const weapon = weaponId === null ? null : EQUIPMENT[weaponId as keyof typeof EQUIPMENT] ?? null;
    const armor = armorId === null ? null : EQUIPMENT[armorId as keyof typeof EQUIPMENT] ?? null;
    return {
      id: character.id,
      name: character.name,
      jobId: character.currentJob,
      adventureLevel: character.adventureLevel,
      jobLevel: character.jobs[character.currentJob]?.level ?? 1,
      // 装備込みの実効ステータス。戦闘（toPartyMember）が実際に使う値と揃える。
      stats: applyEquipment(baseStats, weapon, armor),
      baseStats,
      learnedSkillIds: character.learnedSkills,
      equippedSkillIds: character.equippedActive,
      // パッシブも返す。返さないと画面が「いま何を装備しているか」を
      // 知らないまま装備の更新を送ることになり、触っていないパッシブが
      // 空で上書きされて消える。実際にそうなっていた。
      learnedPassiveIds: character.learnedPassives,
      equippedPassiveIds: character.equippedPassive,
      // 段階8・設計書 §7。装備パネルが「いま何を着けているか」を知るためのもの。
      // pets/passivesと同じく、実体（名前・値段・効果）は @mq/core の EQUIPMENT が
      // フロントにバンドルされているのでIDだけ返す。
      equippedWeaponId: weaponId,
      equippedArmorId: armorId,
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

  return ok({
    name: player.name,
    gold,
    party,
    // 「仲間」画面のペット欄用（段階6・設計書 §7）。名前・説明・効果の実体は
    // @mq/core の PETS がフロントにバンドルされているので、IDだけ返す
    // （learnedPassiveIds と同じ考え方）。
    pets,
    activePetId,
    // 段階8・設計書 §7。買った装備の一覧（同じIDが複数入りうる。設計書 §6）。
    // 「あと何個装備に回せるか」は、これと各キャラのequippedWeaponId/
    // equippedArmorIdから画面側で数える（在庫を持たないpet欄と違い、
    // ここは所持数そのものが意味を持つため、集計せず生のIDだけ返す）。
    items,
    // 段階11・設計書 §4。登録の有無だけを返す。アドレスそのものは返さない
    // （端末を乗っ取られたときに連絡先まで抜けるのを避けるため。設計書 §8 テスト6）。
    emailRegistered,
  });
}
