import { askHavenTimeline } from '../householdTimeline'
import {
  applyClarificationAnswer,
  buildClarification,
  type ClarificationState,
} from './clarificationFlow'
import {
  logGrocerySpend,
  logSavingsHabit,
  offerReceiptScan,
  offerRoomTour,
  saveBrandPreference,
  saveFoodExclusion,
} from './chatActions'
import { parseChatIntent, type IntentParseResult } from './intentParsers'
import { db } from '../../db/database'
import {
  advanceCookStep,
  completeCookAndMaybeRate,
  formatNoRecipeReply,
  formatRecipeMemoryReply,
  isCookAdvancePhrase,
  isCookStartPhrase,
  resolveRecipeMemory,
  startGuidedCook,
  suggestDinnerReply,
  suggestExpiringFoodReply,
  type CookingGuideState,
} from './cookingGuide'
import {
  buildBabyCareSecretPanel,
  formatBabyCareChatText,
  isBabyCareUnlocked,
  matchesBabyCareKeywords,
  matchesBabyCareReopen,
  unlockBabyCareSecret,
  type BabyCareSecretPanel,
} from './babyCareSecret'
import {
  addChristmasGift,
  buildChristmasSecretPanel,
  formatChristmasChatText,
  isChristmasUnlocked,
  loadChristmasGiftList,
  matchesChristmasKeywords,
  matchesChristmasReopen,
  parseAddGiftPhrase,
  unlockChristmasSecret,
  type ChristmasSecretPanel,
} from './christmasSecret'
import {
  buildBillsDueAdvice,
  buildBuyWaitSkipAdvice,
  buildSubscriptionAdvice,
  buildWeeklySavingsAdvice,
  buildWhatsComingAdvice,
} from './savingsAdvisor'

export interface ChatMessageLink {
  label: string
  route: string
}

export interface ChatCookStep {
  recipeName: string
  recipeId?: number
  stepIndex: number
  totalSteps: number
  stepText: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  createdAt: string
  route?: string
  pendingAction?: 'confirm_grocery' | 'confirm_receipt'
  links?: ChatMessageLink[]
  cookStep?: ChatCookStep
  /** Secret unlock panels (baby care / Christmas) — rendered as special cards */
  secretPanel?: BabyCareSecretPanel | ChristmasSecretPanel
}

export interface ChatTurnResult {
  messages: ChatMessage[]
  clarification?: ClarificationState | null
  navigateTo?: string
  cookingGuide?: CookingGuideState | null
}

export interface HavenChatSession {
  messages: ChatMessage[]
  clarification: ClarificationState | null
  pendingEntities: Record<string, string | number | undefined>
  /** Active guided cook session */
  cookingGuide: CookingGuideState | null
  /** Last resolved topic for turn context */
  lastTopic?: 'kitchen' | 'finance' | 'savings' | 'today' | 'general'
}

function msg(role: ChatMessage['role'], text: string, extra?: Partial<ChatMessage>): ChatMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    createdAt: new Date().toISOString(),
    ...extra,
  }
}

function fromAdvisor(
  advice: { text: string; links?: ChatMessageLink[] },
  route?: string,
): ChatTurnResult {
  const primary = advice.links?.[0]?.route ?? route
  return {
    messages: [
      msg('assistant', advice.text, {
        route: primary,
        links: advice.links,
      }),
    ],
  }
}

export function createChatSession(contextHint?: string): HavenChatSession {
  const greeting = contextHint
    ? `Hi — I'm Haven, your second brain for home life. ${contextHint}`
    : 'Hi — I\'m Haven, your second brain for home life. Ask me about dinner, how to cook something, bills due, subscriptions, or where you can save this week. I\'ll update your data after you confirm.'

  return {
    messages: [msg('assistant', greeting)],
    clarification: null,
    pendingEntities: {},
    cookingGuide: null,
    lastTopic: 'general',
  }
}

