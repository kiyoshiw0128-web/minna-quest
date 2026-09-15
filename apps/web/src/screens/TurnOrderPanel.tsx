import { useState } from 'react';
import { DEFAULT_MAX_TURNS, SKILLS } from '@mq/core';
import type { Skill } from '@mq/core';
import type { MePartyMember } from '../api.js';

export function TurnOrderPanel({ member, busy, onSave }: {
  member: MePartyMember; busy: boolean; onSave: (turns: (string | null)[]) => void;
}) {
  const [turns, setTurns] = useState<(string | null)[]>(() => member.turnSkillIds
    ?? Array.from({ length: DEFAULT_MAX_TURNS }, () => member.equippedSkillIds[0] ?? null));
  return <section>
    <h3>戦闘で使う順番（{DEFAULT_MAX_TURNS}ターン）</h3>
    <p>冒険中の戦闘は、この順番で自動的に進みます。使いたい技を上で装備して保存してから、順番を決めてください。</p>
    <p>MP不足や再使用までの待ち時間がある技は、そのターンは使えません。「待機」は何もしません。</p>
    <p>装備から外した技は、使える基本の技に置き換わります。</p>
    <div className="turn-order-list">
      {turns.map((id, index) => <label key={index}>
        ターン{index + 1}
        <select aria-label={`${member.name} のターン${index + 1}`} value={id ?? ''} disabled={busy}
          onChange={(event) => setTurns((previous) => previous.map((value, i) => i === index ? event.target.value || null : value))}>
          <option value="">待機</option>
          {member.equippedSkillIds.map((skillId) => {
            const skill: Skill | undefined = SKILLS[skillId as keyof typeof SKILLS];
            return skill && <option key={skillId} value={skillId}>{skill.name}（MP {skill.mpCost}・待ち {skill.cooldown}ターン{skill.requiresPet ? '・要ペット' : ''}）</option>;
          })}
        </select>
      </label>)}
    </div>
    <button type="button" disabled={busy} onClick={() => onSave(turns)}>ターンごとの技を保存</button>
  </section>;
}
