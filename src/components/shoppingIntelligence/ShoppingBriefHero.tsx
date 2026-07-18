import styles from './shoppingIntelligence.module.css'
import type { ShoppingMorningBrief } from '../../lib/shoppingIntelligence/types'

export interface ShoppingBriefHeroProps {
  brief: ShoppingMorningBrief
}

export function ShoppingBriefHero({ brief }: ShoppingBriefHeroProps) {
  return (
    <section className={styles.hero} aria-label="Savings morning briefing">
      <p className={styles.heroEyebrow}>Savings</p>
      <h2 className={styles.heroGreeting}>{brief.greeting}</h2>
      {brief.question && <p className={styles.heroQuestion}>{brief.question}</p>}
      <p className={styles.heroHeadline}>{brief.headline}</p>
      {brief.bullets.length > 0 && (
        <ul className={styles.heroBullets}>
          {brief.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
      {brief.closingLine && <p className={styles.heroClosing}>{brief.closingLine}</p>}
      {brief.isDemo && (
        <p className={styles.demoNote}>Sample insights — add pantry & receipts for yours</p>
      )}
    </section>
  )
}
