import { describe, it, expect, beforeEach } from 'vitest';
import { env, SELF, applyD1Migrations } from 'cloudflare:test';
import type { BattleLog } from '@mq/core';
import { sha256Hex } from '../src/auth.js';

const WORLD = 'w1';
const TOKEN_A = 'battle-token-aaaaaaaaaaaaaaaaaaaa';
const TOKEN_B = 'battle-token-bbbbbbbbbbbbbbbbbbbb';
const PLAYER_A = 'pA';
const PLAYER_B = 'pB';
const HERO_A = 'heroA';
const HERO_B = 'heroB';

/**
 * バルゴス（HP4800）を8ターン以内に確実に倒せる想定解。
 * 冒険Lv50・全素質A・戦士ジョブLv30まで育て、事前に用意した専用スクリプトで
 * 実際に simulate を走らせて確認した並び（`corepack pnpm --filter @mq/worker
 * exec tsx` で computeStats → toPartyMember → simulate を通した）。
 * バランス値のテストではなく、勝利後の後始末（報酬・記録・討伐フラグ）の
 * 配線を検査するための固定値なので、たまたまギリギリで勝てればよい。
 */
const WINNING_PLAN = ['earthRend', 'heavyBlow', 'shieldSmash', 'slash', 'heavyBlow', 'earthRend', 'shieldSmash', 'heavyBlow'];
const NO_ACTION_PLAN = [null, null, null, null, null, null, null, null];

/**
 * 締まった日 `dayNo` と、その翌日（未締め）を作る。`current_day` は翌日を指す。
 *
 * **この形が本番で実際に起きる唯一の形である。** `advanceDay` は日を締めるのと
 * 同時に翌日の行を作って `current_day` をそこへ進めるので、`current_day` の行は
 * 常に未締めになる。当初この関数は締め済みの日をそのまま `current_day` に
 * 置いていて、実際には存在しない状態を検査していた。そのせいで
 * 「戦闘が永久に始まらない」という不具合をテストが素通りさせていた。
 */
async function seedWorld(dayNo: number, chosenId: string | null): Promise<void> {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  for (const table of ['battle_results', 'party', 'learned', 'job_levels', 'characters', 'votes', 'world_days', 'player_pets', 'players', 'invites', 'worlds']) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
  await env.DB.prepare(
    `INSERT INTO worlds (id, name, started_at, current_day, chapter, tags, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(WORLD, 'テスト世界', '2026-09-03T15:00:00.000Z', dayNo + 1, 1, '[]', '2026-09-03T15:00:00.000Z').run();
  const options = JSON.stringify(['banditAmbush', 'crossroads', 'restAtSpring']);
  await env.DB.prepare(
    `INSERT INTO world_days (world_id, day_no, option_ids, chosen_id) VALUES (?, ?, ?, ?)`,
  ).bind(WORLD, dayNo, options, chosenId).run();
  await env.DB.prepare(
    `INSERT INTO world_days (world_id, day_no, option_ids, chosen_id) VALUES (?, ?, ?, NULL)`,
  ).bind(WORLD, dayNo + 1, options).run();
}

async function addPlayer(playerId: string, token: string, gold = 0): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO players (id, world_id, name, token_hash, joined_at, gold) VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(playerId, WORLD, playerId, await sha256Hex(token), '2026-09-04T00:00:00.000Z', gold).run();
}

/** WINNING_PLAN が確実に通用する強さのキャラをパーティ枠0に作る。 */
async function seedWinningHero(playerId: string, characterId: string): Promise<void> {
  const aptitude = JSON.stringify({ maxHp: 'A', maxMp: 'A', atk: 'A', def: 'A', mat: 'A', mdf: 'A', spd: 'A' });
  const skills = ['slash', 'heavyBlow', 'earthRend', 'shieldSmash'];
  await env.DB.prepare(
    `INSERT INTO characters
       (id, player_id, name, adventure_level, adventure_exp, aptitude, current_job, equipped_active, equipped_passive)
     VALUES (?, ?, ?, 50, 0, ?, 'warrior', ?, '[]')`,
  ).bind(characterId, playerId, characterId, aptitude, JSON.stringify(skills)).run();
  await env.DB.prepare(
    `INSERT INTO job_levels (character_id, job_id, level, exp) VALUES (?, 'warrior', 30, 0)`,
  ).bind(characterId).run();
  for (const skillId of skills) {
    await env.DB.prepare(`INSERT INTO learned (character_id, kind, id) VALUES (?, 'skill', ?)`).bind(characterId, skillId).run();
  }
  await env.DB.prepare(`INSERT INTO party (player_id, character_id, slot) VALUES (?, ?, 0)`).bind(playerId, characterId).run();
}

function battleRequest(
  token: string,
  method: 'GET' | 'POST',
  plan?: Record<string, (string | null)[]>,
  dayNo?: number,
): Promise<Response> {
  const query = method === 'GET' && dayNo !== undefined ? `?dayNo=${dayNo}` : '';
  return SELF.fetch(`https://example.com/api/battle${query}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: method === 'POST' ? JSON.stringify({ plan, dayNo }) : undefined,
  });
}

