import { Icon } from './icons'

interface GreetingBannerProps {
  name?: string | null
  subtitle?: string
}

function timeGreeting(hour: number) {
  if (hour < 5) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * "Good morning, {name}" banner shown at the top of each role's
 * dashboard right after login, with today's full date underneath.
 * The greeting itself changes through the day (morning / afternoon /
 * evening / night) rather than always saying "morning".
 */
export default function GreetingBanner({ name, subtitle }: GreetingBannerProps) {
  const now = new Date()
  const greeting = timeGreeting(now.getHours())
  const firstName = name?.trim().split(' ')[0]
  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="greeting-banner">
      <div className="greeting-banner__text">
        <div className="greeting-banner__icon">
          <Icon.Sunrise />
        </div>
        <div>
          <div className="greeting-banner__title">
            {greeting}{firstName ? `, ${firstName}` : ''}
          </div>
          <div className="greeting-banner__date">
            {dateLabel}
            {subtitle ? <span> · {subtitle}</span> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
