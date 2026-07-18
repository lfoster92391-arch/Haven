import type { CloudFeedbackRow } from './feedback'

export type InsightThemeKind = 'love' | 'wish' | 'bug' | 'confused'

export interface InsightTheme {
  id: string
  label: string
  kind: InsightThemeKind
  count: number
  examples: string[]
}

export interface InsightPriority {
  rank: number
  title: string
  why: string
  signals: number
}

export type InsightAudience = 'member' | 'community'

export interface HelpHavenInsightReport {
  generatedAt: string
  mode: 'local-intelligence' | 'llm-enhanced'
  audience: InsightAudience
  headline: string
  responseCount: number
  sentiment: {
    label: 'warm' | 'mixed' | 'needs-care'
    averageRating: number | null
    recommendYesPct: number | null
    summary: string
  }
  themes: InsightTheme[]
  duplicates: { theme: string; count: number; note: string }[]
  priorities: InsightPriority[]
  bugs: { text: string; who: string; when: string }[]
  praise: { text: string; who: string }[]
  /** Calm briefing the member (or community steward) can skim in one breath */
  narrative: string
  llmNote?: string
}

const THEME_RULES: { id: string; label: string; kind: InsightThemeKind; match: RegExp }[] = [
  { id: 'meals', label: 'Meals & cooking', kind: 'wish', match: /\b(meal|cook|recipe|dinner|kitchen|tonight)\b/i },
  { id: 'money', label: 'Money & bills', kind: 'wish', match: /\b(money|bill|budget|finance|spend|due)\b/i },
  { id: 'savings', label: 'Savings & shopping', kind: 'wish', match: /\b(sav(e|ings)|shop|coupon|deal|grocery|list)\b/i },
  { id: 'pantry', label: 'Pantry & shelves', kind: 'wish', match: /\b(pantry|fridge|freezer|spice|shelf|inventory)\b/i },
  { id: 'eyes', label: 'Haven’s eyes / camera', kind: 'wish', match: /\b(scan|camera|barcode|receipt|vision)\b/i },
  { id: 'sync', label: 'Sync & sign-in', kind: 'wish', match: /\b(sync|sign[- ]?in|login|account|device)\b/i },
  { id: 'packages', label: 'Packages & home', kind: 'wish', match: /\b(package|deliver|mail|home care|laundry)\b/i },
  { id: 'calm', label: 'Calm / relief feeling', kind: 'love', match: /\b(calm|peace|relief|love|helpful|warm|easy|gentle)\b/i },
  { id: 'confused', label: 'Confusing moments', kind: 'confused', match: /\b(confus|unclear|lost|where|find|hard to)\b/i },
  { id: 'broken', label: 'Something felt off', kind: 'bug', match: /\b(broken|bug|crash|error|stuck|fail|doesn'?t work|not work)\b/i },
]

const BUILD_NEXT_LABELS: Record<string, string> = {
  shopping: 'Shopping',
  meals: 'Meals',
  money: 'Money',
  sync: 'Sync',
  packages: 'Packages',
  other: 'Something else',
}

function whoLabel(row: CloudFeedbackRow, audience: InsightAudience): string {
  if (audience === 'member') return 'You'
  if (row.is_guest || !row.email) return 'Founding Member (guest)'
  return row.email
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

function collectTexts(row: CloudFeedbackRow): string[] {
  return [row.working_well, row.confusing_broken, row.build_next_note, row.build_next]
    .filter((t): t is string => Boolean(t && t.trim()))
    .map(t => t.trim())
}

function detectIntentTheme(row: CloudFeedbackRow): InsightTheme | null {
  const blob = collectTexts(row).join(' ')
  const m = blob.match(/\[(love|idea|bug|confused|wish|voice)\]/i)
  if (!m) return null
  const intent = m[1].toLowerCase()
  const labels: Record<string, { label: string; kind: InsightThemeKind }> = {
    love: { label: 'Love notes', kind: 'love' },
    idea: { label: 'Ideas', kind: 'wish' },
    bug: { label: 'Something isn’t working', kind: 'bug' },
    confused: { label: 'Confused moments', kind: 'confused' },
    wish: { label: 'Wishes', kind: 'wish' },
    voice: { label: 'Voice notes to Haven', kind: 'wish' },
  }
  const meta = labels[intent]
  if (!meta) return null
  return {
    id: `intent-${intent}`,
    label: meta.label,
    kind: meta.kind,
    count: 1,
    examples: collectTexts(row).slice(0, 1),
  }
}

function scoreSentiment(
  rows: CloudFeedbackRow[],
  audience: InsightAudience,
): HelpHavenInsightReport['sentiment'] {
  if (rows.length === 0) {
    return {
      label: 'mixed',
      averageRating: null,
      recommendYesPct: null,
      summary:
        audience === 'member'
          ? 'When you share how a page feels, I’ll gather your insight here — just for you.'
          : 'Haven is still waiting for the first Founders to share how they feel.',
    }
  }
  const avg = rows.reduce((s, r) => s + (r.rating || 0), 0) / rows.length
  const yes = rows.filter(r => r.recommend === 'yes').length
  const yesPct = Math.round((yes / rows.length) * 100)
  let label: 'warm' | 'mixed' | 'needs-care' = 'mixed'
  if (avg >= 4.2 && yesPct >= 60) label = 'warm'
  else if (avg < 3.4 || yesPct < 35) label = 'needs-care'

  const summary =
    audience === 'member'
      ? label === 'warm'
        ? `Your notes feel warm — about ${avg.toFixed(1)}★ on average. Thank you for teaching Haven so kindly.`
        : label === 'needs-care'
          ? `Some of your notes ask for a softer path — ${avg.toFixed(1)}★ on average. I’m listening.`
          : `You’re giving Haven a clear reading — about ${avg.toFixed(1)}★ across what you’ve shared.`
      : label === 'warm'
        ? `Founders feel cared for — ${avg.toFixed(1)}★ on average, and ${yesPct}% would recommend Haven.`
        : label === 'needs-care'
          ? `Some Founders need more reassurance — ${avg.toFixed(1)}★ average. Listen closely to what’s confusing.`
          : `Sentiment is mixed but useful — ${avg.toFixed(1)}★ average, ${yesPct}% would recommend Haven so far.`

  return { label, averageRating: Math.round(avg * 10) / 10, recommendYesPct: yesPct, summary }
}

function buildThemes(rows: CloudFeedbackRow[]): InsightTheme[] {
  const map = new Map<string, InsightTheme>()

  for (const row of rows) {
    const intentTheme = detectIntentTheme(row)
    if (intentTheme) {
      const existing = map.get(intentTheme.id)
      if (existing) {
        existing.count += 1
        for (const ex of intentTheme.examples) {
          if (existing.examples.length < 3 && !existing.examples.includes(ex)) {
            existing.examples.push(ex)
          }
        }
      } else {
        map.set(intentTheme.id, intentTheme)
      }
    }

    const texts = collectTexts(row)
    if (row.build_next && BUILD_NEXT_LABELS[row.build_next]) {
      const id = `next-${row.build_next}`
      const existing = map.get(id)
      const example = row.build_next_note?.trim() || BUILD_NEXT_LABELS[row.build_next]
      if (existing) {
        existing.count += 1
        if (example && existing.examples.length < 3 && !existing.examples.includes(example)) {
          existing.examples.push(example)
        }
      } else {
        map.set(id, {
          id,
          label: `Learn next: ${BUILD_NEXT_LABELS[row.build_next]}`,
          kind: 'wish',
          count: 1,
          examples: example ? [example] : [],
        })
      }
    }

    for (const text of texts) {
      for (const rule of THEME_RULES) {
        if (!rule.match.test(text)) continue
        const existing = map.get(rule.id)
        if (existing) {
          existing.count += 1
          if (existing.examples.length < 3 && !existing.examples.includes(text)) {
            existing.examples.push(text)
          }
        } else {
          map.set(rule.id, {
            id: rule.id,
            label: rule.label,
            kind: row.confusing_broken && rule.kind === 'wish' ? 'confused' : rule.kind,
            count: 1,
            examples: [text],
          })
        }
      }
    }

    if (row.confusing_broken?.trim() && !THEME_RULES.some(r => r.match.test(row.confusing_broken!))) {
      const id = 'general-confused'
      const existing = map.get(id)
      const text = row.confusing_broken.trim()
      if (existing) {
        existing.count += 1
        if (existing.examples.length < 3) existing.examples.push(text)
      } else {
        map.set(id, {
          id,
          label: 'Needs a gentler path',
          kind: 'confused',
          count: 1,
          examples: [text],
        })
      }
    }
  }

  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 8)
}

function buildDuplicates(
  themes: InsightTheme[],
  audience: InsightAudience,
): HelpHavenInsightReport['duplicates'] {
  return themes
    .filter(t => t.count >= 2)
    .slice(0, 5)
    .map(t => ({
      theme: t.label,
      count: t.count,
      note:
        audience === 'member'
          ? t.count >= 3
            ? `You’ve returned to this ${t.count} times — I’m listening.`
            : `You’ve mentioned this more than once.`
          : t.count >= 4
            ? `${t.count} Founders circled the same idea — strong signal.`
            : `${t.count} mentions point the same direction.`,
    }))
}

function buildPriorities(
  themes: InsightTheme[],
  rows: CloudFeedbackRow[],
  audience: InsightAudience,
): InsightPriority[] {
  const fromThemes = themes
    .filter(t => t.kind === 'wish' || t.kind === 'bug' || t.kind === 'confused')
    .slice(0, 5)
    .map((t, i) => ({
      rank: i + 1,
      title: t.label.replace(/^Learn next:\s*/i, ''),
      why:
        audience === 'member'
          ? t.kind === 'bug'
            ? 'You noticed something felt off — I’ll keep that close.'
            : t.kind === 'confused'
              ? 'You got a little lost here — clarity reduces mental load.'
              : 'You asked Haven to grow here next.'
          : t.kind === 'bug'
            ? 'Something felt off more than once — worth a calm fix.'
            : t.kind === 'confused'
              ? 'Founders got lost here — clarity reduces mental load.'
              : 'Founders asked Haven to grow here next.',
      signals: t.count,
    }))

  if (fromThemes.length > 0) return fromThemes

  const buildVotes = new Map<string, number>()
  for (const row of rows) {
    if (!row.build_next) continue
    buildVotes.set(row.build_next, (buildVotes.get(row.build_next) ?? 0) + 1)
  }
  return [...buildVotes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, count], i) => ({
      rank: i + 1,
      title: BUILD_NEXT_LABELS[id] ?? id,
      why:
        audience === 'member'
          ? 'From what you’ve asked Haven to learn next.'
          : 'Top “learn next” vote from Help Haven Learn.',
      signals: count,
    }))
}