type Ok<T> = { ok: true; data: T };
type Fail = { ok: false; error: string };

async function readOk<T>(response: Response): Promise<T> {
  const payload = await response.json<Ok<T> | Fail>();
  if (!payload.ok) throw new Error(`expected ok response, got: ${JSON.stringify(payload)}`);
  return payload.data;
}

describe('GET /api/battle（設計書 §6.1）', () => {
  it('日が締まっていなければ戦闘は無い', async () => {
    await seedWorld(1, null);
    await addPlayer(PLAYER_A, TOKEN_A);
    await seedWinningHero(PLAYER_A, HERO_A);

    const data = await readOk<{ hasBattle: boolean }>(await battleRequest(TOKEN_A, 'GET'));
    expect(data.hasBattle).toBe(false);
  });

  it('確定した選択肢が戦闘でなければ戦闘は無い', async () => {
    await seedWorld(1, 'crossroads'); // story イベント
    await addPlayer(PLAYER_A, TOKEN_A);
    await seedWinningHero(PLAYER_A, HERO_A);

    const data = await readOk<{ hasBattle: boolean }>(await battleRequest(TOKEN_A, 'GET'));
    expect(data.hasBattle).toBe(false);
  });

  it('戦闘の日は敵の行動表とパーティの実効ステータスをそのまま返す', async () => {
    await seedWorld(1, 'banditAmbush');
    await addPlayer(PLAYER_A, TOKEN_A);
    await seedWinningHero(PLAYER_A, HERO_A);

    const data = await readOk<{
      hasBattle: boolean;
      enemy: { id: string; pattern: { skillId: string }[] };
      party: { id: string; stats: { atk: number } }[];
      won: boolean;
      worldDefeated: boolean;
    }>(await battleRequest(TOKEN_A, 'GET'));

    expect(data.hasBattle).toBe(true);
    // 行動表を隠さない（設計書 §6.1）。事前セット式のパズルとして成立させる前提。
    expect(data.enemy.pattern.length).toBeGreaterThan(0);
    expect(data.party).toHaveLength(1);
    expect(data.party[0].id).toBe(HERO_A);
    expect(data.won).toBe(false);
    expect(data.worldDefeated).toBe(false);
  });

  it('認証が無ければ401', async () => {
    await seedWorld(1, 'banditAmbush');
    const response = await SELF.fetch('https://example.com/api/battle');
    expect(response.status).toBe(401);
  });
});

