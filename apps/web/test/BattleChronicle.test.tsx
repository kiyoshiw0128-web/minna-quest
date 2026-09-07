import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { BattleChronicle } from '../src/BattleChronicle.js';
import type { BattleEvent } from '@mq/core';

const names = new Map([['a', 'アイネス'], ['b', 'カッシュ'], ['e', '嵐の淑女']]);
const skills = new Map([['storm', 'ブリザード'], ['heal', 'ヒール']]);

function show(events: BattleEvent[]) {
  return render(<BattleChronicle events={events} names={names} skills={skills} enemyId="e" />);
}

describe('縦に読み下す戦闘記録', () => {
  it('全体攻撃の複数の対象・ダメージ・HPを同じ技の下にまとめる', () => {
    show([
      { t: 'turnStart', turn: 1 },
      { t: 'act', actorId: 'e', skillId: 'storm' },
      { t: 'damage', targetId: 'a', amount: 27, hpAfter: 129 },
      { t: 'damage', targetId: 'b', amount: 62, hpAfter: 86 },
      { t: 'turnStart', turn: 2 },
      { t: 'act', actorId: 'a', skillId: 'heal' },
      { t: 'heal', targetId: 'b', amount: 20, hpAfter: 106 },
    ]);
    const attack = screen.getByText('ブリザード！').closest('li')!;
    expect(within(attack).getByText('嵐の淑女')).toBeInTheDocument();
    expect(within(attack).getByText('→ アイネス')).toBeInTheDocument();
    expect(within(attack).getByText('→ カッシュ')).toBeInTheDocument();
    expect(attack).toHaveTextContent('27ダメージ残りHP 129');
    expect(attack).toHaveTextContent('62ダメージ残りHP 86');
    expect(attack).not.toHaveTextContent('ヒール');
    const heal = screen.getByText('ヒール！').closest('li')!;
    expect(heal).toHaveTextContent('20回復残りHP 106');
    expect(screen.getByRole('heading', { name: 'ターン2' })).toBeInTheDocument();
  });

  it('激昂と失効は直前の技から分離し、行動不可や戦闘不能も消さない', () => {
    show([
      { t: 'turnStart', turn: 1 },
      { t: 'act', actorId: 'e', skillId: 'storm' },
      { t: 'damage', targetId: 'a', amount: 156, hpAfter: 0 },
      { t: 'down', actorId: 'a' },
      { t: 'enrage', actorId: 'e' },
      { t: 'skip', actorId: 'b', reason: 'noMp' },
      { t: 'expire', targetId: 'b', effect: { kind: 'stun', turns: 1 } },
    ]);
    const attack = screen.getByText('ブリザード！').closest('li')!;
    expect(attack).toHaveTextContent('アイネス が倒れた');
    expect(attack).not.toHaveTextContent('激昂');
    expect(attack).not.toHaveTextContent('切れた');
    expect(screen.getByText('嵐の淑女 が激昂した')).toBeInTheDocument();
    expect(screen.getByText(/行動できなかった（MP不足）/)).toBeInTheDocument();
    expect(screen.getByText(/カッシュ のスタン|カッシュ の スタン/)).toBeInTheDocument();
  });
});
