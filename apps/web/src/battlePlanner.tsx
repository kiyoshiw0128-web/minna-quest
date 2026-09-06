import { enemyArtPath } from './enemyArt.js';
import { DEFAULT_MAX_TURNS } from '@mq/core';
import type { BattleLog, DamageSpec, Element, Enemy, PartyMember, Skill } from '@mq/core';
import { groupBattleLog, summarizeResult } from './battleLog.js';
import type { NameTable, SkillNameTable } from './battleLog.js';

/**
 * 戦闘と闘技場の両画面が共有する「行動表とプランを見比べる」部品。
 *
 * 敵の行動表とプランのグリッドは、元は BattleScreen 専用だったが、闘技場も
 * 同じ「事前セット式・8ターン固定・行動表を公開する」戦闘を扱う（設計書 §6
 * 「同じ部品を使い回す」）。二重に書くと片方だけ直して片方が古くなる
 * （実際に一度、両者が離れて置かれ見比べられなくなるバグがあった）。
 */

/** characterId -> 8ターンぶんの技ID（未選択は null）。 */
export type PlanState = Record<string, (string | null)[]>;

export const ELEMENT_LABEL: Record<Element, string> = {
  none: 'なし', fire: '火', ice: '氷', thunder: '雷', holy: '光', dark: '闇',
};

/** 技の「威力」欄。種別によって単位が違うので、ここで人が読める1つの文字列にする。 */
export function damageLabel(damage: DamageSpec | undefined): string {
  if (damage === undefined) return '-';
  switch (damage.kind) {
    case 'physical':
      return `物理 ${damage.power}`;
    case 'magical':
      return `魔法 ${damage.power}`;
    case 'fixed':
      return `固定 ${damage.amount}`;
    case 'ratio':
      return `残HPの${damage.percent}%（上限${damage.cap}）`;
  }
}

export function freshPlan(party: readonly PartyMember[]): PlanState {
  const plan: PlanState = {};
  for (const member of party) {
    plan[member.id] = Array.from({ length: DEFAULT_MAX_TURNS }, () => null);
  }
  return plan;
}