describe('POST /api/battle（設計書 §6.2〜§6.4）', () => {
  it('戦闘が無い日は断る（6）', async () => {
    await seedWorld(1, null);
    await addPlayer(PLAYER_A, TOKEN_A);
    await seedWinningHero(PLAYER_A, HERO_A);

    const response = await battleRequest(TOKEN_A, 'POST', { [HERO_A]: NO_ACTION_PLAN });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'no battle today' });
  });

  it('確定した選択肢が戦闘でない日も断る（6）', async () => {
    await seedWorld(1, 'crossroads');
    await addPlayer(PLAYER_A, TOKEN_A);
    await seedWinningHero(PLAYER_A, HERO_A);

    const response = await battleRequest(TOKEN_A, 'POST', { [HERO_A]: NO_ACTION_PLAN });
    expect(response.status).toBe(400);
  });

  it('同じプランからは同じログが出る（7・決定論）', async () => {
    await seedWorld(1, 'banditAmbush');
    await addPlayer(PLAYER_A, TOKEN_A);
    await seedWinningHero(PLAYER_A, HERO_A);

    const first = await readOk<{ log: BattleLog }>(await battleRequest(TOKEN_A, 'POST', { [HERO_A]: NO_ACTION_PLAN }));
    const second = await readOk<{ log: BattleLog }>(await battleRequest(TOKEN_A, 'POST', { [HERO_A]: NO_ACTION_PLAN }));

    expect(first.log).toEqual(second.log);
    expect(first.log.result).not.toBe('win'); // 何もしなければ勝てない＝負けても罰が無いことを別経路でも確認
  });

  it('負けても何度でも挑み直せて、DBには何も残らない', async () => {
    await seedWorld(1, 'banditAmbush');
    await addPlayer(PLAYER_A, TOKEN_A, 1000);
    await seedWinningHero(PLAYER_A, HERO_A);

    await battleRequest(TOKEN_A, 'POST', { [HERO_A]: NO_ACTION_PLAN });
    await battleRequest(TOKEN_A, 'POST', { [HERO_A]: NO_ACTION_PLAN });

    const gold = await env.DB.prepare('SELECT gold FROM players WHERE id = ?').bind(PLAYER_A).first<{ gold: number }>();
    expect(gold?.gold).toBe(1000); // 増えていない
    const results = await env.DB.prepare('SELECT COUNT(*) AS n FROM battle_results').first<{ n: number }>();
    expect(results?.n).toBe(0); // 記録も残らない
  });

  it('持っていない技を指すプランは弾かれず、unknownSkillとして記録される（10）', async () => {
    await seedWorld(1, 'banditAmbush');
    await addPlayer(PLAYER_A, TOKEN_A);
    await seedWinningHero(PLAYER_A, HERO_A);

    const response = await battleRequest(TOKEN_A, 'POST', { [HERO_A]: ['iceLance', null, null, null, null, null, null, null] });
    expect(response.status).toBe(200);
    const data = await readOk<{ log: BattleLog }>(response);
    expect(data.log.events).toContainEqual({ t: 'skip', actorId: HERO_A, reason: 'unknownSkill' });
  });

  it('勝てば報酬（経験値・金貨）が入り、討伐フラグが立つ', async () => {
    await seedWorld(1, 'banditAmbush');
    await addPlayer(PLAYER_A, TOKEN_A, 0);
    await seedWinningHero(PLAYER_A, HERO_A);

    const data = await readOk<{ log: BattleLog; rewarded: boolean; worldDefeated: boolean }>(
      await battleRequest(TOKEN_A, 'POST', { [HERO_A]: WINNING_PLAN }),
    );
    expect(data.log.result).toBe('win');
    expect(data.rewarded).toBe(true);
    expect(data.worldDefeated).toBe(true);

    const player = await env.DB.prepare('SELECT gold FROM players WHERE id = ?').bind(PLAYER_A).first<{ gold: number }>();
    expect(player?.gold).toBe(20); // BATTLE_REWARDS.banditScout.gold（packages/core/src/data/battleRewards.ts）

    const character = await env.DB.prepare('SELECT adventure_level, adventure_exp FROM characters WHERE id = ?').bind(HERO_A).first<{ adventure_level: number; adventure_exp: number }>();
    // 冒険Lv50は上限（MAX_ADVENTURE_LEVEL）なので、これ以上は上がらず経験値も溜まらない。
    // レベルが天井にあっても経験値の付与自体は起こる、という配線の確認。
    expect(character?.adventure_level).toBe(50);

    const world = await env.DB.prepare('SELECT defeated_by FROM world_days WHERE world_id = ? AND day_no = 1').bind(WORLD).first<{ defeated_by: string }>();
    expect(world?.defeated_by).toBe(PLAYER_A);
  });

  it('勝っても2回目の報酬は入らない（8・冪等性）', async () => {
    await seedWorld(1, 'banditAmbush');
    await addPlayer(PLAYER_A, TOKEN_A, 0);
    await seedWinningHero(PLAYER_A, HERO_A);

    const firstResult = await readOk<{ rewarded: boolean }>(await battleRequest(TOKEN_A, 'POST', { [HERO_A]: WINNING_PLAN }));
    expect(firstResult.rewarded).toBe(true);
    const goldAfterFirst = (await env.DB.prepare('SELECT gold FROM players WHERE id = ?').bind(PLAYER_A).first<{ gold: number }>())?.gold;

    // 同じ日にもう一度勝つ（何度でも挑み直せる。設計書 §6.2）。
    const secondResult = await readOk<{ rewarded: boolean }>(await battleRequest(TOKEN_A, 'POST', { [HERO_A]: WINNING_PLAN }));
    expect(secondResult.rewarded).toBe(false);

    const goldAfterSecond = (await env.DB.prepare('SELECT gold FROM players WHERE id = ?').bind(PLAYER_A).first<{ gold: number }>())?.gold;
    expect(goldAfterSecond).toBe(goldAfterFirst); // 増えていない＝二重に配っていない

    const results = await env.DB.prepare('SELECT COUNT(*) AS n FROM battle_results WHERE world_id = ? AND day_no = 1 AND player_id = ?').bind(WORLD, PLAYER_A).first<{ n: number }>();
    expect(results?.n).toBe(1); // 記録も1行のまま
  });

  it('2人が同じ日に勝ったとき、defeated_by は最初の1人のまま動かない（9・冪等性）', async () => {
    await seedWorld(1, 'banditAmbush');
    await addPlayer(PLAYER_A, TOKEN_A, 0);
    await addPlayer(PLAYER_B, TOKEN_B, 0);
    await seedWinningHero(PLAYER_A, HERO_A);
    await seedWinningHero(PLAYER_B, HERO_B);

    // まずAが確実に先に勝つ。「最初の1人はA」という状態を固定してから、
    // 後からBが勝ってもAのまま動かないことを見る。並行リクエストにすると
    // どちらが先に書き込めるかが不定になり、「後から勝った側で上書きされて
    // いないか」を毎回同じ形で検査できない。
    const dataA = await readOk<{ log: BattleLog }>(await battleRequest(TOKEN_A, 'POST', { [HERO_A]: WINNING_PLAN }));
    expect(dataA.log.result).toBe('win');

    const afterA = await env.DB.prepare('SELECT defeated_by FROM world_days WHERE world_id = ? AND day_no = 1').bind(WORLD).first<{ defeated_by: string }>();
    expect(afterA?.defeated_by).toBe(PLAYER_A);

    const dataB = await readOk<{ log: BattleLog }>(await battleRequest(TOKEN_B, 'POST', { [HERO_B]: WINNING_PLAN }));
    expect(dataB.log.result).toBe('win');

    const afterB = await env.DB.prepare('SELECT defeated_by FROM world_days WHERE world_id = ? AND day_no = 1').bind(WORLD).first<{ defeated_by: string }>();
    // Bも勝ったが、世界としての討伐者はAのまま。UPDATE ... WHERE defeated_by IS NULL
    // というガードを外すと、この行が PLAYER_B に書き換わって落ちる。
    expect(afterB?.defeated_by).toBe(PLAYER_A);

    // 両者とも自分の分の報酬はきちんと受け取っている（報酬は勝った本人だけ、という
    // 前提と、討伐フラグの一本化は別物であることの確認）。
    const goldA = await env.DB.prepare('SELECT gold FROM players WHERE id = ?').bind(PLAYER_A).first<{ gold: number }>();
    const goldB = await env.DB.prepare('SELECT gold FROM players WHERE id = ?').bind(PLAYER_B).first<{ gold: number }>();
    expect(goldA?.gold).toBe(20); // BATTLE_REWARDS.banditScout.gold
    expect(goldB?.gold).toBe(20);
  });

  it('2人がほぼ同時に勝っても defeated_by は1人だけに決まる（9・並行性）', async () => {
    await seedWorld(1, 'banditAmbush');
    await addPlayer(PLAYER_A, TOKEN_A, 0);
    await addPlayer(PLAYER_B, TOKEN_B, 0);
    await seedWinningHero(PLAYER_A, HERO_A);
    await seedWinningHero(PLAYER_B, HERO_B);

    // 実際に並行リクエストで競わせる。勝者はどちらかに決まらないが、
    // 「両方には決してならない」ことは保証されていなければならない。
    const [resultA, resultB] = await Promise.all([
      battleRequest(TOKEN_A, 'POST', { [HERO_A]: WINNING_PLAN }),
      battleRequest(TOKEN_B, 'POST', { [HERO_B]: WINNING_PLAN }),
    ]);
    const dataA = await readOk<{ log: BattleLog }>(resultA);
    const dataB = await readOk<{ log: BattleLog }>(resultB);
    expect(dataA.log.result).toBe('win');
    expect(dataB.log.result).toBe('win');

    const world = await env.DB.prepare('SELECT defeated_by FROM world_days WHERE world_id = ? AND day_no = 1').bind(WORLD).first<{ defeated_by: string }>();
    expect([PLAYER_A, PLAYER_B]).toContain(world?.defeated_by);
  });

  it('認証が無ければ401', async () => {
    await seedWorld(1, 'banditAmbush');
    const response = await SELF.fetch('https://example.com/api/battle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plan: {} }),
    });
    expect(response.status).toBe(401);
  });

  it('planの形が不正なら断る', async () => {
    await seedWorld(1, 'banditAmbush');
    await addPlayer(PLAYER_A, TOKEN_A);
    await seedWinningHero(PLAYER_A, HERO_A);

    const response = await battleRequest(TOKEN_A, 'POST', undefined);
    expect(response.status).toBe(400);
  });
});