function buildBugs(rows: CloudFeedbackRow[], audience: InsightAudience): HelpHavenInsightReport['bugs'] {
  return rows
    .filter(r => r.confusing_broken?.trim())
    .slice(0, 8)
    .map(r => ({
      text: r.confusing_broken!.trim().replace(/^\[(love|idea|bug|confused|wish|voice)\]\s*/i, ''),
      who: whoLabel(r, audience),
      when: formatWhen(r.created_at),
    }))
}

function buildPraise(rows: CloudFeedbackRow[], audience: InsightAudience): HelpHavenInsightReport['praise'] {
  return rows
    .filter(r => r.working_well?.trim() && r.rating >= 4)
    .slice(0, 6)
    .map(r => ({
      text: r.working_well!.trim().replace(/^\[(love|idea|bug|confused|wish|voice)\]\s*/i, ''),
      who: whoLabel(r, audience),
    }))
}

function buildNarrative(
  report: Omit<HelpHavenInsightReport, 'narrative' | 'llmNote'>,
): string {
  const member = report.audience === 'member'
  if (report.responseCount === 0) {
    return member
      ? 'You haven’t shared a Help Haven Learn note yet. When you tap the leaf, your insight gathers here — calmly, just for you.'
      : 'No Help Haven Learn notes yet. When Founders tap the leaf, their feelings will gather here — calmly.'
  }

  const top = report.priorities[0]
  const love = report.themes.find(t => t.kind === 'love')
  const parts = [
    report.sentiment.summary,
    top
      ? member
        ? `From what you’ve shared, the clearest next step looks like ${top.title.toLowerCase()}.`
        : `If I were gently steering the next slice, I’d start with ${top.title.toLowerCase()} (${top.signals} signal${top.signals === 1 ? '' : 's'}).`
      : member
        ? 'There isn’t one loud theme yet — every note still teaches me.'
        : 'There isn’t a loud priority yet — keep listening.',
    love
      ? member
        ? `Something that’s already landing for you: ${love.examples[0] ?? love.label}.`
        : `What’s already landing: ${love.examples[0] ?? love.label}.`
      : report.praise[0]
        ? member
          ? `You said: “${report.praise[0].text}”`
          : `A Founder said: “${report.praise[0].text}”`
        : member
          ? 'Keep sharing how pages feel — stars teach Haven too.'
          : 'Praise is still light — every star still teaches Haven.',
    report.bugs.length > 0
      ? member
        ? `You also named ${report.bugs.length === 1 ? 'a moment' : 'moments'} of friction — I’ll remember those.`
        : `${report.bugs.length} note${report.bugs.length === 1 ? '' : 's'} mention confusion or friction — skim those first.`
      : member
        ? 'No sharp friction in what you’ve shared lately.'
        : 'No sharp friction notes in this batch.',
  ]
  return parts.join(' ')
}

