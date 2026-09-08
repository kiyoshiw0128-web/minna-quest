import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdventureMap } from '../src/AdventureMap.js';
import { EVENT_LOCATIONS, LOCATIONS, eventLocation } from '../src/geography.js';
import { EVENTS } from '@mq/core';

describe('街名のある冒険地図', () => {
  it('全地点の名前と、現在地を1つだけ表示する', () => {
    const { container, rerender } = render(<AdventureMap current="forest" />);
    for (const location of Object.values(LOCATIONS)) expect(screen.getByText(location.name)).toBeInTheDocument();
    expect(container.querySelectorAll('[aria-current="location"]')).toHaveLength(1);
    expect(container.querySelector('[aria-current="location"]')).toHaveTextContent('月影の森');
    rerender(<AdventureMap />);
    expect(container.querySelector('[aria-current="location"]')).toBeNull();
    expect(screen.getByText('エルム地方 全図')).toBeInTheDocument();
  });
  it('全イベントに場所があり、未知のイベントの場所は捏造しない', () => {
    for (const event of Object.values(EVENTS)) expect(eventLocation(event.id)).not.toBeNull();
    expect(Object.keys(EVENT_LOCATIONS)).toHaveLength(Object.keys(EVENTS).length);
    expect(eventLocation('unknown-event')).toBeNull();
  });
});
