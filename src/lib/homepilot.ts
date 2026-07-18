import { generateEmotionalInsights } from './emotionalAssistant'

export const ENCOURAGEMENTS = [
  "You don't have to do it all today.",
  "Someone appreciates what you do, even if they forgot to say it.",
  "Take care of yourself the way you take care of everyone else.",
  "Progress, not perfection.",
  "Rest is not a reward — it's a requirement.",
  "Your worth is not measured by your to-do list.",
  "Small steps still move you forward.",
  "It's okay to ask for help.",
  "You are doing better than you think.",
  "Tomorrow is a fresh start, but today still matters.",
  "Breathe. You've handled hard days before.",
  "One thing at a time is enough.",
  "Your family sees your effort, even on the quiet days.",
]

export interface HomePilotInsight {
  type: 'reminder' | 'suggestion' | 'encouragement' | 'priority'
  message: string
  action?: string
  module?: string
  path?: string
}

export function getDailyEncouragement(): string {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  )
  return ENCOURAGEMENTS[dayOfYear % ENCOURAGEMENTS.length]
}

export function generateHomePilotInsights(data: {
  overdueTasks: number
  upcomingBills: number
  lowStockItems: number
  waterProgress: number
  waterGoal: number
  upcomingAppointments: number
  expiringItems: number
  couponMatches?: number
  potentialSavings?: number
  hbiBriefing?: string
  overBudgetCategories?: number
  impulsePurchases?: number
  hasMorningCheckIn?: boolean
  hasEveningCheckIn?: boolean
  recentMoodAvg?: number
  brainDumpToday?: boolean
  needToday?: string
  householdDueToday?: number
  householdOverdue?: number
  householdMaintenanceDue?: number
  supportModeActive?: boolean
  activePregnancy?: boolean
  hasJournalToday?: boolean
  upcomingAllAppts?: number
  adventureThisMonth?: number
  prefersHisHub?: boolean
  vehicleMaintenanceOverdue?: number
  vehicleMaintenanceDueSoon?: number
  petHealthReminders?: { icon: string; message: string; path: string; tone?: 'attention' | 'reminder' }[]
}): HomePilotInsight[] {
  const insights: HomePilotInsight[] = []

  if (data.supportModeActive) {
    insights.push({
      type: 'encouragement',
      message: 'How are you holding up today? There\'s no right answer — just space to check in with yourself.',
      action: 'Gentle check-in',
      module: 'wellness',
    })

    if (!data.hasMorningCheckIn && !data.hasEveningCheckIn) {
      insights.push({
        type: 'suggestion',
        message: 'When you\'re ready, a quiet moment in Wellness can help you name what you\'re carrying.',
        action: 'Mind check-in',
        module: 'wellness',
      })
    }

    insights.push({
      type: 'suggestion',
      message: 'When grief sits heavy in your chest, a few slow breaths can be enough. No fixing required.',
      action: 'Calm breathing',
      path: '/wellness?context=loss&tab=calm',
    })

    if (data.upcomingBills > 0) {
      insights.push({
        type: 'reminder',
        message: `${data.upcomingBills} bill${data.upcomingBills > 1 ? 's are' : ' is'} due soon — one less thing to hold in your head.`,
        action: 'Review bills',
        module: 'finance',
      })
    }

    insights.push({
      type: 'encouragement',
      message: 'You don\'t have to be strong right now. Support is here whenever you need it.',
      action: 'Support hub',
      module: 'expecting',
    })

    if (!data.hasJournalToday) {
      insights.push({
        type: 'suggestion',
        message: 'How are you today? Your grief journal is here when you want it — no pressure.',
        action: 'Grief journal',
        module: 'expecting',
      })
    }

    return insights
  }

  const emotional = generateEmotionalInsights({
    hasMorningCheckIn: data.hasMorningCheckIn ?? false,
    hasEveningCheckIn: data.hasEveningCheckIn ?? false,
    recentMoodAvg: data.recentMoodAvg,
    brainDumpToday: data.brainDumpToday,
    needToday: data.needToday,
  })

  for (const e of emotional) {
    insights.push({
      type: 'encouragement',
      message: e.message,
      action: e.action,
      module: e.path ? undefined : 'wellness',
      path: e.path,
    })
  }

  if (data.recentMoodAvg !== undefined && data.recentMoodAvg <= 2) {
    insights.push({
      type: 'suggestion',
      message: 'One minute of breathing can help — you don\'t need to be good at it, just present.',
      action: 'Calm breathing',
      path: '/wellness?tab=calm',
    })
  }

  if (data.needToday === 'quiet' || data.needToday === 'rest') {
    insights.push({
      type: 'suggestion',
      message: 'You said you need quiet. A breathing exercise or short meditation might help you protect that space.',
      action: 'Open Calm',
      path: '/wellness?tab=calm',
    })
  }

  if (data.overdueTasks > 0) {
    insights.push({
      type: 'priority',
      message: `You have ${data.overdueTasks} task${data.overdueTasks > 1 ? 's' : ''} that could use your attention. Want to tackle just one?`,
      action: 'View tasks',
      module: 'household',
    })
  }

  if (data.householdOverdue && data.householdOverdue > 0) {
    insights.push({
      type: 'priority',
      message: `${data.householdOverdue} home task${data.householdOverdue > 1 ? 's are' : ' is'} overdue — a quick 15-minute zone clean might be enough to get back on track.`,
      action: 'Home Hub',
      module: 'household',
    })
  } else if (data.householdDueToday && data.householdDueToday > 0) {
    insights.push({
      type: 'suggestion',
      message: `${data.householdDueToday} home rhythm${data.householdDueToday > 1 ? 's' : ''} due today. Pick one room and set a timer — you don't have to do it all.`,
      action: 'Home Hub',
      module: 'household',
    })
  }

  if (data.householdMaintenanceDue && data.householdMaintenanceDue > 0) {
    insights.push({
      type: 'reminder',
      message: `${data.householdMaintenanceDue} maintenance item${data.householdMaintenanceDue > 1 ? 's' : ''} need attention — filters, detectors, or appliance care. Boring now saves money later.`,
      action: 'Maintenance',
      module: 'household',
    })
  }

  if (data.vehicleMaintenanceOverdue && data.vehicleMaintenanceOverdue > 0) {
    insights.push({
      type: 'priority',
      message: `${data.vehicleMaintenanceOverdue} vehicle maintenance item${data.vehicleMaintenanceOverdue > 1 ? 's are' : ' is'} overdue — oil, tires, or registration. You don't need to be a car person to stay on top of this.`,
      action: 'Vehicle checklist',
      module: 'vehicle',
      path: '/vehicle?tab=checklist',
    })
  } else if (data.vehicleMaintenanceDueSoon && data.vehicleMaintenanceDueSoon > 0) {
    insights.push({
      type: 'reminder',
      message: `${data.vehicleMaintenanceDueSoon} vehicle task${data.vehicleMaintenanceDueSoon > 1 ? 's' : ''} due soon — a quick check now beats a tow bill later.`,
      action: 'Vehicle care',
      module: 'vehicle',
      path: '/vehicle?tab=checklist',
    })
  }

  if (data.petHealthReminders?.length) {
    for (const reminder of data.petHealthReminders.slice(0, 2)) {
      insights.push({
        type: reminder.tone === 'attention' ? 'priority' : 'reminder',
        message: reminder.message,
        action: 'Pet health',
        path: reminder.path,
      })
    }
  }

  if (data.upcomingAppointments > 0) {
    insights.push({
      type: 'reminder',
      message: `You have ${data.upcomingAppointments} prenatal appointment${data.upcomingAppointments > 1 ? 's' : ''} coming up this week. You've got this.`,
      action: 'View appointments',
      module: 'expecting',
    })
  }

  if (data.upcomingAllAppts && data.upcomingAllAppts > 0 && !data.activePregnancy) {
    insights.push({
      type: 'reminder',
      message: `${data.upcomingAllAppts} appointment${data.upcomingAllAppts > 1 ? 's' : ''} this week — medical, dental, or otherwise. One place to see them all.`,
      action: 'Appointments hub',
      module: 'appointments',
    })
  }

  if (data.adventureThisMonth !== undefined && data.adventureThisMonth === 0) {
    insights.push({
      type: 'suggestion',
      message: 'Your adventure log is waiting — log a win, big or small. Haven remembers so you don\'t have to.',
      action: 'My Story',
      module: 'my-story',
    })
  }

  if (data.prefersHisHub) {
    insights.push({
      type: 'suggestion',
      message: 'The Forge has your overview — bills, challenges, and what needs attention.',
      action: 'Open Forge',
      module: 'forge',
    })
  }

  if (data.activePregnancy && !data.hasJournalToday) {
    insights.push({
      type: 'suggestion',
      message: 'How was your day? A line in your Adventure Log can lighten the mental load.',
      action: 'Adventure Log',
      module: 'expecting',
    })
  }

  if (data.upcomingBills > 0) {
    insights.push({
      type: 'reminder',
      message: `${data.upcomingBills} bill${data.upcomingBills > 1 ? 's are' : ' is'} due soon. A quick check now means peace of mind later.`,
      action: 'Review bills',
      module: 'finance',
    })
  }

  if (data.lowStockItems > 0) {
    insights.push({
      type: 'suggestion',
      message: `${data.lowStockItems} pantry item${data.lowStockItems > 1 ? 's are' : ' is'} running low. I can help you plan meals around what you have.`,
      action: 'Check pantry',
      module: 'pantry',
      path: '/pantry',
    })
  }

  if (data.expiringItems > 0) {
    insights.push({
      type: 'suggestion',
      message: `${data.expiringItems} item${data.expiringItems > 1 ? 's' : ''} expiring soon — let's use them before they go to waste.`,
      action: 'View expiring',
      module: 'kitchen',
      path: '/pantry?tab=expiration',
    })
  }

  if (data.couponMatches && data.couponMatches > 0) {
    insights.push({
      type: 'suggestion',
      message: data.hbiBriefing
        ? data.hbiBriefing
        : `You have ${data.couponMatches} coupon${data.couponMatches > 1 ? 's' : ''} that match your grocery list${data.potentialSavings ? ` — about $${data.potentialSavings.toFixed(2)} in potential savings` : ''}.`,
      action: 'Savings & Deals',
      module: 'coupons',
      path: '/coupons?tab=overview',
    })
  }

  if (data.overBudgetCategories && data.overBudgetCategories > 0) {
    insights.push({
      type: 'priority',
      message: `${data.overBudgetCategories} budget categor${data.overBudgetCategories > 1 ? 'ies are' : 'y is'} over limit this month. A quick check-in with your finances might help.`,
      action: 'Review budgets',
      module: 'finance',
    })
  }

  if (data.impulsePurchases && data.impulsePurchases >= 3) {
    insights.push({
      type: 'reminder',
      message: `You've logged ${data.impulsePurchases} impulse purchases this month. Remember — awareness is the first step, not guilt.`,
      action: 'Smart Money School',
      module: 'smart-money',
    })
  }

  if (data.waterGoal > 0 && data.waterProgress < data.waterGoal * 0.5) {
    insights.push({
      type: 'reminder',
      message: "You've had less than half your water goal today. A glass now would be a kind thing to do for yourself.",
      action: 'Log water',
      module: 'wellness',
    })
  }

  if (insights.length === 0) {
    insights.push({
      type: 'encouragement',
      message: getDailyEncouragement(),
    })
  } else {
    insights.push({
      type: 'encouragement',
      message: getDailyEncouragement(),
    })
  }

  return insights
}