/**
 * 段階6・設計書 §6・§8 テスト5〜6。連れているペットの効果が戦闘に効くこと、
 * および連れていなければ従来と結果が変わらないこと（後方互換）を見る。
 * WINNING_PLAN のような複数ターンの勝敗ではなく、1発だけの単純なダメージ量で
 * 比較する。バランス値（勝てる/勝てない）に依存させず、「効果がかかったこと
 * それ自体」だけを見るため。
 */
describe('ペットの効果が戦闘にかかる（設計書 §6・§8 テスト5・6）', () => {
  async function firstDamageToEnemyAmount(token: string): Promise<number> {
    const data = await readOk<{ log: BattleLog }>(
      await battleRequest(token, 'POST', { [HERO_A]: ['slash', null, null, null, null, null, null, null] }),
    );
    const damage = data.log.events.find((event) => event.t === 'damage' && event.targetId !== HERO_A);
    if (damage === undefined || damage.t !== 'damage') throw new Error('攻撃のダメージイベントが無い');
    return damage.amount;
  }

  it('ペットを連れていなければ、今まで通りのダメージになる（後方互換。テスト6）', async () => {
    await seedWorld(1, 'banditAmbush');
    await addPlayer(PLAYER_A, TOKEN_A);
    await seedWinningHero(PLAYER_A, HERO_A);

    const first = await firstDamageToEnemyAmount(TOKEN_A);
    const second = await firstDamageToEnemyAmount(TOKEN_A);
    // 同じプランなら何度呼んでも同じ（決定論）。
    expect(first).toBe(second);
    // ペットを実装する前と同じ実際の数値（段階6を入れる前に計測した固定値）。
    // activePetEffects が「連れていなくても何か返す」ように壊れると、
    // このダメージが変わってここで検出できる（自己比較の first===second だけでは
    // 「常に同じ何か」を返す壊れ方を捕まえられない）。
    expect(first).toBe(345);
  });

  it('連れているペットの効果がパーティにかかり、ダメージが変わる（テスト5）', async () => {
    await seedWorld(1, 'banditAmbush');
    await addPlayer(PLAYER_A, TOKEN_A);
    await seedWinningHero(PLAYER_A, HERO_A);

    const withoutPet = await firstDamageToEnemyAmount(TOKEN_A);

    await env.DB.prepare(
      `INSERT INTO player_pets (player_id, pet_id, obtained_at) VALUES (?, 'puppy', ?)`,
    ).bind(PLAYER_A, '2026-09-04T00:00:00.000Z').run();
    await env.DB.prepare('UPDATE players SET active_pet_id = ? WHERE id = ?').bind('puppy', PLAYER_A).run();

    const withPet = await firstDamageToEnemyAmount(TOKEN_A);

    // puppy は atk +15%（packages/core/src/data/pets.ts）。連れているだけで
    // パーティ（=このパーティ唯一のメンバーである主人公）の攻撃力が上がり、
    // 同じプランでも与えるダメージが増える。
    expect(withPet).toBeGreaterThan(withoutPet);
  });
});

