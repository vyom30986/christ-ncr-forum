import type { SVGProps } from 'react'

const base = (size: number, p: SVGProps<SVGSVGElement>) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, ...p,
})

export const ThumbIcon = ({ size = 18, ...p }: { size?: number } & SVGProps<SVGSVGElement>) => (
  <svg {...base(size, p)}><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" /></svg>
)
export const CommentIcon = ({ size = 16, ...p }: { size?: number } & SVGProps<SVGSVGElement>) => (
  <svg {...base(size, p)}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
)
export const FlagIcon = ({ size = 18, ...p }: { size?: number } & SVGProps<SVGSVGElement>) => (
  <svg {...base(size, p)}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><path d="M4 22v-7" /></svg>
)
export const PlusIcon = ({ size = 28, ...p }: { size?: number } & SVGProps<SVGSVGElement>) => (
  <svg {...base(size, p)} strokeWidth={2.6}><path d="M5 12h14" /><path d="M12 5v14" /></svg>
)
export const CloseIcon = ({ size = 20, ...p }: { size?: number } & SVGProps<SVGSVGElement>) => (
  <svg {...base(size, p)}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
)
export const BackIcon = ({ size = 20, ...p }: { size?: number } & SVGProps<SVGSVGElement>) => (
  <svg {...base(size, p)}><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
)
export const GridIcon = ({ size = 22, ...p }: { size?: number } & SVGProps<SVGSVGElement>) => (
  <svg {...base(size, p)}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></svg>
)
export const UserIcon = ({ size = 22, ...p }: { size?: number } & SVGProps<SVGSVGElement>) => (
  <svg {...base(size, p)}><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>
)
export const ShieldIcon = ({ size = 22, ...p }: { size?: number } & SVGProps<SVGSVGElement>) => (
  <svg {...base(size, p)}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg>
)
export const LockIcon = ({ size = 22, ...p }: { size?: number } & SVGProps<SVGSVGElement>) => (
  <svg {...base(size, p)}><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
)
export const SparkIcon = ({ size = 18, ...p }: { size?: number } & SVGProps<SVGSVGElement>) => (
  <svg {...base(size, p)} strokeWidth={2}><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /></svg>
)
export const TrashIcon = ({ size = 18, ...p }: { size?: number } & SVGProps<SVGSVGElement>) => (
  <svg {...base(size, p)}><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
)
export const EditIcon = ({ size = 18, ...p }: { size?: number } & SVGProps<SVGSVGElement>) => (
  <svg {...base(size, p)}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
)
export const RefreshIcon = ({ size = 18, ...p }: { size?: number } & SVGProps<SVGSVGElement>) => (
  <svg {...base(size, p)}><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>
)
export const SunIcon = ({ size = 20, ...p }: { size?: number } & SVGProps<SVGSVGElement>) => (
  <svg {...base(size, p)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg>
)
export const MoonIcon = ({ size = 20, ...p }: { size?: number } & SVGProps<SVGSVGElement>) => (
  <svg {...base(size, p)}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
)
export const ChevronIcon = ({ size = 16, ...p }: { size?: number } & SVGProps<SVGSVGElement>) => (
  <svg {...base(size, p)}><path d="m6 9 6 6 6-6" /></svg>
)
export const UsersIcon = ({ size = 22, ...p }: { size?: number } & SVGProps<SVGSVGElement>) => (
  <svg {...base(size, p)}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
)
export const KeyIcon = ({ size = 22, ...p }: { size?: number } & SVGProps<SVGSVGElement>) => (
  <svg {...base(size, p)}><path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" /><path d="m21 2-9.6 9.6" /><circle cx="7.5" cy="15.5" r="5.5" /></svg>
)
export const ClockIcon = ({ size = 22, ...p }: { size?: number } & SVGProps<SVGSVGElement>) => (
  <svg {...base(size, p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
)
export const GearIcon = ({ size = 22, ...p }: { size?: number } & SVGProps<SVGSVGElement>) => (
  <svg {...base(size, p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
)
