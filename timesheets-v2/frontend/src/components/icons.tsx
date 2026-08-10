/**
 * A small, single-source set of line icons used everywhere in the app -
 * the sidebar, the login form, table row actions, and dashboard banners
 * all pull from here so the same visual language shows up on every
 * screen instead of a mix of emoji and one-off glyphs.
 *
 * Style: 1.6px stroke, rounded joins, 24x24 viewBox, currentColor - so
 * every icon inherits whatever color/size its wrapper sets.
 */
import { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export const Icon = {
  Dashboard: (p: IconProps) => (
    <svg {...base} {...p}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  ),
  User: (p: IconProps) => (
    <svg {...base} {...p}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c1.4-3.6 4.4-5.5 7.5-5.5s6.1 1.9 7.5 5.5" />
    </svg>
  ),
  Shield: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M12 3.5 19 6.2v5.3c0 4.4-2.9 7.9-7 9-4.1-1.1-7-4.6-7-9V6.2L12 3.5z" />
      <path d="M9.2 12.2l2 2 3.6-3.9" />
    </svg>
  ),
  Folder: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M3.5 6.5a1 1 0 0 1 1-1h4.4l1.7 2h8.9a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V6.5z" />
    </svg>
  ),
  CheckSquare: (p: IconProps) => (
    <svg {...base} {...p}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M8 12.2l2.6 2.6L16.5 9" />
    </svg>
  ),
  Clock: (p: IconProps) => (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  ),
  BarChart: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M5 19.5V11" />
      <path d="M12 19.5V4.5" />
      <path d="M19 19.5v-6.8" />
      <path d="M3.5 19.5h17" />
    </svg>
  ),
  Settings: (p: IconProps) => (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.6v2.1M12 18.3v2.1M20.4 12h-2.1M5.7 12H3.6M17.5 6.5l-1.5 1.5M8 14.5 6.5 16M17.5 17.5 16 16M8 9.5 6.5 8" />
    </svg>
  ),
  LogOut: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M9 20H5.8a1.3 1.3 0 0 1-1.3-1.3V5.3A1.3 1.3 0 0 1 5.8 4H9" />
      <path d="M15.5 16.5 20 12l-4.5-4.5" />
      <path d="M20 12H9" />
    </svg>
  ),
  Eye: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  ),
  EyeOff: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M3.5 3.5l17 17" />
      <path d="M10.6 5.7A10.6 10.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15.6 15.6 0 0 1-3.3 4.2M7.9 7.3C5.2 8.9 3.5 12 3.5 12s3.5 6.5 9.5 6.5c1.2 0 2.3-.2 3.3-.7" />
      <path d="M9.9 10a2.8 2.8 0 0 0 3.9 3.9" />
    </svg>
  ),
  Sunrise: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M12 3.5v3.2" />
      <path d="M5.6 9.1l2.2 2.2M18.4 9.1l-2.2 2.2" />
      <path d="M3.5 16h17" />
      <path d="M6.5 16a5.5 5.5 0 0 1 11 0" />
      <path d="M3.5 20h17" />
    </svg>
  ),
  Pencil: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M4 20l.9-3.9L15.6 5.4a1.7 1.7 0 0 1 2.4 0l0.6.6a1.7 1.7 0 0 1 0 2.4L8 19.1 4 20z" />
      <path d="M13.8 7.2l3 3" />
    </svg>
  ),
  Trash: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M4.5 7h15" />
      <path d="M9 7V5.3A1.3 1.3 0 0 1 10.3 4h3.4A1.3 1.3 0 0 1 15 5.3V7" />
      <path d="M6.5 7l.7 11.3A1.5 1.5 0 0 0 8.7 20h6.6a1.5 1.5 0 0 0 1.5-1.7L17.5 7" />
      <path d="M10.2 11v5.3M13.8 11v5.3" />
    </svg>
  ),
  Key: (p: IconProps) => (
    <svg {...base} {...p}>
      <circle cx="8" cy="15.5" r="4" />
      <path d="M11 12.5 18.5 5" />
      <path d="M16 7.5 18.5 10" />
      <path d="M19 4.5 21.5 7" />
    </svg>
  ),
  Ban: (p: IconProps) => (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6.3 6.3l11.4 11.4" />
    </svg>
  ),
  Check: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M4.5 12.5l5 5 10-11" />
    </svg>
  ),
  X: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  UserPlus: (p: IconProps) => (
    <svg {...base} {...p}>
      <circle cx="9.5" cy="8" r="3.2" />
      <path d="M3.5 20c1.2-3.4 3.6-5.1 6-5.1s4.8 1.7 6 5.1" />
      <path d="M18 8v4.5M20.3 10.3h-4.5" />
    </svg>
  ),
  Briefcase: (p: IconProps) => (
    <svg {...base} {...p}>
      <rect x="3.5" y="7.5" width="17" height="11.5" rx="1.8" />
      <path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5" />
      <path d="M3.5 12.5h17" />
    </svg>
  ),
  AlertTriangle: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M12 4 21 19H3L12 4z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.7" r="0.15" fill="currentColor" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  ),
  Calendar: (p: IconProps) => (
    <svg {...base} {...p}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v3.5M16 3v3.5" />
    </svg>
  ),
  Zap: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M13 3 5 13.5h5.5L11 21l8-10.5h-5.5L13 3z" />
    </svg>
  ),
  Plus: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M12 4.5v15M4.5 12h15" />
    </svg>
  ),
  Upload: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M12 15.5V4.5" />
      <path d="M7.5 9 12 4.5 16.5 9" />
      <path d="M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
    </svg>
  ),
  Download: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M12 4.5v11" />
      <path d="M7.5 11 12 15.5 16.5 11" />
      <path d="M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
    </svg>
  ),
}
