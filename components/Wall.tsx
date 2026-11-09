'use client';

import { memo, useMemo, type CSSProperties, type ReactNode } from 'react';

type V = CSSProperties & Record<`--${string}`, string | number>;

/** Pseudo-aleatorio estable (mismo fondo cada vez que abres el chat). */
const r = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
const COLORS = ['var(--accent)', 'var(--accent2)', '#fff4e0'];

function scene(id: string, k: number): ReactNode {
  const n = (x: number) => Math.max(3, Math.round(x * k));
  switch (id) {
    case 'gara':
      return (
        <>
          <i className="gara-grain" />
          <i className="gara-sheen" />
          <div className="gara-patch">
            <span className="gara-house">HOUSE OF</span>
            <span className="gara-word">GARA</span>
            <span className="gara-rule" />
            <span className="gara-sub">HANDCRAFTED · LEATHER GOODS</span>
          </div>
        </>
      );
    case 'stars':
      return (
        <>
          {Array.from({ length: n(70) }, (_, i) => (
            <i
              key={i}
              className="star"
              style={{ left: pct(r(i, 1)), top: pct(r(i, 2)), '--s': `${1 + r(i, 3) * 2.2}px`, '--d': `${2 + r(i, 4) * 4}s`, animationDelay: `${-r(i, 5) * 6}s` } as V}
            />
          ))}
          {[0, 1, 2].map((i) => (
            <b key={`s${i}`} className="shoot" style={{ top: `${8 + i * 17}%`, left: `${45 + i * 18}%`, animationDelay: `${1 + i * 4.4}s` }} />
          ))}
          <i className="moon" />
        </>
      );
    case 'nebula':
      return (
        <>
          {['var(--accent)', 'var(--accent2)', '#3b82f6', '#22d3ee'].map((c, i) => (
            <i
              key={i}
              className="neb"
              style={{ '--c': c, left: pct(r(i, 7) * 0.6 - 0.2), top: pct(r(i, 8) * 0.8 - 0.2), '--d': `${40 + i * 13}s`, animationDirection: i % 2 ? 'reverse' : 'normal' } as V}
            />
          ))}
          {Array.from({ length: n(45) }, (_, i) => (
            <i
              key={`d${i}`}
              className="star"
              style={{ left: pct(r(i, 11)), top: pct(r(i, 12)), '--s': `${1 + r(i, 13) * 1.6}px`, '--d': `${3 + r(i, 14) * 5}s`, animationDelay: `${-r(i, 15) * 6}s` } as V}
            />
          ))}
        </>
      );
    case 'synth':
      return (
        <>
          {Array.from({ length: n(30) }, (_, i) => (
            <i
              key={i}
              className="star"
              style={{ left: pct(r(i, 21)), top: pct(r(i, 22) * 0.45), '--s': `${1 + r(i, 23) * 1.5}px`, '--d': `${2 + r(i, 24) * 4}s` } as V}
            />
          ))}
          <i className="sun" />
          <div className="floor">
            <i className="grid" />
          </div>
          <i className="horizon" />
        </>
      );
    case 'petals':
      return (
        <>
          <i className="moon pink" />
          {Array.from({ length: n(20) }, (_, i) => (
            <span
              key={i}
              className="fall"
              style={{ left: pct(r(i, 31)), '--d': `${9 + r(i, 32) * 9}s`, animationDelay: `${-r(i, 33) * 18}s` } as V}
            >
              <i
                className="petal"
                style={{ '--z': `${14 + r(i, 34) * 12}px`, '--sw': `${(r(i, 35) - 0.5) * 90}px`, '--sd': `${3 + r(i, 36) * 3}s` } as V}
              />
            </span>
          ))}
        </>
      );
    case 'bokeh':
      return Array.from({ length: n(16) }, (_, i) => (
        <i
          key={i}
          className="orb"
          style={{
            left: pct(r(i, 41) * 1.1 - 0.1),
            top: pct(r(i, 42) * 1.1 - 0.1),
            '--z': `${40 + r(i, 43) * 110}px`,
            '--c': COLORS[i % 3],
            '--x': `${(r(i, 44) - 0.5) * 120}px`,
            '--y': `${(r(i, 45) - 0.5) * 140}px`,
            '--d': `${8 + r(i, 46) * 10}s`,
            animationDelay: `${-r(i, 47) * 10}s`,
          } as V}
        />
      ));
    case 'hearts':
      return Array.from({ length: n(18) }, (_, i) => (
        <span
          key={i}
          className="rise"
          style={{ left: pct(r(i, 51)), '--d': `${10 + r(i, 52) * 10}s`, animationDelay: `${-r(i, 53) * 20}s` } as V}
        >
          <i className="heart" style={{ '--z': `${12 + r(i, 54) * 22}px`, '--c': COLORS[i % 2], '--sw': `${(r(i, 55) - 0.5) * 50}px` } as V}>
            ♥
          </i>
        </span>
      ));
    case 'rain':
      return (
        <>
          {Array.from({ length: n(45) }, (_, i) => (
            <i
              key={i}
              className="drop"
              style={{ left: pct(r(i, 61) * 1.2 - 0.1), '--h': `${50 + r(i, 62) * 70}px`, '--d': `${0.6 + r(i, 63) * 0.7}s`, animationDelay: `${-r(i, 64) * 2}s`, opacity: 0.3 + r(i, 65) * 0.5 } as V}
            />
          ))}
          {Array.from({ length: n(26) }, (_, i) => (
            <i key={`g${i}`} className="glass" style={{ left: pct(r(i, 66)), top: pct(r(i, 67)), '--z': `${4 + r(i, 68) * 10}px` } as V} />
          ))}
          <i className="mist" />
        </>
      );
    case 'fireflies':
      return (
        <>
          <i className="mist green" />
          {Array.from({ length: n(26) }, (_, i) => (
            <i
              key={i}
              className="fly"
              style={{
                left: pct(r(i, 71)),
                top: pct(0.25 + r(i, 72) * 0.72),
                '--x': `${(r(i, 73) - 0.5) * 140}px`,
                '--y': `${(r(i, 74) - 0.5) * 120}px`,
                '--d': `${7 + r(i, 75) * 8}s`,
                '--b': `${1.5 + r(i, 76) * 2.5}s`,
                animationDelay: `${-r(i, 77) * 8}s, ${-r(i, 78) * 3}s`,
              } as V}
            />
          ))}
          <i className="trees" />
        </>
      );
    default:
      return null;
  }
}

function Wall({ id, mini = false }: { id: string; mini?: boolean }) {
  const content = useMemo(() => scene(id, mini ? 0.45 : 1), [id, mini]);
  return (
    <div className={`wall wall-${id}`} aria-hidden>
      {content}
    </div>
  );
}

export default memo(Wall);