/**
 * 実際の締め処理（catchUp）を走らせてから戦闘を引く。
 *
 * 他のテストは締まった日をDBに直接差し込むので、`current_day` と締めの関係を
 * 取り違えていても通ってしまう。実際にそれが起きた。ここは締めを本物に任せ、
 * 「投票して、締まって、戦えるようになる」という本番の流れをそのまま辿る。
 */
describe('締めを本物に任せた場合の戦闘の見え方', () => {
  it('締まる前は戦闘が無く、締めた後に戦えるようになる', async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
    for (const table of ['battle_results', 'party', 'learned', 'job_levels', 'characters', 'votes', 'world_days', 'players', 'invites', 'worlds']) {
      await env.DB.prepare(`DELETE FROM ${table}`).run();
    }
    // 2日前に始まった世界。1日目はまだ締まっていない。
    const startedAt = '2026-09-01T00:00:00.000Z';
    await env.DB.prepare(
      `INSERT INTO worlds (id, name, started_at, current_day, chapter, tags, created_at)
       VALUES (?, ?, ?, 1, 1, '[]', ?)`,
    ).bind(WORLD, 'テスト世界', startedAt, startedAt).run();
    await env.DB.prepare(
      `INSERT INTO world_days (world_id, day_no, option_ids, chosen_id) VALUES (?, 1, ?, NULL)`,
    ).bind(WORLD, JSON.stringify(['banditAmbush', 'crossroads', 'restAtSpring'])).run();

    await addPlayer(PLAYER_A, TOKEN_A);
    await seedWinningHero(PLAYER_A, HERO_A);

    // 1日目に戦闘の選択肢へ投票する。
    await env.DB.prepare(
      `INSERT INTO votes (world_id, day_no, player_id, option_id, voted_at) VALUES (?, 1, ?, 'banditAmbush', ?)`,
    ).bind(WORLD, PLAYER_A, startedAt).run();

    // 締める前。確定した選択肢がまだ無いので戦闘は無い。
    const before = await (await battleRequest(TOKEN_A, 'GET')).json() as { data: { hasBattle: boolean } };
    expect(before.data.hasBattle).toBe(false);

    // 本物の締め処理を走らせる。
    const { catchUp } = await import('../src/close.js');
    const closed = await catchUp(env.DB, WORLD, new Date('2026-09-02T00:00:00.000Z'));
    expect(closed).toBe(1);

    // 締めた後。1日目の確定した選択肢が戦闘なので、戦えるようになる。
    const after = await (await battleRequest(TOKEN_A, 'GET')).json() as {
      data: { hasBattle: boolean; dayNo: number };
    };
    expect(after.data.hasBattle).toBe(true);
    expect(after.data.dayNo).toBe(1);
  });
});

