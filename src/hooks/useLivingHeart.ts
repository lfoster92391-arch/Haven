import { useEffect, useMemo, useState } from 'react'
import { useUserProfile, useLifeProfile, useHouseholdTasks } from './useHavenData'
import { fetchWeather } from '../lib/weatherPrep'
import { calculateHomeHealth } from '../lib/homeHealthEngine'
import { getLivingHeartScene, type LivingHeartSceneConfig } from '../lib/livingHeart'
import { deferNonCritical } from '../lib/deferWork'
import type { WeatherData } from '../lib/weatherPrep'

const REFRESH_MS = 5 * 60 * 1000

export interface UseLivingHeartResult {
  scene: LivingHeartSceneConfig | null
  loading: boolean
}

export function useLivingHeart(): UseLivingHeartResult {
  const profile = useUserProfile()
  const lifeProfile = useLifeProfile()
  const tasks = useHouseholdTasks()
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [homeHealthScore, setHomeHealthScore] = useState<number | null>(null)
  const [reference, setReference] = useState(() => new Date())

  useEffect(() => {
    const loc = lifeProfile?.weatherLocation
    if (!loc) {
      setWeather(null)
      return
    }
    let cancelled = false
    // Weather can wait — hero should paint with time-of-day art immediately.
    deferNonCritical(() => {
      fetchWeather(loc, lifeProfile).then(r => {
        if (!cancelled) setWeather(r.data)
      })
    }, 2500)
    return () => { cancelled = true }
  }, [lifeProfile?.weatherLocation?.lat, lifeProfile?.weatherLocation?.lon, lifeProfile])

  useEffect(() => {
    if (tasks === undefined) return
    deferNonCritical(() => {
      const health = calculateHomeHealth(tasks ?? [], reference)
      setHomeHealthScore(health.score)
    }, 1500)
  }, [tasks, reference])

  useEffect(() => {
    const id = window.setInterval(() => setReference(new Date()), REFRESH_MS)
    return () => window.clearInterval(id)
  }, [])

  const scene = useMemo(() => {
    return getLivingHeartScene({
      userName: profile?.name,
      reference,
      weather,
      homeHealthScore,
      latitude: lifeProfile?.weatherLocation?.lat,
    })
  }, [profile?.name, reference, weather, homeHealthScore, lifeProfile?.weatherLocation?.lat])

  // Never block Home on household tasks — scene works from time-of-day alone.
  return { scene, loading: false }
}
