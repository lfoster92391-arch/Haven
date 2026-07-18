export type HavenChatIntent =
  | 'baby_care_secret'
  | 'christmas_secret'
  | 'savings_log'
  | 'grocery_spend'
  | 'brand_preference'
  | 'food_exclusion'
  | 'receipt_offer'
  | 'room_tour'
  | 'bill_query'
  | 'dinner_query'
  | 'cook_query'
  | 'expiring_query'
  | 'afford_query'
  | 'due_query'
  | 'whats_coming'
  | 'savings_hunt'
  | 'subscription_query'
  | 'buy_wait_skip'
  | 'pantry_search'
  | 'timeline_search'
  | 'navigate'
  | 'confirm'
  | 'cancel'
  | 'clarify_answer'
  | 'cook_next'
  | 'unknown'

export interface ParsedEntities {
  amount?: number
  store?: string
  brand?: string
  item?: string
  food?: string
  habit?: string
  monthLabel?: string
  mealName?: string
  room?: 'fridge' | 'freezer' | 'pantry' | 'spice'
  raw?: string
}

export interface IntentParseResult {
  intent: HavenChatIntent
  confidence: number
  entities: ParsedEntities
  /** Suggested route when intent is navigate / dinner / etc. */
  route?: string
}

function extractAmount(text: string): number | undefined {
  const m = text.match(/\$\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:dollars?|bucks)/i)
  if (!m) return undefined
  return parseFloat(m[1] ?? m[2])
}

const STORES = [
  'walmart', 'aldi', 'kroger', 'target', 'costco', "sam's", 'sams',
  'publix', 'trader joe', 'whole foods', 'amazon', 'cvs', 'walgreens',
]