async function tryOptionalLlmEnhance(_input: string): Promise<string | null> {
  const key = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_OPENAI_API_KEY
    ?? (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_ANTHROPIC_API_KEY
  if (!key) return null
  return null
}

function applyCookReply(
  reply: Awaited<ReturnType<typeof startGuidedCook>>,
): ChatTurnResult {
  return {
    messages: [
      msg('assistant', reply.text, {
        route: reply.route ?? reply.links?.[0]?.route,
        links: reply.links,
        cookStep: reply.cookStep,
      }),
    ],
    cookingGuide: reply.guide ?? null,
    clarification: reply.clarificationKind
      ? buildClarification(reply.clarificationKind, 'cook_query', {})
      : null,
  }
}

async function executeReadyIntent(
  parsed: IntentParseResult,
  entities: Record<string, string | number | undefined>,
  session: HavenChatSession,
): Promise<ChatTurnResult & { lastTopic?: HavenChatSession['lastTopic'] }> {
  const intent = parsed.intent

  if (intent === 'baby_care_secret') {
    const raw = String(entities.raw ?? '')
    const isReopenOnly = matchesBabyCareReopen(raw) && !matchesBabyCareKeywords(raw)
    if (isReopenOnly && !(await isBabyCareUnlocked())) {
      return {
        messages: [
          msg(
            'assistant',
            'That secret menu isn’t unlocked yet. Mention diapers, wipes, formula, or baby care to open Baby Care Savings.',
          ),
        ],
      }
    }
    await unlockBabyCareSecret()
    const panel = buildBabyCareSecretPanel()
    return {
      messages: [
        msg('assistant', formatBabyCareChatText(panel), {
          route: '/savings',
          secretPanel: panel,
          links: [{ label: 'Smart Shopping', route: '/savings' }],
        }),
      ],
      lastTopic: 'savings',
    }
  }

  if (intent === 'christmas_secret') {
    const raw = String(entities.raw ?? '')
    const giftParse = parseAddGiftPhrase(raw)
    if (giftParse && (await isChristmasUnlocked())) {
      const list = await addChristmasGift(giftParse.name, giftParse.forWhom)
      const panel = buildChristmasSecretPanel(list)
      return {
        messages: [
          msg(
            'assistant',
            `Added “${giftParse.name}”${giftParse.forWhom ? ` for ${giftParse.forWhom}` : ''} to your Christmas gift list.`,
            { secretPanel: panel, links: [{ label: 'Open Finance', route: '/finance' }] },
          ),
        ],
        lastTopic: 'finance',
      }
    }
    const isReopenOnly = matchesChristmasReopen(raw) && !matchesChristmasKeywords(raw)
    if (isReopenOnly && !(await isChristmasUnlocked())) {
      return {
        messages: [
          msg(
            'assistant',
            'That secret menu isn’t unlocked yet. Mention Christmas, holiday shopping, wrapping paper, or Black Friday to open it.',
          ),
        ],
      }
    }
    await unlockChristmasSecret()
    const giftList = await loadChristmasGiftList()
    const panel = buildChristmasSecretPanel(giftList)
    return {
      messages: [
        msg('assistant', formatChristmasChatText(panel), {
          route: '/finance',
          secretPanel: panel,
          links: [
            { label: 'Open Finance', route: '/finance' },
            { label: 'Smart Shopping', route: '/savings' },
          ],
        }),
      ],
      lastTopic: 'finance',
    }
  }

  if (intent === 'savings_log' && typeof entities.amount === 'number') {
    if (!entities.habit) {
      const clar = buildClarification('savings_habit', intent, entities)
      return {
        messages: [msg('assistant', clar!.prompt)],
        clarification: clar,
        lastTopic: 'savings',
      }
    }
    const result = await logSavingsHabit(entities.amount, String(entities.habit))
    return {
      messages: [msg('assistant', result.message, { route: result.route })],
      lastTopic: 'savings',
    }
  }

  if (intent === 'grocery_spend' && typeof entities.amount === 'number') {
    const clar = buildClarification('grocery_confirm', intent, entities)
    return {
      messages: [msg('assistant', clar!.prompt)],
      clarification: clar,
      lastTopic: 'finance',
    }
  }

  if (intent === 'brand_preference') {
    if (!entities.brand) {
      const clar = buildClarification('brand_name', intent, entities)
      return { messages: [msg('assistant', clar!.prompt)], clarification: clar }
    }
    if (!entities.item) {
      const clar = buildClarification('brand_item', intent, entities)
      return { messages: [msg('assistant', clar!.prompt)], clarification: clar }
    }
    const result = await saveBrandPreference(String(entities.item), String(entities.brand))
    return { messages: [msg('assistant', result.message)] }
  }

  if (intent === 'food_exclusion') {
    if (!entities.food) {
      const clar = buildClarification('food_name', intent, entities)
      return { messages: [msg('assistant', clar!.prompt)], clarification: clar }
    }
    const result = await saveFoodExclusion(String(entities.food))
    return {
      messages: [msg('assistant', result.message, { route: result.route })],
      lastTopic: 'kitchen',
    }
  }

  if (intent === 'receipt_offer') {
    const result = offerReceiptScan()
    return {
      messages: [msg('assistant', result.message, { route: result.route, pendingAction: 'confirm_receipt' })],
      navigateTo: result.route,
    }
  }

  if (intent === 'room_tour') {
    const room = entities.room as 'fridge' | 'freezer' | 'pantry' | 'spice' | undefined
    const result = offerRoomTour(room)
    return {
      messages: [msg('assistant', result.message, { route: result.route })],
      navigateTo: result.route,
      lastTopic: 'kitchen',
    }
  }

  if (intent === 'cook_query') {
    const { memory, alternatives, query } = await resolveRecipeMemory(String(entities.raw ?? entities.mealName ?? ''))
    if (!memory) {
      const reply = formatNoRecipeReply(query, alternatives)
      return { ...applyCookReply(reply), lastTopic: 'kitchen' }
    }
    const reply = formatRecipeMemoryReply(memory, alternatives)
    return { ...applyCookReply(reply), lastTopic: 'kitchen' }
  }

  if (intent === 'dinner_query') {
    const reply = await suggestDinnerReply()
    return {
      messages: [msg('assistant', reply.text, { route: reply.route, links: reply.links })],
      lastTopic: 'kitchen',
    }
  }

  if (intent === 'expiring_query') {
    const reply = await suggestExpiringFoodReply()
    return {
      messages: [msg('assistant', reply.text, { route: reply.route, links: reply.links })],
      lastTopic: 'kitchen',
    }
  }

  if (intent === 'savings_hunt') {
    const advice = await buildWeeklySavingsAdvice()
    return { ...fromAdvisor(advice, '/savings'), lastTopic: 'savings' }
  }

  if (intent === 'subscription_query') {
    const advice = await buildSubscriptionAdvice()
    return { ...fromAdvisor(advice, '/finance?tab=bills'), lastTopic: 'finance' }
  }

  if (intent === 'buy_wait_skip') {
    const advice = await buildBuyWaitSkipAdvice(
      entities.item != null ? String(entities.item) : undefined,
    )
    return { ...fromAdvisor(advice, '/savings'), lastTopic: 'savings' }
  }

  if (intent === 'due_query' || intent === 'bill_query') {
    const advice = await buildBillsDueAdvice()
    return { ...fromAdvisor(advice, '/finance?tab=bills'), lastTopic: 'finance' }
  }

  if (intent === 'whats_coming') {
    const advice = await buildWhatsComingAdvice()
    return { ...fromAdvisor(advice, '/today'), lastTopic: 'today' }
  }

  if (intent === 'afford_query') {
    return {
      messages: [
        msg(
          'assistant',
          'Let\'s check Finance for what you can afford right now — bills and available funds live there. I can also hunt for savings if money feels tight.',
          {
            route: '/finance',
            links: [
              { label: 'Open Finance', route: '/finance' },
              { label: 'Where can I save?', route: '/savings' },
            ],
          },
        ),
      ],
      navigateTo: '/finance',
      lastTopic: 'finance',
    }
  }

  if (intent === 'pantry_search') {
    const q = String(entities.item ?? entities.raw ?? '')
    return {
      messages: [
        msg('assistant', `I'll look for ${q || 'that'} in your pantry / Kitchen.`, {
          route: parsed.route ?? '/kitchen',
          links: [{ label: 'Open Kitchen', route: parsed.route ?? '/kitchen' }],
        }),
      ],
      navigateTo: parsed.route ?? '/kitchen',
      lastTopic: 'kitchen',
    }
  }

  if (intent === 'timeline_search') {
    const result = await askHavenTimeline(String(entities.raw ?? entities.item ?? ''))
    return {
      messages: [msg('assistant', result.answer, { route: '/kitchen' })],
      lastTopic: 'kitchen',
    }
  }

  if (intent === 'cook_next' && session.cookingGuide) {
    return { ...applyCookReply(advanceCookStep(session.cookingGuide)), lastTopic: 'kitchen' }
  }

  // Ambiguous — use last topic or ask
  if (intent === 'unknown' && parsed.confidence < 0.5) {
    if (session.lastTopic === 'kitchen' && /that|it|tonight|again/i.test(String(entities.raw ?? ''))) {
      const reply = await suggestDinnerReply()
      return {
        messages: [msg('assistant', reply.text, { route: reply.route, links: reply.links })],
        lastTopic: 'kitchen',
      }
    }
    if (session.lastTopic === 'savings' && /more|else|another/i.test(String(entities.raw ?? ''))) {
      const advice = await buildWeeklySavingsAdvice()
      return { ...fromAdvisor(advice, '/savings'), lastTopic: 'savings' }
    }

    // On-site beta data fallback — if it's on Haven, answer from Haven
    const onSite = await answerFromHavenSiteData(String(entities.raw ?? ''))
    if (onSite) return onSite

    const clar = buildClarification('topic_ambiguous', 'unknown', entities)
    return {
      messages: [msg('assistant', clar!.prompt)],
      clarification: clar,
    }
  }

  const llm = await tryOptionalLlmEnhance(String(entities.raw ?? ''))
  if (llm) {
    return { messages: [msg('assistant', llm)] }
  }

  const onSiteLate = await answerFromHavenSiteData(String(entities.raw ?? ''))
  if (onSiteLate) return onSiteLate

  try {
    const result = await askHavenTimeline(String(entities.raw ?? ''))
    if (result.answer && !/no (?:history|matches|results)/i.test(result.answer)) {
      return { messages: [msg('assistant', result.answer)] }
    }
  } catch {
    /* ignore */
  }

  return {
    messages: [
      msg(
        'assistant',
        'I can help with dinners and step-by-step cooking, bills due, subscriptions to cut, buy/wait/skip groceries, and where you could save this week. Try: “What’s for dinner?”, “How do I cook tacos?”, or “Where can I save this week?”',
      ),
    ],
  }
}

/** Prefer answering from open beta modules (bills, grocery, dinner) over generic LLM. */
async function answerFromHavenSiteData(
  raw: string,
): Promise<(ChatTurnResult & { lastTopic?: HavenChatSession['lastTopic'] }) | null> {
  const lower = raw.toLowerCase()
  if (!lower.trim()) return null

  if (
    /bill|due|owe|payment|electric|rent|mortgage|utility|utilities|finance/i.test(lower)
  ) {
    const advice = await buildBillsDueAdvice()
    return { ...fromAdvisor(advice, '/finance?tab=bills'), lastTopic: 'finance' }
  }

  if (
    /grocer|shopping\s+list|what(?:'s| is)\s+on\s+(?:my\s+)?list|store\s+run|food\s+shop/i.test(lower)
  ) {
    const advice = await buildWeeklySavingsAdvice()
    return {
      messages: [
        msg(
          'assistant',
          `${advice.text}\n\nFor your list and deals, Smart Shopping is the place — Haven already tracks groceries on-site.`,
          { route: '/savings', links: advice.links ?? [{ label: 'Smart Shopping', route: '/savings' }] },
        ),
      ],
      lastTopic: 'savings',
    }
  }

  if (
    /dinner|supper|tonight|meal|cook|eat|recipe|kitchen|pantry|expir/i.test(lower)
  ) {
    if (/expir|spoil|going\s+bad|use\s+up/i.test(lower)) {
      const reply = await suggestExpiringFoodReply()
      return {
        messages: [msg('assistant', reply.text, { route: reply.route, links: reply.links })],
        lastTopic: 'kitchen',
      }
    }
    const reply = await suggestDinnerReply()
    return {
      messages: [msg('assistant', reply.text, { route: reply.route, links: reply.links })],
      lastTopic: 'kitchen',
    }
  }

  if (/sav(e|ings?)|coupon|deal|discount|cheaper|money/i.test(lower)) {
    const advice = await buildWeeklySavingsAdvice()
    return { ...fromAdvisor(advice, '/savings'), lastTopic: 'savings' }
  }

  return null
}

export async function processChatTurn(
  session: HavenChatSession,
  userText: string,
): Promise<{ session: HavenChatSession; navigateTo?: string }> {
  const trimmed = userText.trim()
  if (!trimmed) return { session }

  const userMsg = msg('user', trimmed)
  let clarification = session.clarification
  let pendingEntities = { ...session.pendingEntities }
  let cookingGuide = session.cookingGuide
  let lastTopic = session.lastTopic
  const outMessages: ChatMessage[] = [...session.messages, userMsg]
  let navigateTo: string | undefined

  // Active guided cook — next / yes to start / rating
  if (cookingGuide?.awaitingWalkthroughConfirm && isCookStartPhrase(trimmed)) {
    const reply = startGuidedCook(cookingGuide)
    const turn = applyCookReply(reply)
    outMessages.push(...turn.messages)
    cookingGuide = turn.cookingGuide ?? null
    clarification = turn.clarification ?? null
    lastTopic = 'kitchen'
    const next = { messages: outMessages, clarification, pendingEntities, cookingGuide, lastTopic }
    await persistMessages([userMsg, ...turn.messages])
    return { session: next }
  }

  if (cookingGuide && !cookingGuide.awaitingWalkthroughConfirm && !cookingGuide.awaitingRating) {
    if (isCookAdvancePhrase(trimmed) || /^(next|done|finish)$/i.test(trimmed)) {
      const reply = /^(done|finish)$/i.test(trimmed)
        ? await import('./cookingGuide').then(m => m.finishCookSteps(cookingGuide!))
        : advanceCookStep(cookingGuide)
      const turn = applyCookReply(reply)
      outMessages.push(...turn.messages)
      cookingGuide = turn.cookingGuide ?? null
      clarification = turn.clarification ?? null
      lastTopic = 'kitchen'
      const next = { messages: outMessages, clarification, pendingEntities, cookingGuide, lastTopic }
      await persistMessages([userMsg, ...turn.messages])
      return { session: next }
    }
  }

  if (cookingGuide?.awaitingRating || clarification?.kind === 'cook_rate') {
    const guide = cookingGuide ?? {
      recipeName: String(pendingEntities.mealName ?? 'meal'),
      directions: [],
      stepIndex: 0,
      ingredientsUsed: [],
      awaitingRating: true,
    }
    const reply = await completeCookAndMaybeRate(guide, trimmed)
    const turn = applyCookReply(reply)
    outMessages.push(...turn.messages)
    cookingGuide = turn.cookingGuide ?? null
    clarification = null
    pendingEntities = {}
    lastTopic = 'kitchen'
    const next = { messages: outMessages, clarification, pendingEntities, cookingGuide, lastTopic }
    await persistMessages([userMsg, ...turn.messages])
    return { session: next }
  }

  // Mid-clarification
  if (clarification) {
    const applied = applyClarificationAnswer(clarification, trimmed)
    if (applied.cancelled) {
      if (clarification.kind === 'cook_walkthrough' || cookingGuide?.awaitingWalkthroughConfirm) {
        cookingGuide = null
      }
      clarification = null
      pendingEntities = {}
      outMessages.push(msg('assistant', 'Okay — cancelled. What else can I help with?'))
      const next = { messages: outMessages, clarification: null, pendingEntities, cookingGuide, lastTopic }
      await persistMessages([userMsg, outMessages[outMessages.length - 1]])
      return { session: next }
    }

    pendingEntities = { ...pendingEntities, ...applied.entities }

    if (clarification.kind === 'cook_walkthrough' && applied.ready && cookingGuide) {
      const reply = startGuidedCook(cookingGuide)
      const turn = applyCookReply(reply)
      outMessages.push(...turn.messages)
      cookingGuide = turn.cookingGuide ?? null
      clarification = null
      lastTopic = 'kitchen'
      const next = { messages: outMessages, clarification, pendingEntities: {}, cookingGuide, lastTopic }
      await persistMessages([userMsg, ...turn.messages])
      return { session: next }
    }

    if (clarification.kind === 'cook_walkthrough' && !applied.ready && !applied.cancelled) {
      outMessages.push(msg('assistant', 'No worries — the recipe stays in Kitchen whenever you want it. Anything else?'))
      cookingGuide = null
      clarification = null
      const next = { messages: outMessages, clarification, pendingEntities: {}, cookingGuide, lastTopic: 'kitchen' as const }
      await persistMessages([userMsg, outMessages[outMessages.length - 1]])
      return { session: next }
    }

    if (clarification.kind === 'topic_ambiguous') {
      if (!applied.ready) {
        outMessages.push(msg('assistant', clarification.prompt))
        const next = { messages: outMessages, clarification, pendingEntities, cookingGuide, lastTopic }
        await persistMessages([userMsg, outMessages[outMessages.length - 1]])
        return { session: next }
      }
      clarification = null
      const hint = applied.topicHint
      if (hint === 'kitchen') {
        const reply = await suggestDinnerReply()
        outMessages.push(msg('assistant', reply.text, { route: reply.route, links: reply.links }))
        lastTopic = 'kitchen'
      } else if (hint === 'finance') {
        const advice = await buildBillsDueAdvice()
        outMessages.push(msg('assistant', advice.text, { route: '/finance', links: advice.links }))
        lastTopic = 'finance'
      } else {
        const advice = await buildWeeklySavingsAdvice()
        outMessages.push(msg('assistant', advice.text, { route: '/savings', links: advice.links }))
        lastTopic = 'savings'
      }
      const next = { messages: outMessages, clarification, pendingEntities: {}, cookingGuide, lastTopic }
      await persistMessages([userMsg, outMessages[outMessages.length - 1]])
      return { session: next }
    }

    if (clarification.kind === 'grocery_confirm' && applied.ready) {
      const amount = Number(pendingEntities.amount)
      const store = pendingEntities.store ? String(pendingEntities.store) : undefined
      const result = await logGrocerySpend(amount, store)
      outMessages.push(msg('assistant', result.message, { route: result.route, pendingAction: 'confirm_receipt' }))
      clarification = null
      pendingEntities = {}
      const next = { messages: outMessages, clarification, pendingEntities, cookingGuide, lastTopic: 'finance' as const }
      await persistMessages([userMsg, outMessages[outMessages.length - 1]])
      return { session: next }
    }

    if (clarification.kind === 'receipt_confirm' && applied.ready) {
      outMessages.push(msg('assistant', offerReceiptScan().message, { route: '/scan?mode=receipt' }))
      clarification = null
      pendingEntities = {}
      const next = { messages: outMessages, clarification, pendingEntities, cookingGuide, lastTopic }
      await persistMessages([userMsg, outMessages[outMessages.length - 1]])
      return { session: next, navigateTo: '/scan?mode=receipt' }
    }

    if (!applied.ready) {
      if (clarification.kind === 'brand_name' && applied.entities.brand && !applied.entities.item) {
        clarification = buildClarification('brand_item', clarification.pendingIntent, applied.entities)
        outMessages.push(msg('assistant', clarification!.prompt))
      } else if (clarification.kind === 'brand_item' && applied.entities.item && !applied.entities.brand) {
        clarification = buildClarification('brand_name', clarification.pendingIntent, applied.entities)
        outMessages.push(msg('assistant', clarification!.prompt))
      } else if (clarification.kind === 'grocery_confirm' || clarification.kind === 'receipt_confirm') {
        outMessages.push(msg('assistant', 'No problem — nothing was saved. Anything else?'))
        clarification = null
        pendingEntities = {}
      } else {
        outMessages.push(msg('assistant', clarification.prompt))
      }
      const next = { messages: outMessages, clarification, pendingEntities, cookingGuide, lastTopic }
      await persistMessages([userMsg, outMessages[outMessages.length - 1]])
      return { session: next }
    }

    // Ready — re-run with pending intent
    const fakeParsed: IntentParseResult = {
      intent: clarification.pendingIntent as IntentParseResult['intent'],
      confidence: 0.9,
      entities: {
        amount: typeof pendingEntities.amount === 'number' ? pendingEntities.amount : undefined,
        store: pendingEntities.store != null ? String(pendingEntities.store) : undefined,
        brand: pendingEntities.brand != null ? String(pendingEntities.brand) : undefined,
        item: pendingEntities.item != null ? String(pendingEntities.item) : undefined,
        food: pendingEntities.food != null ? String(pendingEntities.food) : undefined,
        habit: pendingEntities.habit != null ? String(pendingEntities.habit) : undefined,
        mealName: pendingEntities.mealName != null ? String(pendingEntities.mealName) : undefined,
        raw: trimmed,
      },
    }
    const turn = await executeReadyIntent(fakeParsed, pendingEntities, {
      ...session,
      cookingGuide,
      lastTopic,
    })
    outMessages.push(...turn.messages)
    clarification = turn.clarification ?? null
    if (turn.cookingGuide !== undefined) cookingGuide = turn.cookingGuide
    if (turn.lastTopic) lastTopic = turn.lastTopic
    if (!turn.clarification) pendingEntities = {}
    else pendingEntities = { ...pendingEntities, ...turn.clarification.entities }
    navigateTo = turn.navigateTo
    const next = { messages: outMessages, clarification, pendingEntities, cookingGuide, lastTopic }
    await persistMessages([userMsg, ...turn.messages])
    return { session: next, navigateTo }
  }

  const parsed = parseChatIntent(trimmed)
  const entities = {
    ...parsed.entities,
    amount: parsed.entities.amount,
    store: parsed.entities.store,
    brand: parsed.entities.brand,
    item: parsed.entities.item,
    food: parsed.entities.food,
    habit: parsed.entities.habit,
    mealName: parsed.entities.mealName,
    raw: trimmed,
  }

  const turn = await executeReadyIntent(parsed, entities, {
    ...session,
    cookingGuide,
    lastTopic,
  })
  outMessages.push(...turn.messages)
  clarification = turn.clarification ?? null
  if (turn.cookingGuide !== undefined) cookingGuide = turn.cookingGuide
  if (turn.lastTopic) lastTopic = turn.lastTopic
  pendingEntities = clarification ? { ...entities, ...clarification.entities } : {}
  navigateTo = turn.navigateTo

  const next = { messages: outMessages, clarification, pendingEntities, cookingGuide, lastTopic }
  await persistMessages([userMsg, ...turn.messages])
  return { session: next, navigateTo }
}

async function persistMessages(messages: ChatMessage[]): Promise<void> {
  try {
    for (const m of messages) {
      await db.chatMessages.add({
        role: m.role,
        text: m.text,
        createdAt: m.createdAt,
        route: m.route,
      })
    }
  } catch {
    /* table may not exist yet during HMR — ignore */
  }
}

export async function loadRecentChatMessages(limit = 40): Promise<ChatMessage[]> {
  try {
    const rows = await db.chatMessages.orderBy('createdAt').reverse().limit(limit).toArray()
    return rows.reverse().map(r => ({
      id: String(r.id ?? `${r.createdAt}`),
      role: r.role,
      text: r.text,
      createdAt: r.createdAt,
      route: r.route,
    }))
  } catch {
    return []
  }
}
