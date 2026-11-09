import { useId } from 'react';

/** Logo de Nosotros: dos globos de chat que se cruzan y forman un corazón. */
export default function Logo({ size = 32 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="40 90 420 370" width={size} height={(size * 370) / 420} aria-hidden>
<defs>
  <linearGradient id={`${id}gA`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff7a9c"/><stop offset="1" stopColor="#ff9a5c"/></linearGradient>
  <linearGradient id={`${id}gB`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#c06bff"/><stop offset="1" stopColor="#6a5cf5"/></linearGradient>
  <linearGradient id={`${id}gH`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff6b8b"/><stop offset="1" stopColor="#b05cf0"/></linearGradient>
  <clipPath id={`${id}cA`}><rect x="70" y="110" width="250" height="210" rx="105"/></clipPath>
</defs>
<g>
  <path d="M112 300 L84 392 L186 330 Z" fill={`url(#${id}gA)`}/>
  <rect x="70" y="110" width="250" height="210" rx="105" fill={`url(#${id}gA)`}/>
  <path d="M400 350 L430 440 L326 372 Z" fill={`url(#${id}gB)`}/>
  <rect x="192" y="160" width="250" height="210" rx="105" fill={`url(#${id}gB)`}/>
  <g clipPath={`url(#${id}cA)`}><rect x="192" y="160" width="250" height="210" rx="105" fill="#fff6fb"/></g>
  <path d="M256 305 C214 272 204 246 204 228 C204 208 219 196 235 196 C245 196 252 201 256 208 C260 201 267 196 277 196 C293 196 308 208 308 228 C308 246 298 272 256 305 Z" fill={`url(#${id}gH)`} transform="translate(0,-4)"/>
</g>

    </svg>
  );
}
