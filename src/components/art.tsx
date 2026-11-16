import type { ReactNode } from 'react';
import { CANON_AE1P, FUJI_XT5, PENTAX_LX, YASHICA_A, fmtISO, isSheet, type FilmCategory, type FilmFormat, type FilmStock, type Goal } from '../engine';

// Original illustrations drawn in SVG for this app (no photographs or third-party artwork).

function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const W = 160;
const H = 100;

export function GoalArt({ goal }: { goal: Goal | null }) {
  const r = rng(goal ?? 'none');
  const id = `g-${goal ?? 'none'}`;
  const sky = (a: string, b: string) => (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${id})`} />
    </>
  );
  let body: ReactNode;
  switch (goal) {
    case 'lightTrails':
      body = (
        <>
          {sky('#070b22', '#140d1e')}
          {[0, 1, 2, 3, 4].map((i) => {
            const y = 64 + i * 6;
            const d = `M-5 ${y} C 60 ${y + 8}, 100 ${y - 24}, 165 ${y - 22}`;
            const c = i < 2 ? '#ff4430' : '#ffd79a';
            return (
              <g key={i}>
                <path d={d} stroke={c} strokeWidth={5} opacity={0.35} fill="none" />
                <path d={d} stroke="#fff" strokeWidth={1} fill="none" opacity={0.9} />
              </g>
            );
          })}
        </>
      );
      break;
    case 'portraits':
      body = (
        <>
          {sky('#5a3a24', '#1e1410')}
          {Array.from({ length: 9 }, (_, i) => (
            <circle key={i} cx={r() * W} cy={r() * 70} r={5 + r() * 12} fill="#ffcf8a" opacity={0.15 + r() * 0.2} />
          ))}
          <ellipse cx={80} cy={44} rx={15} ry={18} fill="#0e0e0e" />
          <path d="M38 100 Q80 52 122 100Z" fill="#0e0e0e" />
        </>
      );
      break;
    case 'landscape':
      body = (
        <>
          {sky('#5c80ad', '#f2b87a')}
          <circle cx={112} cy={26} r={9} fill="#fff" opacity={0.85} />
          {[0, 1, 2].map((i) => {
            let d = `M0 100 L0 ${55 + i * 14}`;
            for (let x = 0; x <= W; x += 18 + r() * 14) d += ` L${x} ${55 + i * 14 - (5 + r() * 18)}`;
            d += ` L${W} 100Z`;
            const shade = [0.32, 0.2, 0.1][i]!;
            return <path key={i} d={d} fill={`rgb(${shade * 200},${shade * 255},${shade * 330})`} />;
          })}
        </>
      );
      break;
    case 'street': {
      const blocks: ReactNode[] = [];
      for (let x = 0, i = 0; x < W; i++) {
        const bw = 18 + r() * 20;
        const bh = 35 + r() * 45;
        blocks.push(<rect key={i} x={x} y={H - bh} width={bw} height={bh} fill={`hsl(0 0% ${12 + r() * 10}%)`} />);
        x += bw;
      }
      body = (
        <>
          {sky('#8c8c8c', '#3f3f44')}
          {blocks}
          <rect y={86} width={W} height={14} fill="#111" />
          <circle cx={100} cy={52} r={5} fill="#000" />
          <rect x={95} y={58} width={10} height={28} rx={4} fill="#000" />
        </>
      );
      break;
    }
    case 'astrophotography':
      body = (
        <>
          {sky('#02040f', '#0d0a1f')}
          <path d="M0 95 L160 10" stroke="#9a8fcf" strokeWidth={26} opacity={0.18} />
          {Array.from({ length: 70 }, (_, i) => (
            <circle key={i} cx={r() * W} cy={r() * H} r={0.4 + r() * 1.2} fill="#fff" opacity={0.5 + r() * 0.5} />
          ))}
        </>
      );
      break;
    case 'longExposure':
      body = (
        <>
          {sky('#6b7a8f', '#c3c8cc')}
          <rect y={58} width={W} height={42} fill="#c9cbcc" />
          <rect x={20} y={50} width={106} height={3} fill="#1c1c1c" />
          {Array.from({ length: 7 }, (_, i) => (
            <rect key={i} x={24 + i * 16} y={50 + i * 2} width={3} height={40} fill="#1c1c1c" />
          ))}
        </>
      );
      break;
    case 'architecture':
      body = (
        <>
          {sky('#334d73', '#8da6c7')}
          {Array.from({ length: 9 }, (_, i) => {
            const x = (W * i) / 8;
            return <line key={i} x1={x} y1={H} x2={x + (80 - x) * 0.45} y2={H - 160 * 0.45} stroke="#fff" opacity={0.75} />;
          })}
          {Array.from({ length: 6 }, (_, j) => (
            <line key={j} x1={14 + j * 3} x2={146 - j * 3} y1={H - (j + 1) * 11} y2={H - (j + 1) * 11} stroke="#fff" opacity={0.35} />
          ))}
        </>
      );
      break;
    case 'wildlife': {
      let d = 'M0 100';
      for (let x = 0; x <= W; x += 6) d += ` L${x} ${72 + r() * 10}`;
      d += ` L${W} 100Z`;
      body = (
        <>
          {sky('#dc9e5a', '#8c5938')}
          <path d={d} fill="#1f1611" />
          {Array.from({ length: 6 }, (_, i) => {
            const bx = 30 + r() * 100;
            const by = 20 + r() * 34;
            const s = 5 + r() * 6;
            return <path key={i} d={`M${bx - s} ${by - s * 0.4} Q${bx - s / 2} ${by - s * 0.7} ${bx} ${by} Q${bx + s / 2} ${by - s * 0.7} ${bx + s} ${by - s * 0.4}`} stroke="#141414" strokeWidth={1.6} fill="none" />;
          })}
        </>
      );
      break;
    }
    case 'sports':
      body = (
        <>
          {sky('#1a5233', '#0c331e')}
          {Array.from({ length: 6 }, (_, i) => (
            <line key={i} x1={8} x2={60 + r() * 30} y1={30 + i * 8} y2={30 + i * 8} stroke="#fff" opacity={0.35} strokeWidth={2} />
          ))}
          <circle cx={112} cy={48} r={13} fill="#fff" />
        </>
      );
      break;
    case 'macro':
      body = (
        <>
          {sky('#1f3819', '#0d1a0c')}
          {Array.from({ length: 10 }, (_, i) => (
            <ellipse key={i} cx={80} cy={36} rx={9} ry={16} fill="#f28cb3" opacity={0.85} transform={`rotate(${i * 36} 80 52)`} />
          ))}
          <circle cx={80} cy={52} r={8} fill="#ffcc33" />
        </>
      );
      break;
    case 'stillLife':
      body = (
        <>
          {sky('#29211c', '#120f0c')}
          <rect y={72} width={W} height={28} fill="#40291b" />
          <rect x={48} y={32} width={19} height={42} rx={8} fill="#8c997f" />
          <circle cx={93} cy={64} r={12} fill="#d97333" />
          <circle cx={113} cy={66} r={9} fill="#bfb34c" />
        </>
      );
      break;
    case 'documentary':
      body = (
        <>
          {sky('#292929', '#141414')}
          {[0, 1, 2].map((i) => (
            <rect key={i} x={10 + i * 50} y={24} width={43} height={52} fill={`hsl(0 0% ${30 + i * 12}%)`} />
          ))}
          {Array.from({ length: 14 }, (_, i) => (
            <g key={i}>
              <rect x={4 + i * 11.4} y={10} width={7} height={6} rx={1.5} fill="#000" />
              <rect x={4 + i * 11.4} y={84} width={7} height={6} rx={1.5} fill="#000" />
            </g>
          ))}
        </>
      );
      break;
    case 'product':
      body = (
        <>
          {sky('#ececec', '#b3b3b3')}
          <rect x={58} y={30} width={44} height={40} fill="#202020" />
          <rect x={58} y={70} width={44} height={14} fill="#4d4d4d" opacity={0.35} />
        </>
      );
      break;
    case 'waterfalls':
      body = (
        <>
          {sky('#1f3329', '#0f1a14')}
          {Array.from({ length: 6 }, (_, i) => (
            <rect key={i} x={60 + i * 7} y={10} width={6} height={90} rx={3} fill="#fff" opacity={0.5 + r() * 0.35} />
          ))}
          <rect y={82} width={W} height={18} fill="#d9d9d9" opacity={0.55} />
        </>
      );
      break;
    case 'night': {
      const items: ReactNode[] = [];
      for (let x = 0, i = 0; x < W; i++) {
        const bw = 13 + r() * 16;
        const bh = 25 + r() * 50;
        items.push(<rect key={`b${i}`} x={x} y={H - bh} width={bw} height={bh} fill="#0a0a0a" />);
        for (let wy = H - bh + 5; wy < H - 5; wy += 7)
          for (let wx = x + 3; wx < x + bw - 5; wx += 6) if (r() > 0.55) items.push(<rect key={`w${i}-${wx}-${wy}`} x={wx} y={wy} width={2.5} height={2.5} fill="#ffcc66" opacity={0.85} />);
        x += bw + 2;
      }
      body = (
        <>
          {sky('#050819', '#1e142e')}
          {items}
        </>
      );
      break;
    }
    default:
      body = (
        <>
          {sky('#242424', '#0f0f0f')}
          {Array.from({ length: 6 }, (_, i) => {
            const a = (i / 6) * Math.PI * 2;
            const R = 32;
            const p = (ang: number, rad: number) => `${80 + Math.cos(ang) * rad} ${50 + Math.sin(ang) * rad}`;
            return <path key={i} d={`M${p(a, R)} L${p(a + 1.3, R * 0.35)} L${p(a + 1.05, R)}Z`} fill={`hsl(0 0% ${22 + i * 3}%)`} />;
          })}
          <circle cx={80} cy={50} r={32} fill="none" stroke="var(--color-accent)" strokeWidth={2} />
        </>
      );
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {body}
    </svg>
  );
}

export const CATEGORY_COLOR: Record<FilmCategory, string> = {
  colorNegative: '#ee9a40',
  colorReversal: '#40a6d9',
  bwNegative: '#d1d1d1',
  infrared: '#bf2633',
  specialty: '#9a73d9',
  experimental: '#73cc80',
};

/** Canister / roll / sheet box coloured by film *category*, not any manufacturer's packaging. */
export function FilmArt({ stock, format }: { stock: FilmStock; format?: FilmFormat }) {
  const tint = CATEGORY_COLOR[stock.category];
  const fmt = format ?? stock.formats[0] ?? '35mm';
  const speed = stock.boxSpeed != null ? fmtISO(stock.boxSpeed) : stock.speedDesignation;
  const maker = stock.manufacturer.toUpperCase();
  const gid = `f-${stock.id}-${fmt}`;
  return (
    <svg viewBox="0 0 100 100" className="block h-full w-full" aria-label={`${stock.manufacturer} ${stock.name}`}>
      <defs>
        <linearGradient id={gid} x1="0" x2="1">
          <stop offset="0" stopColor={tint} stopOpacity={0.7} />
          <stop offset="0.45" stopColor={tint} />
          <stop offset="1" stopColor={tint} stopOpacity={0.55} />
        </linearGradient>
      </defs>
      <rect width={100} height={100} fill="var(--color-raise)" />
      {isSheet(fmt) ? (
        <g>
          <rect x={20} y={16} width={60} height={68} rx={3} fill="#181818" />
          <rect x={20} y={16} width={60} height={13} rx={3} fill={tint} />
          <text x={50} y={62} textAnchor="middle" fontSize={17} fontWeight={800} fill="#fff">
            {speed}
          </text>
          <text x={50} y={76} textAnchor="middle" fontSize={7} fontWeight={700} fill="#bbb">
            {maker.slice(0, 12)}
          </text>
        </g>
      ) : fmt === '35mm' ? (
        <g>
          <rect x={45} y={12} width={12} height={8} rx={2} fill="#444" />
          <rect x={62} y={38} width={26} height={30} fill="#5a3a20" />
          <rect x={29} y={18} width={42} height={66} rx={8} fill={`url(#${gid})`} />
          <text x={50} y={52} textAnchor="middle" fontSize={15} fontWeight={900} fill="#000" opacity={0.82}>
            {speed}
          </text>
          <text x={50} y={64} textAnchor="middle" fontSize={6} fontWeight={700} fill="#000" opacity={0.75}>
            {maker.slice(0, 11)}
          </text>
        </g>
      ) : (
        <g>
          <rect x={26} y={10} width={48} height={5} rx={2.5} fill="#333" />
          <rect x={26} y={85} width={48} height={5} rx={2.5} fill="#333" />
          <rect x={33} y={14} width={34} height={72} rx={4} fill={`url(#${gid})`} />
          <text x={50} y={52} textAnchor="middle" fontSize={13} fontWeight={900} fill="#000" opacity={0.82}>
            {speed}
          </text>
          <text x={50} y={63} textAnchor="middle" fontSize={5.5} fontWeight={700} fill="#000" opacity={0.75}>
            {maker.slice(0, 11)}
          </text>
        </g>
      )}
    </svg>
  );
}