function buildHeadline(
  sentiment: HelpHavenInsightReport['sentiment'],
  count: number,
  audience: InsightAudience,
): string {
  if (audience === 'member') {
    if (count === 0) return 'Your insight will live here'
    if (sentiment.label === 'warm') return 'You’re teaching Haven with care'
    if (sentiment.label === 'needs-care') return 'You’re asking for a softer path'
    return 'Here’s what you’ve taught Haven'
  }
  if (count === 0) return 'Still getting to know your Founders'
  if (sentiment.label === 'warm') return 'Founders are teaching Haven with care'
  if (sentiment.label === 'needs-care') return 'A few Founders need a softer path'
  return 'Clear signals from Help Haven Learn'
}

/**
 * Local “AI” summarization — clusters, sentiment, and priorities without a network call.
 * `member` = the Founding Member’s own notes; `community` = steward/admin aggregate.
 */
export function summarizeHelpHavenLearn(
  rows: CloudFeedbackRow[],
  audience: InsightAudience = 'member',
): HelpHavenInsightReport {
  const sentiment = scoreSentiment(rows, audience)
  const themes = buildThemes(rows)
  const duplicates = buildDuplicates(themes, audience)
  const priorities = buildPriorities(themes, rows, audience)
  const bugs = buildBugs(rows, audience)
  const praise = buildPraise(rows, audience)
  const base = {
    generatedAt: new Date().toISOString(),
    mode: 'local-intelligence' as const,
    audience,
    headline: buildHeadline(sentiment, rows.length, audience),
    responseCount: rows.length,
    sentiment,
    themes,
    duplicates,
    priorities,
    bugs,
    praise,
  }
  return {
    ...base,
    narrative: buildNarrative(base),
  }
}

