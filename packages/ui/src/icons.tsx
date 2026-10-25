// packages/ui/src/icons.tsx
import type { SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement>;
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
};

/* ─── Existing ─── */

export function Heart(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M20.8 8.8c0 5.2-8.8 10-8.8 10s-8.8-4.8-8.8-10A4.7 4.7 0 0 1 12 6a4.7 4.7 0 0 1 8.8 2.8Z" />
    </svg>
  );
}
export function Chat(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.2-3.3A7.5 7.5 0 1 1 20 11.5Z" />
      <path d="M8 11h.01M12 11h.01M16 11h.01" />
    </svg>
  );
}
export function Video(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="6" width="13" height="12" rx="3" />
      <path d="m16 10 5-3v10l-5-3" />
    </svg>
  );
}
export function Lock(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 1 1 8 0v3M12 14v3" />
    </svg>
  );
}
export function Settings(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.8 1l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2Z" />
    </svg>
  );
}
export function User(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}
export function Sun(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
export function Moon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" />
    </svg>
  );
}
export function ChevronRight(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/* ─── New: navigation ─── */

export function Home(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 11 12 3l9 8" />
      <path d="M5 10v10h5v-6h4v6h5V10" />
    </svg>
  );
}
export function Compass(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </svg>
  );
}
export function Radio(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="2" />
      <path d="M7 7a7 7 0 0 0 0 10M17 7a7 7 0 0 1 0 10" />
      <path d="M4.5 4.5a11 11 0 0 0 0 15M19.5 4.5a11 11 0 0 1 0 15" />
    </svg>
  );
}
export function MessageCircle(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-5.4A8 8 0 1 1 21 12Z" />
    </svg>
  );
}
export function ChevronLeft(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

/* ─── New: actions / UI ─── */

export function X(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
export function Search(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
export function Bell(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}
export function Send(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m22 2-11 11" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </svg>
  );
}
export function Play(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 4v16l14-8L6 4Z" />
    </svg>
  );
}
export function Camera(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h3l2-2h6l2 2h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
export function Mic(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
    </svg>
  );
}
export function PhoneOff(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 3l18 18" />
      <path d="M8.5 8.5a10 10 0 0 1 11 3.5l-3 3a2 2 0 0 1-2.7.3l-1.6-1.3a6 6 0 0 1-3.4-1" />
      <path d="M14.5 14.5a10 10 0 0 1-3.5 1.5l-3 3a10 10 0 0 1-3.5-11" />
    </svg>
  );
}
export function Shield(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3 4 6v6a8 8 0 0 0 16 0V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
export function Wallet(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <path d="M3 10h18M16 15h2" />
    </svg>
  );
}
export function LogOut(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="m17 8 4 4-4 4M21 12H10" />
    </svg>
  );
}
export function Sparkle(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
      <path d="m6 6 3 3M15 15l3 3M18 6l-3 3M9 15l-3 3" />
    </svg>
  );
}
export function Star(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z" />
    </svg>
  );
}
export function Plus(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/* ─── New: extras ─── */

export function Calendar(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
export function Globe(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}
export function Download(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3v12M6 11l6 6 6-6M4 21h16" />
    </svg>
  );
}
export function Trash(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
export function Check(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}
