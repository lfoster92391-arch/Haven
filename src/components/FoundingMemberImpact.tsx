import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getFoundingMemberImpact,
  type FoundingMemberImpact,
} from '../lib/beta/foundingMemberImpact'
import {
  buildMemberHelpHavenInsight,
  type HelpHavenInsightReport,
} from '../lib/beta/helpHavenLearnInsights'
import { openHelpHavenLearn } from '../lib/beta/helpHavenLearnEvents'
import { HelpHavenLearnInsights } from './HelpHavenLearnInsights'
import styles from './FoundingMemberImpact.module.css'

export function FoundingMemberImpactCard() {
  const [impact, setImpact] = useState<FoundingMemberImpact | null>(null)
  const [insight, setInsight] = useState<HelpHavenInsightReport | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      void Promise.all([getFoundingMemberImpact(), buildMemberHelpHavenInsight({ enhance: false })]).then(
        ([impactData, insightData]) => {
          if (cancelled) return
          setImpact(impactData)
          setInsight(insightData)
        },
      )
    }
    load()
    window.addEventListener('haven:founders-impact-updated', load)
    return () => {
      cancelled = true
      window.removeEventListener('haven:founders-impact-updated', load)
    }
  }, [])

  useEffect(() => {
    function onFocus() {
      void getFoundingMemberImpact().then(setImpact)
      void buildMemberHelpHavenInsight({ enhance: false }).then(setInsight)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  if (!impact) return null

  return (
    <section className={styles.card} aria-label="Founding Member impact">
      <p className={styles.eyebrow}>🌿 Founding Member</p>
      <h2 className={styles.title}>Your Impact</h2>
      <p className={styles.lead}>
        {impact.empty
          ? 'You’re helping raise Haven. When you share how a page feels, your insight shows up here.'
          : 'You’ve helped Haven grow — quietly, one note at a time.'}
      </p>

      <ul className={styles.stats}>
        <li>
          <span className={styles.value}>{impact.ideasSubmitted}</span>
          <span className={styles.label}>Ideas shared</span>
        </li>
        <li>
          <span className={styles.value}>{impact.bugsFound}</span>
          <span className={styles.label}>Friction found</span>
        </li>
        <li>
          <span className={styles.value}>{impact.featuresAdopted}</span>
          <span className={styles.label}>Features shaped</span>
        </li>
        <li>
          <span className={styles.value}>
            {impact.communityRating != null ? impact.communityRating.toFixed(1) : '—'}
          </span>
          <span className={styles.label}>Your feeling ★</span>
        </li>
        <li>
          <span className={styles.value}>{impact.daysTogether}</span>
          <span className={styles.label}>Days together</span>
        </li>
      </ul>

      {impact.adoptedFeatures.length > 0 && (
        <div className={styles.shaped}>
          <p className={styles.shapedLabel}>You helped shape</p>
          <ul className={styles.shapedList}>
            {impact.adoptedFeatures.map(f => (
              <li key={f.id}>{f.title}</li>
            ))}
          </ul>
        </div>
      )}

      {insight && (
        <div className={styles.insightBlock}>
          <HelpHavenLearnInsights report={insight} compact />
        </div>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => openHelpHavenLearn()}>
          Help Haven Learn
        </button>
        <Link to="/vision" className={styles.secondary}>
          Why Haven exists
        </Link>
      </div>
    </section>
  )
}