/** Schematic camera illustrations, or the user's own photo. */
export function CameraArt({ templateId, photo }: { templateId?: string; photo?: string }) {
  if (photo) return <img src={photo} alt="" className="block h-full w-full object-cover" />;
  const chrome = 'url(#chrome)';
  const black = '#121212';
  const defs = (
    <defs>
      <linearGradient id="chrome" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#dcdcdc" />
        <stop offset="1" stopColor="#8a8a8a" />
      </linearGradient>
    </defs>
  );
  if (templateId === YASHICA_A) {
    return (
      <svg viewBox="0 0 160 100" className="block h-full w-full" aria-hidden>
        {defs}
        <rect width={160} height={100} fill="var(--color-raise)" />
        <rect x={56} y={10} width={48} height={7} fill={chrome} />
        <rect x={56} y={16} width={48} height={76} rx={5} fill={black} />
        {[
          [36, 13],
          [67, 14],
        ].map(([cy, rr], i) => (
          <g key={i}>
            <circle cx={80} cy={cy} r={rr! * 1.2} fill={chrome} />
            <circle cx={80} cy={cy} r={rr} fill={black} />
            <ellipse cx={76} cy={cy! - 4} rx={4} ry={3} fill="#fff" opacity={0.22} />
          </g>
        ))}
      </svg>
    );
  }
  if (templateId === FUJI_XT5) {
    return (
      <svg viewBox="0 0 160 100" className="block h-full w-full" aria-hidden>
        {defs}
        <rect width={160} height={100} fill="var(--color-raise)" />
        {/* top dials */}
        <rect x={34} y={24} width={20} height={9} rx={2} fill={chrome} />
        <rect x={102} y={24} width={20} height={9} rx={2} fill={chrome} />
        <rect x={60} y={28} width={10} height={6} rx={1.5} fill={chrome} />
        {/* centre viewfinder hump */}
        <path d="M64 34 L70 20 L90 20 L96 34 Z" fill={black} />
        {/* body */}
        <rect x={24} y={33} width={112} height={44} rx={7} fill={chrome} />
        <rect x={24} y={39} width={112} height={34} fill={black} />
        <rect x={120} y={38} width={13} height={36} rx={5} fill="#262626" />
        {/* short 23mm lens */}
        <circle cx={80} cy={58} r={19} fill={chrome} />
        <circle cx={80} cy={58} r={16} fill={black} />
        <circle cx={80} cy={58} r={10} fill="none" stroke="#3a3a3a" />
        <ellipse cx={75} cy={53} rx={3.5} ry={2.5} fill="#fff" opacity={0.22} />
      </svg>
    );
  }
  const lx = templateId === PENTAX_LX;
  const canon = templateId === CANON_AE1P;
  return (
    <svg viewBox="0 0 160 100" className="block h-full w-full" aria-hidden>
      {defs}
      <rect width={160} height={100} fill="var(--color-raise)" />
      <path d="M60 38 L68 18 L92 18 L100 38Z" fill={lx ? black : chrome} />
      <rect x={22} y={38} width={116} height={38} rx={7} fill={lx ? black : chrome} />
      <rect x={22} y={45} width={116} height={24} fill={black} />
      {canon && <rect x={26} y={44} width={11} height={30} rx={4} fill="#262626" />}
      <rect x={108} y={33} width={16} height={5} rx={2} fill={black} />
      <circle cx={80} cy={62} r={23} fill={chrome} />
      <circle cx={80} cy={62} r={20} fill={black} />
      <circle cx={80} cy={62} r={14} fill="none" stroke="#3a3a3a" />
      <ellipse cx={74} cy={56} rx={4} ry={3} fill="#fff" opacity={0.22} />
    </svg>
  );
}