export const VILLAGE_AREAS = {
  bank: {
    name: 'Village Bank',
    icon: '🏦',
    description: 'Financial wellness strengthens the community.',
    path: '/finance',
    action: 'Tend your finances',
  },
  garden: {
    name: 'Community Garden',
    icon: '🌿',
    description: 'Health habits help the garden flourish.',
    path: '/wellness',
    action: 'Mind & body check-in',
  },
  library: {
    name: 'Village Library',
    icon: '📚',
    description: 'Learning and growth build the library.',
    path: '/smart-money',
    action: 'Keep learning',
  },
  'town-square': {
    name: 'Town Square',
    icon: '💛',
    description: 'Relationships brighten the heart of the village.',
    path: '/relationships',
    action: 'Reach out to someone',
  },
  'community-center': {
    name: 'Community Center',
    icon: '🤝',
    description: 'Giving back grows the community center.',
    path: '/giving',
    action: 'Give back',
  },
  'family-home': {
    name: 'Family Home',
    icon: '🏡',
    description: 'Home care keeps the family home welcoming.',
    path: '/household',
    action: 'Care for home',
  },
} as const

export const MODULES = [
  { id: 'briefing', name: 'Home', shortName: 'Home', icon: '🌿', path: '/' },
  { id: 'decisions', name: 'Life', shortName: 'Life', icon: '🍃', path: '/today' },
  { id: 'intelligence', name: 'Intelligence Center', shortName: 'Intel', icon: '🧠', path: '/intelligence' },
  { id: 'my-life', name: 'Life Profile', shortName: 'Profile', icon: '🏡', path: '/my-life' },
  { id: 'timeline', name: 'Home History', shortName: 'Timeline', icon: '📅', path: '/household-timeline' },
  { id: 'my-story', name: 'My Story', shortName: 'Story', icon: '📖', path: '/my-story' },
  { id: 'forge', name: 'The Forge', shortName: 'Forge', icon: '🔨', path: '/forge' },
  { id: 'village', name: 'The Village', shortName: 'Village', icon: '🏘️', path: '/village' },
  { id: 'appointments', name: 'Appointments', shortName: 'Appts', icon: '📅', path: '/appointments' },
  { id: 'household', name: 'Household', shortName: 'House', icon: '🏡', path: '/household' },
  { id: 'finance', name: 'Money', shortName: 'Money', icon: '✦', path: '/finance' },
  { id: 'smart-money', name: 'Smart Money School', shortName: 'Learn', icon: '📚', path: '/smart-money' },
  { id: 'adulting-playbook', name: 'Adulting Playbook', shortName: 'Adulting', icon: '📖', path: '/adulting-playbook' },
  { id: 'kitchen', name: 'Kitchen', shortName: 'Kitchen', icon: '🍳', path: '/kitchen' },
  { id: 'pantry', name: 'Pantry & Grocery', shortName: 'Pantry', icon: '🛒', path: '/pantry' },
  { id: 'coupons', name: 'Savings', shortName: 'Savings', icon: '💚', path: '/savings' },
  { id: 'meals', name: 'Meal Planning', shortName: 'Meals', icon: '🍽️', path: '/meals' },
  { id: 'relationships', name: 'Relationships', shortName: 'Love', icon: '❤️', path: '/relationships' },
  { id: 'wellness', name: 'Mind & Wellness', shortName: 'Mind', icon: '🌿', path: '/wellness' },
  { id: 'expecting', name: 'Expecting', shortName: 'Expecting', icon: '🌸', path: '/expecting' },
  { id: 'vehicle', name: 'Vehicle', shortName: 'Vehicle', icon: '🚗', path: '/vehicle' },
  { id: 'pets', name: 'Pet Care', shortName: 'Pets', icon: '🐾', path: '/pets' },
  { id: 'career', name: 'Career & Growth', shortName: 'Career', icon: '🎓', path: '/career' },
  { id: 'giving', name: 'Giving Back', shortName: 'Giving', icon: '🌎', path: '/giving' },
] as const
