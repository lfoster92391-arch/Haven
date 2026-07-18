import type { WeatherData } from '../weatherPrep'

export type TimeOfDayPhase = 'morning' | 'afternoon' | 'evening' | 'night'
export type SeasonPhase = 'spring' | 'summer' | 'fall' | 'winter'
export type LivingHeartWeather = 'sunny' | 'rain' | 'snow' | 'cloudy' | 'storm'
export type HomeHealthMood = 'vibrant' | 'neutral' | 'cautious'

export interface LivingHeartAnimationFlags {
  birds: boolean
  clouds: boolean
  sunRays: boolean
  fireflies: boolean
  chimneySmoke: boolean
  rain: boolean
  rainRipples: boolean
  blossoms: boolean
  fallingLeaves: boolean
  lanternFlicker: boolean
  leafSway: boolean
  christmasLights: boolean
  morningFog: boolean
}

export interface LivingHeartSceneConfig {
  phase: TimeOfDayPhase
  season: SeasonPhase
  weather: LivingHeartWeather
  /** Circular emblem art (Living Heart widget). */
  imageSrc: string
  /** Full-bleed Home hero banner. */
  bannerSrc: string
  imageFilter?: string
  greeting: string
  animations: LivingHeartAnimationFlags
  overlayClasses: string[]
  mood: HomeHealthMood
  windowGlow: 'soft' | 'warm' | 'bright'
}

export interface LivingHeartInput {
  userName?: string
  reference?: Date
  weather?: WeatherData | null
  homeHealthScore?: number | null
  latitude?: number
}

export const LIVING_HEART_IMAGES = {
  morning: '/assets/living-heart/morning.png',
  evening: '/assets/living-heart/evening.png',
  night: '/assets/living-heart/night.png',
} as const

/** Full-bleed Home hero banners (signature emotional centerpiece). */
export const LIVING_HEART_BANNER_IMAGES = {
  morning: '/assets/living-heart/banner-morning.webp',
  afternoon: '/assets/living-heart/banner-afternoon.webp',
  evening: '/assets/living-heart/banner-sunset.webp',
  night: '/assets/living-heart/banner-night.webp',
} as const
