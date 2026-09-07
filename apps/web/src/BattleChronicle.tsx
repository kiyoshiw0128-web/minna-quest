import type { BattleEvent } from '@mq/core';
import { groupBattleLog } from './battleLog.js';
import type { NameTable, SkillNameTable } from './battleLog.js';

type Props = {
  events: readonly BattleEvent[];
  names: NameTable;
  skills: SkillNameTable;
  enemyId: string;
};

/** 名前、技、対象、結果の順に読み下す、戦闘と闘技場共通の戦闘記録。 */
export function BattleChronicle({ events, names, skills, enemyId }: Props) {
  const groups = groupBattleLog(events, names);
  return (
    <div className="battle-chronicle">
      {groups.map((group) => (
        <div key={group.turn} className="chronicle-turn">
          <h4>ターン{group.turn}</h4>
          <ol className="chronicle-actions">
            {group.entries.map((entry, index) => (
              <li key={index} className="chronicle-action" data-side={entry.actorId === enemyId ? 'enemy' : 'party'}>
                {entry.actorId !== undefined && (
                  <p className="chronicle-actor">
                    <span aria-hidden="true">{entry.actorId === enemyId ? '◆' : '◇'}</span>
                    {names.get(entry.actorId) ?? entry.actorId}
                    <small>{entry.actorId === enemyId ? '敵' : '味方'}</small>
                  </p>
                )}
                {entry.skillId !== undefined && <p className="chronicle-skill">{skills.get(entry.skillId) ?? entry.skillId}！</p>}
                <ul className="chronicle-outcomes">
                  {entry.outcomes.map((outcome, i) => (
                    <li key={i} className="chronicle-outcome" data-kind={outcome.kind}>
                      {outcome.target !== undefined && <p className="chronicle-target">→ {outcome.target}</p>}
                      {outcome.amount !== undefined ? (
                        <p className="chronicle-amount"><strong>{outcome.amount}</strong>{outcome.kind === 'heal' ? '回復' : 'ダメージ'}</p>
                      ) : <p className="chronicle-note">{outcome.text}</p>}
                      {outcome.hpAfter !== undefined && <p className="chronicle-hp">残りHP <strong>{outcome.hpAfter}</strong></p>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
