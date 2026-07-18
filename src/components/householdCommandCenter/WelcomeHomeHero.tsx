import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { LivingHeartAnimations } from '../livingHeart/LivingHeartAnimations'
import type { LivingHeartSceneConfig } from '../../lib/livingHeart'
import type { HomeVisionSurface } from '../../lib/householdCommandCenter'
import styles from './householdCommandCenter.module.css'

export interface WelcomeHomeHeroProps {
  scene: LivingHeartSceneConfig | null
  loading?: boolean
  vision: HomeVisionSurface | null
}

function useIsMobilePhone(): boolean {
  return useMemo(() => {
    if (typeof window === 'undefined') return true
    return window.matchMedia('(max-width: 768px)').matches
  }, [])
}

function usePrefersReducedMotion(): boolean {
  return useMemo(() => {
    if (typeof window === 'undefined') return true
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])
}

export function WelcomeHomeHero({ scene, loading, vision }: WelcomeHomeHeroProps) {
  const isMobile = useIsMobilePhone()
  const reduceMotion = usePrefersReducedMotion()
  const showAnimations = !isMobile && !reduceMotion

  const healthLines = vision?.heroHealthLines ?? []
  const attentionLine = vision?.attentionLine ?? null
  const restLine = vision?.restLine ?? null
  const ctaLabel = vision?.ctaLabel ?? "Go enjoy your day. I've got the rest."
  const ctaPath = vision?.ctaPath ?? '/today'
  const greeting = vision?.greeting ?? (loading ? '' : 'Welcome home.')
  const checkIn = vision?.checkInLine ?? "I'm settling in and learning your home."
  const status = vision?.statusHeadline ?? 'Everything is running smoothly.'
  const phaseClass =
    scene?.phase === 'night'
      ? styles.welcomeHeroNight
      : scene?.phase === 'evening'
        ? styles.welcomeHeroEvening
        : scene?.phase === 'afternoon'
          ? styles.welcomeHeroAfternoon
          : styles.welcomeHeroMorning

  const bannerSrc = scene?.bannerSrc ?? scene?.imageSrc

  return (
    <section
      className={`${styles.welcomeHero} ${phaseClass}`}
      aria-label="Welcome home"
      data-phase={scene?.phase ?? 'morning'}
      data-season={scene?.season ?? undefined}
    >
      <div className={styles.welcomeHeroMedia} aria-hidden={!scene}>
        {bannerSrc ? (
          <>
            <img
              src={bannerSrc}
              alt=""
              className={styles.welcomeHeroImage}
              style={!isMobile && scene?.imageFilter ? { filter: scene.imageFilter } : undefined}
              draggable={false}
              decoding="async"
              fetchPriority="high"
              sizes="100vw"
            />
            <div className={styles.welcomeHeroScrim} />
            {scene && showAnimations && (
              <div className={styles.welcomeHeroAnim}>
                <LivingHeartAnimations animations={scene.animations} weather={scene.weather} />
              </div>
            )}
          </>
        ) : (
          <div className={styles.welcomeHeroFallback} />
        )}
      </div>

      <div className={styles.welcomeHeroCopy}>
        <p className={styles.welcomeHeroEyebrow}>Welcome Home</p>
        <h1 className={styles.welcomeHeroGreeting}>
          {loading && !vision ? <span className={styles.welcomeHeroSkeleton} /> : greeting}
        </h1>

        {!loading && (
          <div className={styles.welcomeHeroNarrative}>
            <p className={styles.welcomeHeroCheckIn}>{checkIn}</p>
            <p className={styles.welcomeHeroStatus}>{status}</p>
            {attentionLine && <p className={styles.welcomeHeroAttention}>{attentionLine}</p>}
            {restLine && <p className={styles.welcomeHeroRest}>{restLine}</p>}

            {healthLines.length > 0 && (
              <ul className={styles.welcomeHeroHealth} aria-label="Home health">
                {healthLines.map(line => {
                  const toneClass =
                    line.tone === 'attention'
                      ? styles.welcomeHeroHealthAttention
                      : line.tone === 'unknown'
                        ? styles.welcomeHeroHealthUnknown
                        : styles.welcomeHeroHealthOk
                  const mark =
                    line.tone === 'attention' ? '•' : line.tone === 'unknown' ? '○' : '✓'
                  return (
                    <li key={line.label} className={`${styles.welcomeHeroHealthItem} ${toneClass}`}>
                      <span className={styles.welcomeHeroHealthMark} aria-hidden="true">{mark}</span>
                      <span className={styles.welcomeHeroHealthLabel}>{line.label}</span>
                      <span className={styles.welcomeHeroHealthDetail}>{line.detail}</span>
                    </li>
                  )
                })}
              </ul>
            )}

            <Link to={ctaPath} className={styles.welcomeHeroCta}>
              {ctaLabel}
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