/**
 * Optional OpenAI polish when VITE_OPENAI_API_KEY is set. Falls back silently.
 */
export async function enhanceInsightNarrative(
  report: HelpHavenInsightReport,
  rows: CloudFeedbackRow[],
): Promise<HelpHavenInsightReport> {
  const key = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined)?.trim()
  if (!key || rows.length === 0) return report

  const digest = rows.slice(0, 40).map(r => ({
    rating: r.rating,
    recommend: r.recommend,
    working: r.working_well,
    confusing: r.confusing_broken,
    next: r.build_next,
    note: r.build_next_note,
  }))

  const forMember = report.audience === 'member'
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        max_tokens: 320,
        messages: [
          {
            role: 'system',
            content: forMember
              ? 'You are Haven, a calm household assistant speaking to one Founding Member about their own Help Haven Learn notes. Use second person (“you”). 3–5 short warm paragraphs. No bullet lists. No corporate tone. Never invent quotes. Never mention Lisa or an admin.'
              : 'You summarize Help Haven Learn community notes for a product steward. 3–5 short warm paragraphs. No bullet lists. No corporate tone. Mention themes, friction, and one recommended next priority. Never invent quotes.',
          },
          {
            role: 'user',
            content: `Local summary:\n${report.narrative}\n\nTop priorities: ${report.priorities.map(p => p.title).join(', ') || 'none'}\n\nRaw digest JSON:\n${JSON.stringify(digest)}`,
          },
        ],
      }),
    })
    if (!res.ok) {
      return {
        ...report,
        llmNote: 'Cloud polish unavailable — showing Haven’s local reading instead.',
      }
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const text = data.choices?.[0]?.message?.content?.trim()
    if (!text) return report
    return {
      ...report,
      mode: 'llm-enhanced',
      narrative: text,
      llmNote: 'Polished with your OpenAI key.',
    }
  } catch {
    return {
      ...report,
      llmNote: 'Cloud polish skipped — local reading is ready.',
    }
  }
}

export async function buildHelpHavenInsightReport(
  rows: CloudFeedbackRow[],
  opts?: { enhance?: boolean; audience?: InsightAudience },
): Promise<HelpHavenInsightReport> {
  const audience = opts?.audience ?? 'member'
  const local = summarizeHelpHavenLearn(rows, audience)
  if (opts?.enhance === false) return local
  return enhanceInsightNarrative(local, rows)
}

/** Member’s own Help Haven Learn insight from on-device notes only. */
export async function buildMemberHelpHavenInsight(
  opts?: { enhance?: boolean },
): Promise<HelpHavenInsightReport> {
  const { db } = await import('../../db/database')
  const local = await db.betaFeedbackResponses.orderBy('createdAt').reverse().limit(50).toArray()
  const rows: CloudFeedbackRow[] = local.map(r => ({
    id: String(r.id ?? r.createdAt),
    user_id: r.userId ?? null,
    email: r.email ?? null,
    rating: r.rating,
    recommend: r.recommend,
    working_well: r.intent && r.workingWell ? `[${r.intent}] ${r.workingWell}` : r.workingWell ?? null,
    confusing_broken:
      r.intent && r.confusingBroken ? `[${r.intent}] ${r.confusingBroken}` : r.confusingBroken ?? null,
    build_next: (r.buildNext as string) ?? null,
    build_next_note:
      r.intent && r.buildNextNote ? `[${r.intent}] ${r.buildNextNote}` : r.buildNextNote ?? null,
    created_at: r.createdAt,
    is_guest: !r.userId,
  }))
  return buildHelpHavenInsightReport(rows, {
    enhance: opts?.enhance ?? false,
    audience: 'member',
  })
}