export function EnemyTable({ enemy, turns }: { enemy: Enemy; turns: readonly number[] }) {
  // 行動表は技のIDしか持たないので、敵の技一覧から名前を引く。IDのまま出すと
  // 「dragonBreath」と並び、ログ側は「火炎の息」と出るので、同じ技だと分からない。
  // この表と自分の手を見比べるのがこの画面の目的なので、読めないと機能しない。
  const skillNames = new Map(enemy.skills.map((skill): [string, string] => [skill.id, skill.name]));

  return (
    <table>
      {/* 激昂の説明は、激昂する敵のときだけ出す。無い敵にも出すと
          「下の表」が存在せず、読み手が探すことになる。 */}
      <caption>
        {enemy.enrage === undefined
          ? '行動表はターン数で循環する。'
          : '行動表はターン数で循環する。HPが一定割合以下になると激昂し、下の表に切り替わる。'}
      </caption>
      <thead>
        <tr>
          <th scope="col">敵</th>
          {turns.map((turn) => (
            <th key={turn} scope="col">
              {turn + 1}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <PatternRow label="通常" pattern={enemy.pattern} turns={turns} skillNames={skillNames} />
        {enemy.enrage !== undefined && (
          <PatternRow
            label={`激昂後（HP${Math.round(enemy.enrage.hpRate * 100)}%以下）`}
            pattern={enemy.enrage.pattern}
            turns={turns}
            skillNames={skillNames}
          />
        )}
      </tbody>
    </table>
  );
}

function PatternRow({
  label,
  pattern,
  turns,
  skillNames,
}: {
  label: string;
  pattern: readonly { skillId: string }[];
  turns: readonly number[];
  skillNames: ReadonlyMap<string, string>;
}) {
  return (
    <tr>
      <th scope="row">{label}</th>
      {turns.map((turn) => (
        <td key={turn}>{patternCell(pattern, turn, skillNames)}</td>
      ))}
    </tr>
  );
}

/**
 * 行動表の1マス。名前が引けなければIDをそのまま出す。空欄にすると
 * 「その技が無い」のか「名前が引けなかった」のか区別がつかなくなる。
 */
function patternCell(
  pattern: readonly { skillId: string }[],
  turn: number,
  skillNames: ReadonlyMap<string, string>,
): string {
  const entry = pattern[turn % pattern.length];
  if (entry === undefined) return '-';
  return skillNames.get(entry.skillId) ?? entry.skillId;
}

/** 各人のステータスと、装備中の技のMP・クールダウン・威力・属性（設計書 §4.3）。 */
export function MemberDetail({ member }: { member: PartyMember }) {
  return (
    <details open>
      <summary>
        {member.name}（HP {member.stats.maxHp} / MP {member.stats.maxMp} / ATK {member.stats.atk} / DEF {member.stats.def} /
        {' '}MAT {member.stats.mat} / MDF {member.stats.mdf} / SPD {member.stats.spd}）
      </summary>
      <table>
        <thead>
          <tr>
            <th scope="col">技</th>
            <th scope="col">MP</th>
            <th scope="col">クールダウン</th>
            <th scope="col">威力</th>
            <th scope="col">属性</th>
          </tr>
        </thead>
        <tbody>
          {member.skills.map((skill: Skill) => (
            <tr key={skill.id}>
              <td>
                {skill.name}
                {/* ペットが要る技は、戦闘前に分からないと連れ忘れたまま挑むことになる。 */}
                {skill.requiresPet === true && '（要ペット）'}
              </td>
              <td>{skill.mpCost}</td>
              <td>{skill.cooldown === 0 ? '無し' : `${skill.cooldown}ターン`}</td>
              <td>{damageLabel(skill.damage)}</td>
              <td>{ELEMENT_LABEL[skill.element]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/**
 * 敵の絵。用意されていない敵のほうが多いので、無ければ何も出さない。
 * 枠だけ残すと、絵の準備中なのか、そういう敵なのかが読み取れない。
 */
export function EnemyPortrait({ enemyId, name }: { enemyId: string; name: string }) {
  const src = enemyArtPath(enemyId);
  if (src === null) return null;
  return (
    <div className="portrait">
      {/* 名前は見出しに出ているので、絵の alt は装飾として空にする。
          読み上げで名前が二度続くのを避ける。 */}
      <img src={src} alt="" width={220} height={220} loading="lazy" />
      <span className="portrait-name">{name}</span>
    </div>
  );
}

/** 行が味方、列がターン1〜8。敵の行動表と同じ列数で並べる（設計書 §4.3）。 */
export function PlanTable({
  party,
  plan,
  turns,
  onChangeTurn,
  disabled,
}: {
  party: readonly PartyMember[];
  plan: PlanState;
  turns: readonly number[];
  onChangeTurn: (characterId: string, turnIndex: number, skillId: string | null) => void;
  disabled: boolean;
}) {
  return (
    <table>
      <caption>プラン（8ターン）</caption>
      <thead>
        <tr>
          <th scope="col">名前</th>
          {turns.map((turn) => (
            <th scope="col" key={turn}>
              ターン{turn + 1}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {party.map((member) => (
          <tr key={member.id}>
            <th scope="row">{member.name}</th>
            {turns.map((turn) => (
              <td key={turn}>
                <select
                  aria-label={`${member.name} のターン${turn + 1}`}
                  value={plan[member.id]?.[turn] ?? ''}
                  disabled={disabled}
                  onChange={(event) => onChangeTurn(member.id, turn, event.target.value === '' ? null : event.target.value)}
                >
                  <option value="">何もしない</option>
                  {member.skills.map((skill) => (
                    <option key={skill.id} value={skill.id}>
                      {skill.name}
                    </option>
                  ))}
                </select>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * 敵の行動表と自分のプランを、同じ横スクロールの中に上下で並べる。
 * 別々の枠に置くと、列幅も揃わず、片方をスクロールしても片方は動かないので、
 * 「5ターン目に何が来るか」と「5ターン目に何をするか」を同時に見られない。
 * それを見比べることがこの画面の目的なので、離すと画面の意味が無くなる。
 */
export function TurnGrid({
  enemy,
  party,
  plan,
  onChangeTurn,
  disabled,
}: {
  enemy: Enemy;
  party: readonly PartyMember[];
  plan: PlanState;
  onChangeTurn: (characterId: string, turnIndex: number, skillId: string | null) => void;
  disabled: boolean;
}) {
  const turns = Array.from({ length: DEFAULT_MAX_TURNS }, (_, i) => i);
  return (
    <div className="turn-grid">
      <EnemyTable enemy={enemy} turns={turns} />
      <PlanTable party={party} plan={plan} turns={turns} onChangeTurn={onChangeTurn} disabled={disabled} />
    </div>
  );
}

/** 戦闘結果の表示。ターンごとのログと、報酬（あれば追加の一言）をまとめる。 */
export function BattleResultView({
  party,
  enemy,
  log,
  rewarded,
  rewardedMessage,
  notRewardedMessage,
  children,
}: {
  party: readonly PartyMember[];
  enemy: Enemy;
  log: BattleLog;
  rewarded: boolean;
  rewardedMessage: string;
  notRewardedMessage: string;
  children?: React.ReactNode;
}) {
  const names: NameTable = new Map([
    ...party.map((member): [string, string] => [member.id, member.name]),
    [enemy.id, enemy.name],
  ]);
  const skillNames: SkillNameTable = new Map([
    ...party.flatMap((member) => member.skills.map((skill): [string, string] => [skill.id, skill.name])),
    ...enemy.skills.map((skill): [string, string] => [skill.id, skill.name]),
  ]);
  const groups = groupBattleLog(log.events, names, skillNames);

  return (
    <section>
      <h3>結果: {summarizeResult(log.events)}</h3>
      <p>{rewarded ? rewardedMessage : notRewardedMessage}</p>
      {children}
      {groups.map((group) => (
        <div key={group.turn} className="log-turn">
          <h4>ターン{group.turn}</h4>
          <ul>
            {group.lines.map((line, i) => (
              // 同一ターン内で同文が複数回起きうる（例: 全体攻撃で複数人が同じダメージ表記）ため、
              // key はインデックスに頼らざるを得ない。この配列はターンごとに作り直されるので害はない。
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
