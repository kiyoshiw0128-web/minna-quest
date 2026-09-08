import { LOCATIONS } from './geography.js';
import type { LocationId } from './geography.js';

export function AdventureMap({ current = null }: { current?: LocationId | null }) {
  return (
    <figure className="adventure-map">
      <div className="map-surface">
        <img src="/world-map.png" alt="街道で結ばれた村・王都・港町、森・泉・峠・遺跡・砦のある冒険の地図" width="1536" height="1024" />
        <ul className="map-labels" aria-label="地図の地名">
          {(Object.entries(LOCATIONS) as [LocationId, (typeof LOCATIONS)[LocationId]][]).map(([id, place]) => (
            <li key={id} style={{ left: `${place.x}%`, top: `${place.y}%` }} aria-current={id === current ? 'location' : undefined}>
              <span className="map-pin" aria-hidden="true">{id === current ? '▼' : '•'}</span>
              <span className="map-place">{place.name}</span>
            </li>
          ))}
        </ul>
      </div>
      <figcaption>{current === null ? 'エルム地方 全図' : `▼ 現在地：${LOCATIONS[current].name}`}</figcaption>
    </figure>
  );
}