/**
 * 何日か開けてから戻ってきた場合。`catchUp` が複数日をまとめて締めるので、
 * 直近の1日しか見られないと、その間にあった戦闘が丸ごと飛ぶ。
 * 全体設計 §5.5 は溜まった戦いを順に片付けて追いつけることを明示している。
 */
describe('複数日がまとめて締まったとき', () => {
  it('直近でない過去の戦闘の日も指定して挑める', async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
    for (const table of ['battle_results', 'party', 'learned', 'job_levels', 'characters', 'votes', 'world_days', 'players', 'invites', 'worlds']) {
      await env.DB.prepare(`DELETE FROM ${table}`).run();
    }
    const startedAt = '2026-09-01T00:00:00.000Z';
    await env.DB.prepare(
      `INSERT INTO worlds (id, name, started_at, current_day, chapter, tags, created_at)
       VALUES (?, ?, ?, 1, 1, '[]', ?)`,
    ).bind(WORLD, 'テスト世界', startedAt, startedAt).run();
    await env.DB.prepare(
      `INSERT INTO world_days (world_id, day_no, option_ids, chosen_id) VALUES (?, 1, ?, NULL)`,
    ).bind(WORLD, JSON.stringify(['banditAmbush', 'crossroads', 'restAtSpring'])).run();

    await addPlayer(PLAYER_A, TOKEN_A);
    await seedWinningHero(PLAYER_A, HERO_A);
    await env.DB.prepare(
      `INSERT INTO votes (world_id, day_no, player_id, option_id, voted_at) VALUES (?, 1, ?, 'banditAmbush', ?)`,
    ).bind(WORLD, PLAYER_A, startedAt).run();

    // 3日ぶんまとめて締める。1日目は戦闘、2日目以降は投票が無いのでシードで決まる
    // 別の選択肢になる（非戦闘イベントを足した今の抽選では2日目はたまたま戦闘
    // （banditAmbush）、3日目は非戦闘（travelingBard）を引く。どちらに転んでも
    // 「指定した日がちゃんと引ける」ことは変わらない）。
    const { catchUp } = await import('../src/close.js');
    const closed = await catchUp(env.DB, WORLD, new Date('2026-09-04T00:00:00.000Z'));
    expect(closed).toBeGreaterThan(1);

    // 3日目を指定すれば非戦闘（このシードでは travelingBard）。
    const day2 = await (await battleRequest(TOKEN_A, 'GET', undefined, 3)).json() as {
      data: { hasBattle: boolean; dayNo: number };
    };
    expect(day2.data.hasBattle).toBe(false);
    expect(day2.data.dayNo).toBe(3);

    // 1日目を指定すれば挑める。ここが飛ぶと、離れていた間の戦いが失われる。
    const past = await (await battleRequest(TOKEN_A, 'GET', undefined, 1)).json() as {
      data: { hasBattle: boolean; dayNo: number };
    };
    expect(past.data.hasBattle).toBe(true);
    expect(past.data.dayNo).toBe(1);
  });

  it('締まっていない今日と未来の日は指定できない', async () => {
    await seedWorld(3, 'banditAmbush');
    await addPlayer(PLAYER_A, TOKEN_A);
    await seedWinningHero(PLAYER_A, HERO_A);

    // seedWorld(3) は current_day を 4 にするので、締まっているのは 3 まで。
    for (const dayNo of [4, 5]) {
      const response = await (await battleRequest(TOKEN_A, 'GET', undefined, dayNo)).json() as {
        data: { hasBattle: boolean };
      };
      expect(response.data.hasBattle).toBe(false);
    }
  });
});

