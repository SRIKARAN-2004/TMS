interface PercentCircleProps {
  percent: number // 0-100
  label: string
  size?: number
  color?: string
}

/**
 * SVG ring/donut showing a percentage - used on the Reports pages for
 * per-employee effectiveness (project-based and activity-based).
 * Pure presentation, no data logic - caller computes the percent.
 */
export default function PercentCircle({ percent, label, size = 72, color = '#B8863E' }: PercentCircleProps) {
  const clamped = Math.max(0, Math.min(100, percent))
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - clamped / 100)

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E4DFD0" strokeWidth="6" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm figures font-semibold text-ink">{Math.round(clamped)}%</span>
        </div>
      </div>
      <span className="text-[11px] text-muted text-center leading-tight max-w-[80px]">{label}</span>
    </div>
  )
}