function extractStore(text: string): string | undefined {
  const lower = text.toLowerCase()
  for (const s of STORES) {
    if (lower.includes(s)) {
      if (s === "sam's" || s === 'sams') return "Sam's Club"
      return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    }
  }
  const at = text.match(/\bat\s+([A-Za-z][A-Za-z'&.\s]{1,30})(?:\s|$|,|\.)/i)
  return at?.[1]?.trim()
}

function extractMealName(text: string): string | undefined {
  const patterns = [
    /(?:how\s+(?:do\s+i|to)\s+(?:cook|make|prepare)\s+)(.+)/i,
    /(?:walk\s+me\s+through\s+(?:making\s+|cooking\s+)?)(.+)/i,
    /(?:recipe\s+for\s+)(.+)/i,
    /(?:make|cook|prepare)\s+(.+)/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1]) {
      return m[1]
        .replace(/\?+$/, '')
        .replace(/\s+(for\s+dinner|tonight|please|step\s+by\s+step).*$/i, '')
        .trim()
    }
  }
  return undefined
}

import {
  matchesBabyCareKeywords,
  matchesBabyCareReopen,
} from './babyCareSecret'
import {
  matchesChristmasKeywords,
  matchesChristmasReopen,
} from './christmasSecret'

/** Rule-based intent + entity extraction (v1 — no LLM required). */
export function parseChatIntent(input: string): IntentParseResult {
  const text = input.trim()
  const lower = text.toLowerCase()
  const amount = extractAmount(text)
  const store = extractStore(text)

  if (/^(yes|yep|yeah|confirm|do it|save it|please|sure|ok|okay)$/i.test(text.trim())) {
    return { intent: 'confirm', confidence: 0.95, entities: { raw: text } }
  }
  if (/^(no|nope|cancel|never ?mind|stop)$/i.test(text.trim())) {
    return { intent: 'cancel', confidence: 0.95, entities: { raw: text } }
  }
  if (/^(next|continue|next step|got it|ready)$/i.test(text.trim())) {
    return { intent: 'cook_next', confidence: 0.9, entities: { raw: text } }
  }

  // Secret menus — high priority (keyword unlock; reopen phrases handled in engine)
  if (matchesBabyCareKeywords(text) || matchesBabyCareReopen(text)) {
    return {
      intent: 'baby_care_secret',
      confidence: 0.97,
      entities: { raw: text },
      route: '/savings',
    }
  }
  if (matchesChristmasKeywords(text) || matchesChristmasReopen(text)) {
    return {
      intent: 'christmas_secret',
      confidence: 0.97,
      entities: { raw: text },
      route: '/finance',
    }
  }

  // Brand preference: "I always buy Folgers coffee" / "always buy this brand of coffee"
  const brandAlways = lower.match(
    /always\s+buy\s+(?:this\s+brand\s+of\s+)?([a-z0-9][a-z0-9\s&'-]{1,40?}?)(?:\s+(?:brand\s+of\s+)?([a-z][a-z\s-]{1,30}))?/i,
  )
  const brandOf = text.match(
    /always\s+buy\s+([A-Za-z0-9][A-Za-z0-9\s&'-]{1,40})\s+(?:brand\s+of\s+|for\s+)?([a-z][a-z\s-]{1,30})/i,
  )
  if (/always\s+buy/i.test(lower) || /preferred\s+brand/i.test(lower) || /my\s+brand\s+(?:of\s+)?/i.test(lower)) {
    let brand: string | undefined
    let item: string | undefined
    if (brandOf) {
      brand = brandOf[1].trim()
      item = brandOf[2].trim()
    } else {
      const ofItem = text.match(/brand\s+of\s+([a-z][a-z\s-]{1,30})/i)
      item = ofItem?.[1]?.trim() ?? brandAlways?.[2]?.trim() ?? 'coffee'
      brand = brandAlways?.[1]?.trim()
      if (brand && /^(this|that|my)$/i.test(brand)) brand = undefined
    }
    return {
      intent: 'brand_preference',
      confidence: brand ? 0.85 : 0.6,
      entities: { brand, item, raw: text },
    }
  }

  // Food exclusion
  if (
    /don'?t\s+eat|do\s+not\s+eat|never\s+eat|allergic\s+to|can'?t\s+eat|hate\s+/i.test(lower)
  ) {
    const foodMatch =
      text.match(/(?:don'?t|do not|never|can'?t)\s+eat\s+([a-z][a-z\s-]{1,40})/i)
      ?? text.match(/allergic\s+to\s+([a-z][a-z\s-]{1,40})/i)
      ?? text.match(/hate\s+([a-z][a-z\s-]{1,40})/i)
    const food = foodMatch?.[1]?.replace(/\s+(and|or|because).*$/i, '').trim()
    return {
      intent: 'food_exclusion',
      confidence: food ? 0.9 : 0.55,
      entities: { food, raw: text },
    }
  }

  // Savings log (explicit amount saved)
  if (/sav(ed|ings?)|put\s+aside|stashed/i.test(lower) && amount != null && !/where|how\s+can|find|hunt|cut|subscription/i.test(lower)) {
    return {
      intent: 'savings_log',
      confidence: 0.88,
      entities: { amount, habit: undefined, monthLabel: 'this month', raw: text },
    }
  }

  // Where can I save / hunt for savings
  if (
    /where\s+can\s+i\s+save|how\s+can\s+i\s+save|save\s+(?:this\s+)?week|savings?\s+tips?|find\s+(?:me\s+)?savings?|money\s+(?:leaks?|tips?)|hunt\s+for\s+savings?/i.test(lower)
  ) {
    return {
      intent: 'savings_hunt',
      confidence: 0.9,
      entities: { raw: text },
      route: '/savings',
    }
  }

  // Subscriptions
  if (/subscription|streaming|cancel\s+(?:netflix|hulu|disney)|unused\s+(?:sub|membership)/i.test(lower)) {
    return {
      intent: 'subscription_query',
      confidence: 0.88,
      entities: { raw: text },
      route: '/finance?tab=bills',
    }
  }

  // Buy / wait / skip
  if (
    /buy\s*\/?\s*wait\s*\/?\s*skip|should\s+i\s+(?:buy|wait|skip)|wait\s+on\s+|skip\s+(?:buying|this)|cheaper\s+(?:store|at)|coupon\s+stack/i.test(lower)
  ) {
    const itemMatch = text.match(/(?:buy|wait(?:\s+on)?|skip)\s+(?:the\s+)?([a-z][a-z\s-]{1,30})/i)
    return {
      intent: 'buy_wait_skip',
      confidence: 0.86,
      entities: { item: itemMatch?.[1]?.trim(), raw: text },
      route: '/savings?tab=overview',
    }
  }

  // Grocery spend
  if (
    (/grocer|bought\s+food|food\s+shop|shopping\s+(?:trip|run)/i.test(lower) || store)
    && amount != null
    && /bought|spent|paid|cost|for\s+\$/i.test(lower)
  ) {
    return {
      intent: 'grocery_spend',
      confidence: 0.86,
      entities: { amount, store, raw: text },
    }
  }

  if (/receipt|scan\s+(?:my\s+)?receipt|add\s+(?:to\s+)?pantry\s+from/i.test(lower)) {
    return {
      intent: 'receipt_offer',
      confidence: 0.8,
      entities: { store, amount, raw: text },
      route: '/scan?mode=receipt',
    }
  }

  if (
    /show\s+(?:haven\s+)?(?:my\s+)?(?:kitchen|pantry|fridge|refrigerator|freezer|spice)|help\s+haven\s+learn|learn\s+(?:my\s+)?(?:shelf|kitchen|pantry|fridge|freezer|spice)|room\s+tour|take\s+a\s+look\s+inside|introduce\s+(?:haven\s+)?to\s+(?:my\s+)?(?:kitchen|home)/i.test(
      lower,
    )
  ) {
    const room: ParsedEntities['room'] =
      /\bfridge|refrigerator\b/i.test(lower)
        ? 'fridge'
        : /\bfreezer\b/i.test(lower)
          ? 'freezer'
          : /\bspice/.test(lower)
            ? 'spice'
            : /\bpantry\b/i.test(lower)
              ? 'pantry'
              : undefined
    return {
      intent: 'room_tour',
      confidence: 0.88,
      entities: { room, raw: text },
      route: room ? `/scan?mode=tour&room=${room}` : '/scan?mode=tour',
    }
  }

  // What's coming
  if (/what'?s\s+coming|coming\s+up|this\s+week\s+(?:look|ahead)|on\s+my\s+(?:radar|plate)/i.test(lower)) {
    return {
      intent: 'whats_coming',
      confidence: 0.88,
      entities: { raw: text },
      route: '/today',
    }
  }

  // Bills / due
  if (/bill|due\s+this\s+week|what'?s\s+due|upcoming\s+bill|bills?\s+due/i.test(lower)) {
    return {
      intent: 'due_query',
      confidence: 0.85,
      entities: { raw: text },
      route: '/finance?tab=bills',
    }
  }

  if (/afford|can\s+i\s+buy|budget/i.test(lower)) {
    return {
      intent: 'afford_query',
      confidence: 0.75,
      entities: { amount, raw: text },
      route: '/finance',
    }
  }

  // Expiring food
  if (/expir|use\s+(?:up|soon)|going\s+bad|spoil|waste\s+food/i.test(lower)) {
    return {
      intent: 'expiring_query',
      confidence: 0.85,
      entities: { raw: text },
      route: '/kitchen',
    }
  }

  // Cook / recipe how-to (before generic dinner)
  const mealName = extractMealName(text)
  if (
    /how\s+(?:do\s+i|to)\s+(?:cook|make)|walk\s+me\s+through|recipe\s+for|step\s+by\s+step|guide\s+me\s+(?:through|cooking)/i.test(lower)
    || (mealName && /(?:cook|make|prepare)\s+/i.test(lower) && !/always\s+buy|don'?t\s+eat/i.test(lower))
  ) {
    return {
      intent: 'cook_query',
      confidence: 0.9,
      entities: { mealName, raw: text },
      route: '/kitchen',
    }
  }

  if (/dinner|what'?s\s+for\s+(?:dinner|supper|tonight)|meal\s+idea|cook\s+tonight|what\s+should\s+(?:i|we)\s+(?:eat|cook)/i.test(lower)) {
    return {
      intent: 'dinner_query',
      confidence: 0.85,
      entities: { raw: text },
      route: '/kitchen',
    }
  }

  if (/where\s+(?:are|is)|when\s+did\s+i\s+buy|batteries|toothpaste|mow/i.test(lower)) {
    return {
      intent: 'timeline_search',
      confidence: 0.7,
      entities: { item: text, raw: text },
      route: '/kitchen',
    }
  }

  if (/do\s+i\s+have|in\s+(?:the\s+)?pantry|taco\s+seasoning/i.test(lower)) {
    const q = text.replace(/do\s+i\s+have\s+/i, '').trim()
    return {
      intent: 'pantry_search',
      confidence: 0.75,
      entities: { item: q, raw: text },
      route: `/kitchen?search=${encodeURIComponent(q)}`,
    }
  }

  if (/bill/i.test(lower)) {
    return { intent: 'bill_query', confidence: 0.55, entities: { raw: text }, route: '/finance' }
  }

  // Ambiguous money vs kitchen — low confidence unknown so engine can clarify
  if (/help|what\s+should\s+i\s+do|advice/i.test(lower) && /money|food|life/i.test(lower)) {
    return { intent: 'unknown', confidence: 0.4, entities: { raw: text } }
  }

  return { intent: 'unknown', confidence: 0.3, entities: { raw: text, amount, store } }
}