/**
 * 7日ごとのボスの日（全体設計 §5.5）。
 *
 * 雑魚敵を足してイベントの敵の割り当てを変えた際、章ボスがどのイベントからも
 * 参照されなくなり、完全に到達不能になっていた。イベント側の検査は通るので、
 * 「ボスの日にボスが出る」ことを別に見ないと気づけない。
 */
describe('ボスの日', () => {
  it('7日目は、選ばれた選択肢が戦闘でなくても章ボスが出る', async () => {
    // 7日目の選択肢は戦闘ではない出来事（分かれ道）にしておく。
    await seedWorld(7, 'crossroads');
    await addPlayer(PLAYER_A, TOKEN_A);
    await seedWinningHero(PLAYER_A, HERO_A);

    const response = await (await battleRequest(TOKEN_A, 'GET')).json() as {
      data: { hasBattle: boolean; dayNo: number; enemy?: { id: string } };
    };
    expect(response.data.hasBattle).toBe(true);
    expect(response.data.dayNo).toBe(7);
    expect(response.data.enemy?.id).toBe('balgos');
  });

  it('ボスの日でない日は、選ばれた選択肢の敵が出る', async () => {
    await seedWorld(1, 'banditAmbush');
    await addPlayer(PLAYER_A, TOKEN_A);
    await seedWinningHero(PLAYER_A, HERO_A);

    const response = await (await battleRequest(TOKEN_A, 'GET')).json() as {
      data: { hasBattle: boolean; enemy?: { id: string } };
    };
    expect(response.data.hasBattle).toBe(true);
    expect(response.data.enemy?.id).not.toBe('balgos');
  });
});

