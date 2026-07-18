import hie from './hie'

import hbi from '../buyingIntelligence/hbi'

import { deferNonCritical } from '../deferWork'



const FIFTEEN_MIN = 15 * 60 * 1000
const LAUNCH_REFRESH_DELAY_MS = 2000
const MOBILE_LAUNCH_REFRESH_DELAY_MS = 12000
const MORNING_BRIEF_HOUR = 7
const NIGHTLY_PASS_HOUR = 22

let intervalId: ReturnType<typeof setInterval> | null = null
let morningBriefDone = ''
let nightlyPassDone = ''
let initialized = false
let resumeDebounce: ReturnType<typeof setTimeout> | null = null

function isMobilePhone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(max-width: 768px)').matches
}

function todayKey(): string {
  return new Date().toISOString().split('T')[0]
}

function checkDailyPasses(): void {
  const hour = new Date().getHours()
  const key = todayKey()

  if (hour >= MORNING_BRIEF_HOUR && morningBriefDone !== key) {
    morningBriefDone = key
    hie.refreshDeferred({ trigger: 'daily-briefing', force: true }, 500)
  }

  if (hour >= NIGHTLY_PASS_HOUR && nightlyPassDone !== key) {
    nightlyPassDone = key
    hie.refreshDeferred({ trigger: 'nightly-pass', force: true }, 500)
  }
}

function onVisibilityChange(): void {
  if (document.visibilityState !== 'visible') return
  if (resumeDebounce) clearTimeout(resumeDebounce)
  resumeDebounce = setTimeout(() => {
    resumeDebounce = null
    hie.refreshDebounced({ trigger: 'app-resume' }, 1500)
    checkDailyPasses()
  }, 800)
}

function scheduleBackgroundRefresh(hasCachedSnapshot: boolean): void {
  const mobile = isMobilePhone()
  const delay = mobile ? MOBILE_LAUNCH_REFRESH_DELAY_MS : LAUNCH_REFRESH_DELAY_MS

  hie.refreshDeferred(
    { trigger: 'app-launch', force: !hasCachedSnapshot },
    delay,
  )

  deferNonCritical(() => {
    // On phones, skip HBI refresh at launch if cache exists — Home already deferred it.
    if (!mobile || !hbi.getCachedHBISnapshot()) {
      hbi.refresh({ trigger: 'app-launch' }).catch(console.warn)
    }

    import('../story/storyAutoMemories').then(({ scheduleStoryAutoMemories }) => {
      scheduleStoryAutoMemories(mobile ? 15000 : 5000)
    }).catch(console.warn)
  }, mobile ? 10000 : 3000)
}

/** Initialize HIE background scheduler — call once at app start. */
export function initHIEScheduler(): void {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  const start = () => {
    hie.loadCachedSnapshot().then(cached => {
      scheduleBackgroundRefresh(!!cached)
    }).catch(err => {
      console.warn('HIE cache load failed', err)
      scheduleBackgroundRefresh(false)
    })

    document.addEventListener('visibilitychange', onVisibilityChange)

    intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        hie.refreshDebounced({ trigger: 'interval-15m' }, 1000)
        checkDailyPasses()
      }
    }, FIFTEEN_MIN)

    if (!isMobilePhone()) checkDailyPasses()
  }

  // Give Home a chance to paint before intelligence kicks in on phones.
  if (isMobilePhone()) {
    window.setTimeout(start, 8000)
  } else {
    start()
  }
}

export function stopHIEScheduler(): void {
  if (intervalId) clearInterval(intervalId)
  if (resumeDebounce) clearTimeout(resumeDebounce)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  initialized = false
}