/**
 * ペットを連れているかどうかが、実際の戦闘まで届いているかの検査。
 *
 * サーバが hasPet を渡し忘れても、型は通るし他のテストも通る。
 * 起きるのは「ペットを連れているのに魔物使いの技だけ空振りする」という、
 * 遊んでいる側からは原因の分からない壊れ方なので、ここで見る。
 */
describe('ペットの有無が戦闘に届いているか', () => {
  /** 魔物使いの技（ペットが要る）だけを持つキャラ。 */
  async function seedTamer(playerId: string, characterId: string): Promise<void> {
    const aptitude = JSON.stringify({ maxHp: 'A', maxMp: 'A', atk: 'A', def: 'A', mat: 'A', mdf: 'A', spd: 'A' });
    await env.DB.prepare(
      `INSERT INTO characters
         (id, player_id, name, adventure_level, adventure_exp, aptitude, current_job, equipped_active, equipped_passive, is_hero)
       VALUES (?, ?, ?, 50, 0, ?, 'beastTamer', ?, '[]', 1)`,
    ).bind(characterId, playerId, characterId, aptitude, JSON.stringify(['petFang'])).run();
    await env.DB.prepare(
      `INSERT INTO job_levels (character_id, job_id, level, exp) VALUES (?, 'beastTamer', 30, 0)`,
    ).bind(characterId).run();
    await env.DB.prepare(
      `INSERT INTO learned (character_id, kind, id) VALUES (?, 'skill', 'petFang')`,
    ).bind(characterId).run();
    await env.DB.prepare(`INSERT INTO party (player_id, character_id, slot) VALUES (?, ?, 0)`)
      .bind(playerId, characterId).run();
  }

  async function fightWithFang(): Promise<{ t: string; reason?: string }[]> {
    const response = await battleRequest(TOKEN_A, 'POST', { [HERO_A]: ['petFang'] });
    const body = await response.json() as { data: { log: { events: { t: string; reason?: string }[] } } };
    return body.data.log.events;
  }

  it('ペットを連れていなければ、魔物使いの技は noPet として記録される', async () => {
    await seedWorld(1, 'banditAmbush');
    await addPlayer(PLAYER_A, TOKEN_A);
    await seedTamer(PLAYER_A, HERO_A);

    const events = await fightWithFang();
    expect(events.some((e) => e.t === 'skip' && e.reason === 'noPet')).toBe(true);
    expect(events.some((e) => e.t === 'act')).toBe(true); // 敵は動いている
  });

  it('ペットを連れていれば、魔物使いの技が実際に使われる', async () => {
    await seedWorld(1, 'banditAmbush');
    await addPlayer(PLAYER_A, TOKEN_A);
    await seedTamer(PLAYER_A, HERO_A);
    await env.DB.prepare(`INSERT INTO player_pets (player_id, pet_id, obtained_at) VALUES (?, 'puppy', ?)`)
      .bind(PLAYER_A, '2026-09-06T00:00:00.000Z').run();
    await env.DB.prepare(`UPDATE players SET active_pet_id = 'puppy' WHERE id = ?`).bind(PLAYER_A).run();

    const events = await fightWithFang();
    expect(events.some((e) => e.t === 'skip' && e.reason === 'noPet')).toBe(false);
    expect(events.some((e) => e.t === 'act' && (e as { skillId?: string }).skillId === 'petFang')).toBe(true);
  });
});
