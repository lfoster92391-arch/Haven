import Dexie, { type EntityTable } from 'dexie'
import { getPetVisualKey, normalizePetType } from '../lib/petBreeds'
import type { ApplianceTag } from '../lib/recipeAppliances'
import type { RecipeCategory } from '../lib/recipeCategories'
import type { WeatherLocation } from '../lib/weatherPrep'

export type { WeatherLocation, RecipeCategory }

/** Optional multi-device sync fields — never required for local-only use */
export type SyncStatus = 'local' | 'pending' | 'synced' | 'conflict'

export interface Task {
  id?: number
  title: string
  category: string
  completed: boolean
  dueDate?: string
  priority: 'low' | 'medium' | 'high'
  notes?: string
  createdAt: string
}

export interface Bill {
  id?: number
  name: string
  amount: number
  dueDay: number
  dueDate?: string
  paid: boolean
  category: string
  recurring: boolean
  frequency: 'monthly' | 'weekly' | 'biweekly' | 'yearly' | 'once'
  notes?: string
  lastPaidDate?: string
  /** @deprecated use paymentLedgerEntryId */
  paymentTransactionId?: number
  paymentLedgerEntryId?: number
  /** Sync metadata (v58+) — optional for backward compatibility */
  updatedAt?: string
  deviceId?: string
  syncStatus?: SyncStatus
  cloudId?: string
}

export type PantryLocation =
  | 'pantry'
  | 'fridge'
  | 'freezer'
  | 'spice'
  | 'baking'
  | 'snacks'
  | 'drinks'
  | 'pet-food'

export type StorageLocation =
  | 'refrigerator'
  | 'freezer'
  | 'pantry'
  | 'spices'
  | 'baking'
  | 'snacks'
  | 'drinks'
  | 'pet-food'

export type LifecycleStage =
  | 'purchased'
  | 'stored'
  | 'running-low'
  | 'use-soon'
  | 'frozen'
  | 'used'
  | 'expired'
  | 'discarded'

export type ExpirationConfidence = 'verified' | 'estimated' | 'unknown'

export type InventoryEventType =
  | 'added'
  | 'used'
  | 'expired'
  | 'frozen'
  | 'moved'
  | 'donated'
  | 'purchased'
  | 'discarded'
  | 'restocked'

export interface PantryItem {
  id?: number
  name: string
  location: PantryLocation
  quantity: number
  unit: string
  expirationDate?: string
  lowStockThreshold: number
  category?: string
  purchaseDate?: string
  barcode?: string
  /** KitchenOS lifecycle */
  lifecycleStage?: LifecycleStage
  expirationConfidence?: ExpirationConfidence
  estimatedRemaining?: number
  storageLocation?: StorageLocation
  /** Local-only in v1 sync — large blobs stay on device */
  photo?: string
  shelfLifeDays?: number
  brand?: string
  packageSize?: string
  upc?: string
  /** HFIP ontology link — computed on add/scan */
  ontologyId?: string
  updatedAt?: string
  deviceId?: string
  syncStatus?: SyncStatus
  cloudId?: string
}

export interface InventoryEvent {
  id?: number
  itemId: number
  itemName?: string
  type: InventoryEventType
  quantity?: number
  fromLocation?: string
  toLocation?: string
  note?: string
  createdAt: string
}

export interface IngredientChangeStat {
  name: string
  count: number
  lastSeenAt: string
}

export type RecipeEvolutionDecision = 'accepted' | 'keep-asking' | 'declined'

export interface MealLearningEntry {
  id?: number
  recipeKey: string
  recipeName: string
  /** User’s personal version name — e.g. "Lisa's Chicken Alfredo" */
  personalName?: string
  cookCount: number
  skipCount: number
  lastCookedAt?: string
  lastSkippedAt?: string
  isFavorite: boolean
  preferredPortions?: number
  preferredCuisine?: string
  seasonalMonth?: number
  /** Last freeform cook note Haven should remember */
  lastCookNote?: string
  addedIngredients?: string[]
  removedIngredients?: string[]
  /** How often each addition has shown up across cooks */
  addedIngredientStats?: IngredientChangeStat[]
  removedIngredientStats?: IngredientChangeStat[]
  /** Confirmed default version tweaks */
  defaultAdditions?: string[]
  defaultRemovals?: string[]
  /** Per-ingredient evolution choices (keyed by lowercased ingredient) */
  evolutionDecisions?: Record<string, RecipeEvolutionDecision>
  updatedAt: string
}

export type MealRatingSource = 'today' | 'intel' | 'kitchen' | 'dashboard'

export interface MealRating {
  id?: number
  recipeId?: number
  recipeName: string
  rating: number
  cookedAt: string
  ingredientsUsed: string[]
  source: MealRatingSource
  updatedAt?: string
  deviceId?: string
  syncStatus?: SyncStatus
  cloudId?: string
}

export interface PantryChallengeEntry {
  id?: number
  weekStart: string
  mealsCompleted: number
  moneySaved: number
  wastePrevented: number
  active: boolean
}

export type RecipeDifficulty = 'easy' | 'medium' | 'hard'

export interface Recipe {
  id?: number
  name: string
  ingredients: string[]
  spices: string[]
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  category: RecipeCategory
  /** Step-by-step cooking directions */
  directions?: string[]
  /** Base64 JPEG photo stored locally in IndexedDB */
  imageData?: string
  /** Appliance-specific sections where this recipe also appears */
  applianceTags?: ApplianceTag[]
  prepTimeMinutes?: number
  cookMinutes?: number
  difficulty?: RecipeDifficulty
  /** Manual cost override; otherwise estimated from ingredients */
  estimatedCost?: number
  servings?: number
  notes?: string
  createdAt: string
}

export type RecipeFeedbackTag =
  | 'too-salty'
  | 'needs-sauce'
  | 'perfect'
  | 'family-loved'
  | 'make-again'
  | 'added-ingredients'
  | 'removed-ingredients'
  | 'changed-amounts'
  | 'turned-out-great'
  | 'needs-improvement'

export interface RecipeFeedback {
  id?: number
  recipeId: number
  cookedAt: string
  rating: number
  tags: RecipeFeedbackTag[]
  note?: string
}

export interface Budget {
  id?: number
  category: string
  monthlyLimit: number
  month: string
}

export interface Transaction {
  id?: number
  amount: number
  category: string
  description: string
  date: string
  isImpulse: boolean
  impulsePaused?: boolean
  store?: string
  notes?: string
  source?: 'manual' | 'receipt' | 'bill'
  billId?: number
  ledgerEntryId?: number
  receiptImageData?: string
  receiptRawText?: string
}

export interface FundEntry {
  id?: number
  amount: number
  date: string
  kind: 'income' | 'credit'
  createdAt: string
}

export type LedgerEntryType = 'income' | 'expense' | 'transfer' | 'adjustment'
export type LedgerEntrySource = 'manual' | 'bill' | 'income' | 'goal' | 'transfer'
export type LedgerEntryStatus = 'pending' | 'posted' | 'cancelled'

export interface LedgerEntry {
  id?: number
  type: LedgerEntryType
  amount: number
  category: string
  account: string
  source: LedgerEntrySource
  sourceId?: string
  status: LedgerEntryStatus
  description?: string
  date: string
  createdAt: string
  updatedAt: string
}

export type FinancialAuditAction =
  | 'created'
  | 'edited'
  | 'deleted'
  | 'paid'
  | 'undone'
  | 'transfer'
  | 'adjustment'
  | 'cancelled'

export interface FinancialAuditLog {
  id?: number
  timestamp: string
  userAction: FinancialAuditAction
  source: string
  linkedLedgerEntryId?: number
  details?: string
}

export interface SavingsGoal {
  id?: number
  name: string
  icon: string
  color: string
  targetAmount: number
  currentAmount: number
  createdAt: string
  updatedAt: string
  completedAt?: string
  deadline?: string
  notes?: string
  /** Milestone ids already celebrated */
  celebratedMilestones?: string[]
}

export interface SavingsDeposit {
  id?: number
  amount: number
  date: string
  source: 'manual' | 'screenshot'
  note?: string
  savingsGoalId: number
  imageData?: string
  rawText?: string
  createdAt: string
}

export interface OpportunityPlan {
  id?: number
  opportunityId: string
  goalId: number
  monthlyAmount: number
  opportunityName?: string
  notes?: string
  createdAt: string
  active: boolean
}

export interface FinancialAuditCache {
  id?: number
  computedAt: string
  auditSnapshot: string
}

export interface SubscriptionPriceHistory {
  id?: number
  name: string
  amount: number
  recordedAt: string
}

export interface FinancialLeakRecord {
  id?: number
  type: string
  amount: number
  period: 'month' | 'year' | 'once'
  detectedAt: string
}

export interface GoalImpactLog {
  id?: number
  date: string
  goalId: number
  daysDelta: number
  reason: string
}

export interface FinancialHealthSnapshot {
  id?: number
  date: string
  scores: Record<string, number>
  overall: number
}

export interface SimulatorPreset {
  id?: number
  label: string
  amount: number
  category: string
}

export type IntelligencePriority = 'critical' | 'high' | 'medium' | 'low' | 'success'

export type IntelligenceCategory =
  | 'Financial'
  | 'Home'
  | 'Vehicle'
  | 'Shopping'
  | 'Savings'
  | 'Goals'
  | 'Pantry'
  | 'Kitchen'
  | 'Recipes'
  | 'Calendar'
  | 'Health'
  | 'Maintenance'
  | 'Weather'
  | 'Documents'
  | 'Family'
  | 'Education'
  | 'Broadcast'
  | 'Security'
  | 'General'

export type IntelligenceActionType = 'navigate' | 'one-tap' | 'dismiss' | 'snooze'

export interface Observation {
  id?: number
  sourceKey: string
  module: string
  category: IntelligenceCategory
  title: string
  description: string
  priority: IntelligencePriority
  severity?: string
  confidence: number
  recommendedAction?: string
  actionRoute?: string
  actionType?: IntelligenceActionType
  actionPayload?: Record<string, unknown>
  estimatedSavings?: number
  createdAt: string
  expiresAt?: string
  resolved: boolean
  dismissed: boolean
  snoozedUntil?: string
  acknowledged?: boolean
}

export interface LearningProfile {
  id?: number
  key: string
  category: string
  value: string
  confidence: number
  visitCount?: number
  updatedAt: string
}

export interface IntelligenceCache {
  id?: number
  cacheKey: string
  payload: string
  updatedAt: string
}

export interface IntelligenceImpact {
  id?: number
  monthKey: string
  savedDollars: number
  preventedExpired: number
  predictedWeather: number
  completedRecommendations: number
  updatedAt: string
}

export interface Receipt {
  id?: number
  store: string
  amount: number
  date: string
  category: string
  imageData?: string
  rawText?: string
  lineItems: string[]
  transactionId?: number
  createdAt: string
}

export interface Meal {
  id?: number
  name: string
  day: string
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  ingredients: string[]
  notes?: string
}

export interface HealthEntry {
  id?: number
  date: string
  waterGlasses: number
  waterGoal: number
  mood?: number
  sleepHours?: number
  weight?: number
  medicationsTaken: string[]
}

export interface MindCheckIn {
  id?: number
  date: string
  timeOfDay: 'morning' | 'evening' | 'anytime'
  mood?: number
  feelings: string[]
  brainDump?: string
  need?: string
  gratitude?: string
  release?: string
  createdAt: string
}

export interface Vehicle {
  id?: number
  name: string
  make: string
  model: string
  year: number
  mileage: number
  vin?: string
  licensePlate?: string
  nextService?: string
  serviceType?: string
  insuranceRenewal?: string
  registrationRenewal?: string
}

export type VehicleMaintenanceTaskType =
  | 'oil-change'
  | 'tire-rotation'
  | 'wiper-blades'
  | 'air-filter'
  | 'cabin-filter'
  | 'brake-inspection'
  | 'coolant-flush'
  | 'transmission-fluid'
  | 'battery-check'
  | 'tire-pressure'
  | 'registration'
  | 'inspection'
  | 'custom'

export interface VehicleMaintenanceTask {
  id?: number
  vehicleId: number
  taskType: VehicleMaintenanceTaskType | string
  title: string
  frequencyMiles?: number
  frequencyMonths?: number
  lastDoneDate?: string
  lastDoneMileage?: number
  nextDueDate?: string
  nextDueMileage?: number
  notes?: string
  completed: boolean
  active: boolean
  createdAt: string
}

export type PetType =
  | 'Cat'
  | 'Dog'
  | 'Bird'
  | 'Lizard'
  | 'Fish'
  | 'Rabbit'
  | 'Hamster'
  | 'Snake'
  | 'Turtle'
  | 'Other'

export interface Pet {
  id?: number
  name: string
  /** @deprecated use `type` — kept for existing records */
  species: string
  type?: PetType
  breed?: string
  visualKey?: string
  feedingSchedule?: string
  nextVetVisit?: string
  notes?: string
  medications?: string[]
  supplies: string[]
}

export type PetSupplyType = 'food' | 'litter' | 'treats' | 'toy' | 'medication' | 'grooming' | 'other'

export interface PetSupply {
  id?: number
  name: string
  supplyType: PetSupplyType
  quantity: number
  unit: string
  lowStockThreshold: number
  purchaseDate?: string
  petId?: number
}

export interface PetExpense {
  id?: number
  description: string
  amount: number
  date: string
  expenseType: 'vet' | 'grooming' | 'supplies' | 'other'
  store?: string
  petId?: number
  receiptId?: number
}

export type PetAppointmentType = 'vet' | 'groomer' | 'checkup' | 'emergency'

export interface PetAppointment {
  id?: number
  petId: number
  date: string
  time?: string
  type: PetAppointmentType
  location?: string
  notes?: string
  reminder: boolean
  completed: boolean
  lifeAppointmentId?: number
  createdAt: string
}

export interface PetVaccination {
  id?: number
  petId: number
  vaccineName: string
  dateGiven: string
  nextDue?: string
  vet?: string
  notes?: string
}

export type PetChecklistCategory = 'daily' | 'weekly' | 'monthly'

export interface PetCareChecklist {
  id?: number
  petId: number
  itemId: string
  title: string
  frequency: PetChecklistCategory
  category: PetChecklistCategory
  lastDone?: string
}

export interface PetHealthNote {
  id?: number
  petId: number
  body: string
  updatedAt: string
}

export interface RelationshipNote {
  id?: number
  date: string
  type: 'gratitude' | 'memory' | 'date-night' | 'check-in' | 'conversation'
  content: string
  partner?: string
}

export interface RelationshipIdea {
  id?: number
  text: string
  createdAt: string
}

export interface RelationshipMemory {
  id?: number
  date: string
  content: string
  kind: 'moment' | 'small-act' | 'date'
  createdAt: string
}

export interface ScratchCardState {
  id?: number
  ideaId: string
  revealed: boolean
  savedToTry: boolean
  revealedAt?: string
}

export interface Goal {
  id?: number
  title: string
  category: string
  progress: number
  target: number
  unit: string
  deadline?: string
}

export interface VillageProgress {
  id?: number
  area: 'bank' | 'garden' | 'library' | 'town-square' | 'community-center' | 'family-home'
  level: number
  lastUpdated: string
}

export interface UserProfile {
  id?: number
  name: string
  greeting: string
  onboardingComplete: boolean
  createdAt: string
  updatedAt?: string
  deviceId?: string
  syncStatus?: SyncStatus
  cloudId?: string
}

export interface SchoolSchedule {
  name: string
  days: number[]
  notes?: string
}

export type LoveLanguageHint = 'words' | 'acts' | 'gifts' | 'time' | 'touch'

export interface PartnerImportantDate {
  label: string
  date: string
}

export interface PartnerProfile {
  id?: number
  name?: string
  nickname?: string
  birthday?: string
  anniversary?: string
  loveLanguages?: LoveLanguageHint[]
  favoriteFood?: string
  coffeeOrder?: string
  favoriteFlowers?: string
  favoriteShows?: string
  hobbies?: string
  petPeeves?: string
  stressCare?: string
  lovedDateIdeas?: string
  giftIdeas?: string
  importantDates?: PartnerImportantDate[]
  havenNotes?: string
  aboutParagraph?: string
  updatedAt: string
}

export type ChronoPreference = 'morning' | 'night' | 'flexible'
export type HardTaskTime = 'morning' | 'afternoon' | 'evening' | 'varies'
export type RechargeStyle = 'quiet' | 'social' | 'movement' | 'creative' | 'sleep'
export type StressHelp = 'quiet' | 'talk' | 'walk' | 'list' | 'delegate'
export type MoneyTendency = 'saver' | 'spender' | 'balanced' | 'stressed'
export type LifeSeason = 'survival' | 'building' | 'thriving' | 'healing'
export type CookingFeel = 'love' | 'tolerate' | 'avoid'

export interface HavenUserPreferences {
  /** Daily rhythm */
  chronoPreference?: ChronoPreference
  hardTaskTime?: HardTaskTime
  rechargeStyle?: RechargeStyle
  /** Stress & support */
  stressHelp?: StressHelp
  badDayBetter?: string
  /** Money mindset */
  moneyTendency?: MoneyTendency
  financialStress?: string
  /** Connection */
  receiveCare?: string
  qualityTimeLooksLike?: string
  /** Goals right now */
  lifeSeason?: LifeSeason
  wishHavenHelped?: string
  /** Interests — feeds date matching */
  userFavoriteFood?: string
  userHobbies?: string
  userShows?: string
  userDatePreferences?: string
  /** Household */
  cookingFeel?: CookingFeel
  choreAvoid?: string
  choreDontMind?: string
  /** Foods / ingredients to never recommend (e.g. shrimp, peanuts) */
  foodExclusions?: string[]
  /** Preferred brands keyed by item type, e.g. { coffee: 'Folgers' } */
  brandPreferences?: Record<string, string>
  /** Get to Know You — personal profile */
  birthday?: string
  favoriteRelax?: string
  householdStress?: string
  financialGoal?: string
  alwaysRemember?: string
  /**
   * Secret Ask Haven menus unlocked by keyword (e.g. baby_care, christmas).
   * Never shown in main nav — reopen via short phrases after unlock.
   */
  secretMenusUnlocked?: string[]
  /** Meta */
  knowYouStartedAt?: string
  knowYouUpdatedAt?: string
}


export interface LifeProfile {
  id?: number
  lifeTypes?: string[]
  relationshipStatus?: string
  partnerName?: string
  partnerWork?: string
  workNotes?: string
  schools: SchoolSchedule[]
  waterTumblerOz?: number
  groceryDay?: number
  energyDipHour?: number
  commuteNotes?: string
  childNames?: string[]
  medications?: string[]
  homeZip?: string
  weatherLocation?: WeatherLocation
  preferredStores?: string[]
  prefersHisHub?: boolean
  userPreferences?: HavenUserPreferences
  setupComplete: boolean
  updatedAt: string
  deviceId?: string
  syncStatus?: SyncStatus
  cloudId?: string
}

export type MilestoneCategory =
  | 'life'
  | 'career'
  | 'finance'
  | 'home'
  | 'relationship'
  | 'health'
  | 'family'
  | 'pet'
  | 'pregnancy'
  | 'growth'
  | 'celebration'

export interface LifeMilestone {
  id?: number
  date: string
  title: string
  body?: string
  category: MilestoneCategory
  chapter?: StoryChapter
  sourceModule?: string
  sourceId?: string
  isAuto?: boolean
  createdAt: string
}

export type AppointmentType =
  | 'medical'
  | 'dental'
  | 'vision'
  | 'therapy'
  | 'hair'
  | 'prenatal'
  | 'vet'
  | 'vehicle'
  | 'kids'
  | 'other'

export interface LifeAppointment {
  id?: number
  date: string
  time?: string
  title: string
  type: AppointmentType
  location?: string
  notes?: string
  reminder: boolean
  createdAt: string
}

export interface LifeMemory {
  id?: number
  key: string
  value: string
  source: 'user' | 'observed'
  category: 'routine' | 'preference' | 'relationship' | 'health' | 'household'
  createdAt: string
}

/** Celebration memories for "Today Worth Remembering" — milestones, anniversaries, goals. */
export type CelebrationMemoryType =
  | 'milestone'
  | 'pet-anniversary'
  | 'goal-reached'
  | 'relationship'
  | 'home'
  | 'custom'

export interface CelebrationMemory {
  id?: number
  type: CelebrationMemoryType
  emoji: string
  title: string
  date: string
  note?: string
  source: 'user' | 'seeded' | 'auto'
  createdAt: string
}

export type HouseholdMemoryType = 'preference' | 'location' | 'tradition' | 'habit' | 'fact'

export interface HouseholdMemory {
  id?: number
  type: HouseholdMemoryType
  key: string
  value: string
  context?: string
  learnedAt: string
  source: 'user' | 'inferred'
}

export interface Encouragement {
  id?: number
  message: string
  shown: boolean
  date: string
}

export type CouponWalletCategory =
  | 'paper'
  | 'digital'
  | 'manufacturer'
  | 'store'
  | 'promo'
  | 'cashback'
  | 'loyalty'

export type CouponSourceType =
  | 'paper'
  | 'digital'
  | 'weekly-ad'
  | 'flyer'
  | 'receipt'
  | 'loyalty'
  | 'cashback'
  | 'qr'
  | 'pdf'
  | 'email'

export type StructuredCouponType = 'manufacturer' | 'store' | 'digital' | 'unknown'

export interface Coupon {
  id?: number
  title: string
  store: string
  discountType: 'percent' | 'fixed' | 'bogo' | 'free'
  discountValue: number
  products: string[]
  barcode?: string
  expirationDate?: string
  imageData?: string
  /** @deprecated Use rawOcrText — kept for backward compatibility */
  rawText?: string
  source: 'scan' | 'manual' | 'online'
  /** Digital coupon wallet category */
  walletCategory?: CouponWalletCategory
  notes?: string
  used: boolean
  createdAt: string
  /** Structured intelligence fields (from AI-assisted parser) */
  savingsAmount?: number
  percentOff?: number
  buyXGetY?: { buy: number; get: number; product?: string }
  productName?: string
  brand?: string
  category?: string
  requiredQuantity?: number
  sizeWeight?: string
  couponType?: StructuredCouponType
  storeName?: string
  couponCode?: string
  termsConditions?: string
  /** Audit-only OCR text — not displayed as primary data */
  rawOcrText?: string
  parseConfidence?: number
  parsedAt?: string
  /** Future-ready capture source */
  couponSource?: CouponSourceType
}

export interface PriceHistory {
  id?: number
  productName: string
  store: string
  price: number
  unit?: string
  recordedAt: string
  source: 'receipt' | 'manual' | 'deal-alert'
}

export interface DealAlert {
  id?: number
  store: string
  productName: string
  currentPrice: number
  previousPrice?: number
  lowestInDays?: number
  couponId?: number
  recommendation: 'buy' | 'wait' | 'skip'
  reason: string
  estimatedSavings?: number
  expiresAt?: string
  createdAt: string
  dismissed: boolean
}

export type SavingsRecordType =
  | 'coupon'
  | 'price-drop'
  | 'duplicate-avoided'
  | 'waste-prevented'
  | 'store-optimization'
  | 'bulk-buy'

export interface SavingsRecord {
  id?: number
  type: SavingsRecordType
  amount: number
  description: string
  store?: string
  createdAt: string
}

export interface ShoppingTrip {
  id?: number
  stores: { name: string; items: string[]; estimatedSavings: number }[]
  totalEstimated: number
  usualTotal?: number
  plannedDate?: string
  completed: boolean
}

/** HSIE v50 — shopping intelligence cache & learnings */
export interface ShoppingIntelligenceCache {
  id: string
  computedAt: string
  brief: unknown
}

/** Home Relief v51 — cached daily brief */
export interface HomeReliefCache {
  id: string
  computedAt: string
  brief: unknown
}

/** Household Command Center v56 — cached daily brief */
export interface CommandCenterCache {
  id: string
  computedAt: string
  brief: unknown
}

export interface HouseholdPreferenceRecord {
  id: string
  key: string
  value: string
  confidence: number
  learnedAt: string
  source: string
  updatedAt?: string
  deviceId?: string
  syncStatus?: SyncStatus
}

export interface LastHomeVisitSnapshot {
  id: 'default'
  visitedAt: string
  snapshot: {
    pantryCount: number
    recipeMatchCount: number
    couponMatchCount: number
    savingsGoalProgress: number
    householdTasksCompleted: number
    confidenceScore: number
    priceDrops: { item: string; pct: number; store: string }[]
    newCouponMatches: number
  }
}

export interface HouseholdConfidenceHistory {
  id?: number
  date: string
  score: number
  signals: string[]
}

export interface PriceMemoryRecord {
  id: string
  itemName: string
  store: string
  price: number
  normalPrice?: number
  recordedAt: string
}

export interface PurchasePattern {
  id?: number
  itemName: string
  avgDaysBetween: number
  lastPurchase: string
  store: string
  updatedAt?: string
}

export interface HouseholdSupplyRecord {
  id: string
  itemName: string
  daysRemaining?: number
  loadsRemaining?: number
  label: string
  updatedAt?: string
}

export interface ReceiptLearning {
  id: string
  itemName: string
  pattern: string
  avgDaysBetween?: number
  lastPurchase?: string
  preferredStore?: string
  updatedAt?: string
}

export interface TripPlan {
  id: string
  date: string
  store: string
  items: string[]
  estimatedCost: number
  savings: number
  computedAt: string
}

export type LifeContextType =
  | 'back-to-school'
  | 'pregnancy'
  | 'christmas'
  | 'vacation'
  | 'buying-home'
  | 'moving'
  | 'new-baby'
  | 'new-pet'
  | 'wedding'
  | 'graduation'
  | 'storm-prep'
  | 'gardening'
  | 'emergency-budget'
  | 'retirement'
  | 'medical-recovery'
  | 'home-renovation'
  | 'tax-season'
  | 'custom'

export interface LifeContext {
  id?: number
  type: LifeContextType
  name: string
  startDate?: string
  endDate?: string
  active: boolean
  manual: boolean
  metadata?: Record<string, unknown>
}

export interface ForgeProgress {
  id?: number
  buildId: string
  progress: number
  startedAt: string
  completedAt?: string
  currentStepIndex: number
  completedStepIds?: string[]
}

export interface ForgeProfile {
  id: 'default'
  level: number
  xp: number
  levelTitle: string
  learningStreak: number
  lastLearningDate?: string
  skillsLearned: number
  challengesCompleted: number
}

export interface ForgeAchievement {
  id?: string
  title: string
  emoji: string
  status: 'completed' | 'in-progress' | 'locked'
  unlockedAt?: string
  buildId?: string
}

export type StoryChapter =
  | 'new-home'
  | 'financial'
  | 'pets'
  | 'family'
  | 'growth'
  | 'career'
  | 'memories'

export interface StoryMemory {
  id?: number
  title: string
  description?: string
  date: string
  chapter: StoryChapter
  sourceModule: string
  sourceId: string
  photoIds?: string[]
  location?: string
  notes?: string
  isFavorite?: boolean
  relatedIds?: string[]
  autoGenerated: boolean
  createdAt: string
}

export interface GratitudeEntry {
  id?: number
  date: string
  text: string
  photoData?: string
  voiceStub?: boolean
  createdAt: string
}

export interface LifeMoment {
  id?: number
  type: string
  title: string
  date: string
  note?: string
  chapter?: StoryChapter
  createdAt: string
}

export interface GroceryListItem {
  id?: number
  name: string
  quantity: number
  unit: string
  checked: boolean
  category: string
  barcode?: string
  estimatedPrice?: number
  addedAt: string
  updatedAt?: string
  deviceId?: string
  syncStatus?: SyncStatus
  cloudId?: string
}

export interface AdultingProgress {
  id?: number
  completedChallengeIds: string[]
  checklistProgress: Record<string, string[]>
  completedGuideIds?: string[]
  updatedAt: string
}

export interface CareerProfile {
  id?: number
  currentRole?: string
  targetRole?: string
  yearsInField?: number
  educationLevel?: string
  careerGoalsNote?: string
  updatedAt: string
}

export interface CareerGoal {
  id?: number
  title: string
  targetDate?: string
  steps: string[]
  completedSteps: string[]
  completed: boolean
  createdAt: string
}

export interface CareerStudyBlock {
  id: string
  label: string
  done: boolean
}

export interface CareerStudyPlan {
  id: string
  subject: string
  examDate?: string
  blocks: CareerStudyBlock[]
  createdAt: string
}

export interface CareerProgress {
  id?: number
  checklistProgress: Record<string, string[]>
  completedChallengeIds: string[]
  studyPlans: CareerStudyPlan[]
  quizAnswers: Record<string, string>
  quizJournal?: string
  updatedAt: string
}

export interface AdultingYouTubeLink {
  id?: number
  title: string
  url: string
  category: 'home' | 'auto' | 'career' | 'style' | 'cooking' | 'money' | 'relationships'
  notes?: string
  addedAt: string
}

export type HouseholdZone =
  | 'kitchen'
  | 'bathroom'
  | 'bedroom'
  | 'living'
  | 'laundry'
  | 'outdoor'
  | 'general'

export type HouseholdFrequency =
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'seasonal'
  | 'yearly'
  | 'once'

export type HouseholdCategory = 'cleaning' | 'maintenance' | 'seasonal' | 'custom'

export type HouseholdSeason = 'spring' | 'summer' | 'fall' | 'winter'

export interface HouseholdTask {
  id?: number
  templateId?: string
  name: string
  zone: HouseholdZone
  category: HouseholdCategory
  frequency: HouseholdFrequency
  season?: HouseholdSeason
  lastCompleted?: string
  nextDue?: string
  notes?: string
  active: boolean
  createdAt: string
}

export interface HouseholdChallenge {
  id?: number
  weekStart: string
  challengeId: string
  title: string
  targetDays: number
  completedDays: string[]
  pointsReward: number
  active: boolean
}

export type BabyGender = 'boy' | 'girl' | 'unknown' | 'surprise'

export type PregnancyOutcome = 'active' | 'loss' | 'born'

export type JourneyDataChoice = 'memorial' | 'archive' | 'hide'

export interface PregnancyProfile {
  id?: number
  dueDate?: string
  lastMenstrualPeriod?: string
  babyGender: BabyGender
  babyBorn: boolean
  birthDate?: string
  babyName?: string
  notes?: string
  checklistProgress: Record<string, string[]>
  pregnancyOutcome?: PregnancyOutcome
  lossDate?: string
  lossNotes?: string
  supportModeActive?: boolean
  journeyDataChoice?: JourneyDataChoice
  supportDailyMessage?: boolean
  lossWeeksAlong?: number
  createdAt: string
  updatedAt: string
}

export interface PregnancyAppointment {
  id?: number
  date: string
  type: string
  location?: string
  notes?: string
  reminder: boolean
}

export interface SonogramPhoto {
  id?: number
  date: string
  week?: number
  imageData: string
  caption?: string
  createdAt: string
}

export type JournalMood =
  | 'great'
  | 'okay'
  | 'tired'
  | 'anxious'
  | 'grateful'
  | 'sad'
  | 'hopeful'
  | 'overwhelmed'

export interface PregnancyJournalEntry {
  id?: number
  date: string
  weekAtEntry?: number
  promptUsed?: string
  mood?: JournalMood
  body?: string
  content: string
  tags?: string[]
  isGriefEntry?: boolean
  createdAt: string
}

export type VillageCategory =
  | 'meals'
  | 'budget'
  | 'home'
  | 'relationships'
  | 'vehicle'
  | 'pets'
  | 'garden'
  | 'diy'
  | 'organization'

export type VillageWisdomCategory =
  | 'home-care'
  | 'cooking'
  | 'budgeting'
  | 'relationships'
  | 'vehicles'
  | 'parenting'
  | 'pets'
  | 'gardening'
  | 'technology'
  | 'diy'

export interface VillageQuestion {
  id?: number
  text: string
  category: VillageCategory
  createdAt: string
  localOnly: true
}

export interface VillageSavedTip {
  id?: number
  tipText: string
  sourceQuestionId?: string
  savedAt: string
}

export interface VillageChallengeProgress {
  id?: number
  challengeId: string
  joinedAt: string
  progress: number
}

export interface VillageCelebration {
  id?: number
  text: string
  emoji: string
  createdAt: string
  reactions: { helpful: number; encouraging: number; congratulations: number }
  localOnly?: boolean
}

export interface UserVillageProfile {
  id: 'default'
  helpfulMarks: number
  mentorTopics: string[]
  localVillageOptIn: boolean
  thankedNeighbors: Record<string, number>
}

export type VillageBuildingId =
  | 'bank'
  | 'family-home'
  | 'garden'
  | 'workshop'
  | 'town-square'
  | 'library'
  | 'bakery'
  | 'commons'

export interface VillageWorldState {
  id: 'default'
  buildingLevels: Record<VillageBuildingId, number>
  lastComputed: string
  overallHappiness: number
}

export interface VillageDailyActivityEntry {
  id?: number
  date: string
  text: string
  icon: string
  buildingId?: VillageBuildingId
  createdAt: string
}

export interface VillageDiscovery {
  id: string
  title: string
  description: string
  unlockedAt: string
  buildingId?: VillageBuildingId
}

export type DeliveryStatus = 'ordered' | 'shipped' | 'out_for_delivery' | 'delivered' | 'delayed'

export interface ConnectionPreference {
  id: string
  serviceId: string
  optedIn: boolean
  notifyWhenAvailable: boolean
  connectedAt?: string
  updatedAt?: string
  deviceId?: string
  syncStatus?: SyncStatus
}

export interface ConnectedDelivery {
  id?: number
  carrier: string
  retailer: string
  description: string
  status: DeliveryStatus
  etaStart?: string
  etaEnd?: string
  items?: string[]
  createdAt: string
}

export type TimelineEventSource =
  | 'pantry'
  | 'finance'
  | 'meals'
  | 'shopping'
  | 'household'
  | 'vehicle'
  | 'pets'
  | 'connections'
  | 'story'

export interface TimelineEvent {
  id?: number
  timestamp: string
  date: string
  category: string
  icon: string
  title: string
  detail?: string
  source: TimelineEventSource
  searchableText: string
  metadata?: Record<string, unknown>
  entityId?: string
  entityType?: string
  updatedAt?: string
  deviceId?: string
  syncStatus?: SyncStatus
  cloudId?: string
}

export interface TimelineSnapshot {
  id?: number
  date: string
  snapshot: Record<string, unknown>
}

export interface HouseholdContinuityDoc {
  id?: number
  category: string
  title: string
  content: string
  updatedAt: string
}

export interface ConnectedGroceryOrder {
  id?: number
  store: string
  items: string[]
  expectedArrival: string
  importedToPantry: boolean
  createdAt: string
}

export interface HandledItem {
  id: string
  text: string
  emoji: string
  source: 'delivery' | 'bill' | 'grocery' | 'calendar' | 'shopping'
  path?: string
}

export interface HandledItemsCache {
  id: string
  computedAt: string
  items: HandledItem[]
}

export interface PreparednessDimensionSnapshot {
  key: string
  label: string
  score: number
  ok: boolean
  icon?: string
}

export interface PreparednessSnapshot {
  id: string
  date: string
  score: number
  dimensions: PreparednessDimensionSnapshot[]
  computedAt: string
}

export interface WhatIfResultCache {
  id: string
  scenarioId: string
  resultJson: string
  computedAt: string
}

export interface ScanSession {
  id?: number
  startedAt: string
  endedAt?: string
  store?: string
  shoppingMode?: boolean
}

export interface ScanSessionItem {
  id?: number
  sessionId: number
  barcode?: string
  productName: string
  recommendation?: 'buy' | 'skip' | 'wait'
  scannedAt: string
  price?: number
  metadata?: Record<string, unknown>
}

export interface BackgroundTaskEntry {
  id: string
  label: string
  completedAt: string
}

export interface BackgroundTasksLog {
  id: string
  date: string
  tasks: BackgroundTaskEntry[]
  computedAt: string
}

/** Ask Haven chat history (v57) */
export interface ChatMessageRecord {
  id?: number
  role: 'user' | 'assistant' | 'system'
  text: string
  createdAt: string
  route?: string
}

/** Offline mutation queue for multi-device sync (v58+) */
export type SyncQueueOp = 'upsert' | 'delete'

export interface SyncQueueEntry {
  id?: number
  tableName: string
  recordId: string
  op: SyncQueueOp
  payload?: Record<string, unknown>
  updatedAt: string
  deviceId: string
  attempts: number
  lastError?: string
  createdAt: string
}

/** Device / sync session metadata (keyed string ids) */
export interface SyncMetaRecord {
  id: string
  value: string
  updatedAt: string
}

/** Soft prompt schedule for beta feedback modal (singleton id: 'default') */
export interface BetaFeedbackPrompt {
  id: 'default'
  firstOpenAt?: string
  sessionCount: number
  lastShownAt?: string
  dismissedUntil?: string
  submittedAt?: string
  /** Haven Founders Program welcome card acknowledged */
  foundersWelcomeSeenAt?: string
  /** Shipped-feature thank-yous already shown (feature ids) */
  rememberedThanksSeenIds?: string[]
  updatedAt: string
}

export type BetaRecommend = 'yes' | 'maybe' | 'not_yet'
export type BetaNextBuild =
  | 'shopping'
  | 'meals'
  | 'money'
  | 'sync'
  | 'packages'
  | 'other'

/** Help Haven Learn intents — Vision V2 flywheel */
export type HelpHavenIntent = 'love' | 'idea' | 'bug' | 'confused' | 'wish' | 'voice'

export interface BetaFeedbackResponse {
  id?: number
  rating: number
  recommend: BetaRecommend
  intent?: HelpHavenIntent
  pagePath?: string
  workingWell?: string
  confusingBroken?: string
  buildNext?: BetaNextBuild | string
  buildNextNote?: string
  /** True when the note came (at least partly) from Tell Haven voice */
  fromVoice?: boolean
  email?: string
  userId?: string
  createdAt: string
  syncedToCloud?: boolean
}

/** Bathroom / home-care replaceables — quiet lifecycle, not inventory */
export type BathroomReplaceableKind =
  | 'toothbrush'
  | 'brush-head'
  | 'loofah'
  | 'shower-pouf'
  | 'washcloth'
  | 'razor'
  | 'floss'

export interface BathroomReplaceable {
  id?: number
  kind: BathroomReplaceableKind
  label: string
  /** ISO date when the current item started / was last replaced */
  startedAt: string
  /** Typical life in days */
  intervalDays: number
  notes?: string
  createdAt: string
  updatedAt: string
}

class HavenDatabase extends Dexie {
  tasks!: EntityTable<Task, 'id'>
  bills!: EntityTable<Bill, 'id'>
  pantryItems!: EntityTable<PantryItem, 'id'>
  inventoryEvents!: EntityTable<InventoryEvent, 'id'>
  meals!: EntityTable<Meal, 'id'>
  healthEntries!: EntityTable<HealthEntry, 'id'>
  mindCheckIns!: EntityTable<MindCheckIn, 'id'>
  vehicles!: EntityTable<Vehicle, 'id'>
  pets!: EntityTable<Pet, 'id'>
  relationshipNotes!: EntityTable<RelationshipNote, 'id'>
  relationshipIdeas!: EntityTable<RelationshipIdea, 'id'>
  relationshipMemories!: EntityTable<RelationshipMemory, 'id'>
  scratchCardStates!: EntityTable<ScratchCardState, 'id'>
  goals!: EntityTable<Goal, 'id'>
  villageProgress!: EntityTable<VillageProgress, 'id'>
  userProfile!: EntityTable<UserProfile, 'id'>
  lifeProfile!: EntityTable<LifeProfile, 'id'>
  lifeMemories!: EntityTable<LifeMemory, 'id'>
  celebrationMemories!: EntityTable<CelebrationMemory, 'id'>
  householdMemories!: EntityTable<HouseholdMemory, 'id'>
  encouragements!: EntityTable<Encouragement, 'id'>
  coupons!: EntityTable<Coupon, 'id'>
  groceryList!: EntityTable<GroceryListItem, 'id'>
  budgets!: EntityTable<Budget, 'id'>
  transactions!: EntityTable<Transaction, 'id'>
  receipts!: EntityTable<Receipt, 'id'>
  fundEntries!: EntityTable<FundEntry, 'id'>
  savingsGoals!: EntityTable<SavingsGoal, 'id'>
  savingsDeposits!: EntityTable<SavingsDeposit, 'id'>
  petSupplies!: EntityTable<PetSupply, 'id'>
  petExpenses!: EntityTable<PetExpense, 'id'>
  petAppointments!: EntityTable<PetAppointment, 'id'>
  petVaccinations!: EntityTable<PetVaccination, 'id'>
  petCareChecklists!: EntityTable<PetCareChecklist, 'id'>
  petHealthNotes!: EntityTable<PetHealthNote, 'id'>
  recipes!: EntityTable<Recipe, 'id'>
  recipeFeedback!: EntityTable<RecipeFeedback, 'id'>
  adultingProgress!: EntityTable<AdultingProgress, 'id'>
  adultingYouTubeLinks!: EntityTable<AdultingYouTubeLink, 'id'>
  householdTasks!: EntityTable<HouseholdTask, 'id'>
  householdChallenges!: EntityTable<HouseholdChallenge, 'id'>
  pregnancyProfile!: EntityTable<PregnancyProfile, 'id'>
  pregnancyAppointments!: EntityTable<PregnancyAppointment, 'id'>
  sonogramPhotos!: EntityTable<SonogramPhoto, 'id'>
  pregnancyJournalEntries!: EntityTable<PregnancyJournalEntry, 'id'>
  lifeMilestones!: EntityTable<LifeMilestone, 'id'>
  lifeAppointments!: EntityTable<LifeAppointment, 'id'>
  vehicleMaintenanceTasks!: EntityTable<VehicleMaintenanceTask, 'id'>
  careerProfile!: EntityTable<CareerProfile, 'id'>
  careerGoals!: EntityTable<CareerGoal, 'id'>
  careerProgress!: EntityTable<CareerProgress, 'id'>
  partnerProfile!: EntityTable<PartnerProfile, 'id'>
  ledgerEntries!: EntityTable<LedgerEntry, 'id'>
  financialAuditLog!: EntityTable<FinancialAuditLog, 'id'>
  opportunityPlans!: EntityTable<OpportunityPlan, 'id'>
  observations!: EntityTable<Observation, 'id'>
  learningProfiles!: EntityTable<LearningProfile, 'id'>
  intelligenceCache!: EntityTable<IntelligenceCache, 'id'>
  mealLearning!: EntityTable<MealLearningEntry, 'id'>
  mealRatings!: EntityTable<MealRating, 'id'>
  pantryChallenge!: EntityTable<PantryChallengeEntry, 'id'>
  priceHistory!: EntityTable<PriceHistory, 'id'>
  dealAlerts!: EntityTable<DealAlert, 'id'>
  savingsRecords!: EntityTable<SavingsRecord, 'id'>
  shoppingTrips!: EntityTable<ShoppingTrip, 'id'>
  lifeContexts!: EntityTable<LifeContext, 'id'>
  lifeMoments!: EntityTable<LifeMoment, 'id'>
  storyMemories!: EntityTable<StoryMemory, 'id'>
  gratitudeEntries!: EntityTable<GratitudeEntry, 'id'>
  forgeProgress!: EntityTable<ForgeProgress, 'id'>
  forgeProfile!: EntityTable<ForgeProfile, 'id'>
  forgeAchievements!: EntityTable<ForgeAchievement, 'id'>
  villageQuestions!: EntityTable<VillageQuestion, 'id'>
  villageSavedTips!: EntityTable<VillageSavedTip, 'id'>
  villageChallengeProgress!: EntityTable<VillageChallengeProgress, 'id'>
  villageCelebrations!: EntityTable<VillageCelebration, 'id'>
  userVillageProfile!: EntityTable<UserVillageProfile, 'id'>
  villageWorldState!: EntityTable<VillageWorldState, 'id'>
  villageDailyActivity!: EntityTable<VillageDailyActivityEntry, 'id'>
  villageDiscoveries!: EntityTable<VillageDiscovery, 'id'>
  intelligenceImpact!: EntityTable<IntelligenceImpact, 'id'>
  financialAuditCache!: EntityTable<FinancialAuditCache, 'id'>
  subscriptionPriceHistory!: EntityTable<SubscriptionPriceHistory, 'id'>
  financialLeakRecords!: EntityTable<FinancialLeakRecord, 'id'>
  goalImpactLog!: EntityTable<GoalImpactLog, 'id'>
  financialHealthSnapshots!: EntityTable<FinancialHealthSnapshot, 'id'>
  simulatorPresets!: EntityTable<SimulatorPreset, 'id'>
  shoppingIntelligenceCache!: EntityTable<ShoppingIntelligenceCache, 'id'>
  priceMemory!: EntityTable<PriceMemoryRecord, 'id'>
  purchasePatterns!: EntityTable<PurchasePattern, 'id'>
  householdSupply!: EntityTable<HouseholdSupplyRecord, 'id'>
  receiptLearnings!: EntityTable<ReceiptLearning, 'id'>
  tripPlans!: EntityTable<TripPlan, 'id'>
  homeReliefCache!: EntityTable<HomeReliefCache, 'id'>
  commandCenterCache!: EntityTable<CommandCenterCache, 'id'>
  householdPreferences!: EntityTable<HouseholdPreferenceRecord, 'id'>
  lastHomeVisitSnapshot!: EntityTable<LastHomeVisitSnapshot, 'id'>
  householdConfidenceHistory!: EntityTable<HouseholdConfidenceHistory, 'id'>
  connectionPreferences!: EntityTable<ConnectionPreference, 'id'>
  connectedDeliveries!: EntityTable<ConnectedDelivery, 'id'>
  connectedGroceryOrders!: EntityTable<ConnectedGroceryOrder, 'id'>
  handledItemsCache!: EntityTable<HandledItemsCache, 'id'>
  timelineEvents!: EntityTable<TimelineEvent, 'id'>
  timelineSnapshots!: EntityTable<TimelineSnapshot, 'id'>
  householdContinuityDocs!: EntityTable<HouseholdContinuityDoc, 'id'>
  preparednessSnapshot!: EntityTable<PreparednessSnapshot, 'id'>
  whatIfResultsCache!: EntityTable<WhatIfResultCache, 'id'>
  scanSessions!: EntityTable<ScanSession, 'id'>
  scanSessionItems!: EntityTable<ScanSessionItem, 'id'>
  backgroundTasksLog!: EntityTable<BackgroundTasksLog, 'id'>
  chatMessages!: EntityTable<ChatMessageRecord, 'id'>
  syncQueue!: EntityTable<SyncQueueEntry, 'id'>
  syncMeta!: EntityTable<SyncMetaRecord, 'id'>
  betaFeedbackPrompt!: EntityTable<BetaFeedbackPrompt, 'id'>
  betaFeedbackResponses!: EntityTable<BetaFeedbackResponse, 'id'>
  bathroomReplaceables!: EntityTable<BathroomReplaceable, 'id'>

  constructor() {
    super('HavenDB')
    this.version(1).stores({
      tasks: '++id, category, completed, dueDate, priority',
      bills: '++id, dueDay, paid, category',
      pantryItems: '++id, location, name, expirationDate',
      meals: '++id, day, mealType',
      healthEntries: '++id, date',
      vehicles: '++id, name',
      pets: '++id, name',
      relationshipNotes: '++id, date, type',
      goals: '++id, category, progress',
      villageProgress: '++id, area, level',
      userProfile: '++id',
      encouragements: '++id, date, shown',
    })
    this.version(2).stores({
      coupons: '++id, store, expirationDate, used, barcode, source',
      groceryList: '++id, name, checked, category',
    })
    this.version(3).stores({
      budgets: '++id, category, month',
      transactions: '++id, category, date, isImpulse, source',
    })
    this.version(4).stores({
      receipts: '++id, store, date, category, transactionId',
    })
    this.version(5).stores({
      coupons: '++id, store, expirationDate, used, barcode, source, createdAt',
      groceryList: '++id, name, checked, category, addedAt',
      transactions: '++id, category, date, isImpulse, source',
    })
    this.version(6).stores({
      fundEntries: '++id, date, kind, createdAt',
    })
    this.version(7).stores({
      petSupplies: '++id, supplyType, name, purchaseDate, petId',
      petExpenses: '++id, expenseType, date, petId, receiptId',
    })
    this.version(8).stores({
      pantryItems: '++id, location, name, expirationDate, barcode',
    })
    this.version(9).stores({
      recipes: '++id, name, mealType, createdAt',
    })
    this.version(10).stores({
      mindCheckIns: '++id, date, timeOfDay, createdAt',
    })
    this.version(11).stores({
      lifeProfile: '++id, setupComplete, updatedAt',
      lifeMemories: '++id, key, category, source, createdAt',
    })
    this.version(12).stores({
      lifeProfile: '++id, setupComplete, updatedAt',
    })
    this.version(13).stores({
      adultingProgress: '++id, updatedAt',
    })
    this.version(14).stores({
      savingsGoals: '++id, name, createdAt, updatedAt, deadline',
      savingsDeposits: '++id, savingsGoalId, date, source, createdAt',
    })
    this.version(15).stores({
      transactions: '++id, category, date, isImpulse, source, billId',
    })
    this.version(16).stores({
      householdTasks: '++id, zone, category, frequency, nextDue, active, templateId',
    })
    this.version(17).stores({
      pets: '++id, name, type',
    }).upgrade(tx => {
      return tx.table('pets').toCollection().modify(pet => {
        const type = normalizePetType(pet.type ?? pet.species)
        pet.type = type
        pet.species = type
        if (!pet.breed) pet.breed = undefined
        if (!pet.visualKey) {
          pet.visualKey = getPetVisualKey(type, pet.breed)
        }
      })
    })
    this.version(18).stores({
      pregnancyProfile: '++id, babyBorn, updatedAt',
      pregnancyAppointments: '++id, date, type, reminder',
      sonogramPhotos: '++id, date, week, createdAt',
    })
    this.version(19).stores({
      pregnancyProfile: '++id, babyBorn, pregnancyOutcome, supportModeActive, updatedAt',
      pregnancyAppointments: '++id, date, type, reminder',
      sonogramPhotos: '++id, date, week, createdAt',
    }).upgrade(tx => {
      return tx.table('pregnancyProfile').toCollection().modify(profile => {
        if (!profile.pregnancyOutcome) {
          profile.pregnancyOutcome = profile.babyBorn ? 'born' : 'active'
        }
        if (profile.supportModeActive === undefined) {
          profile.supportModeActive = false
        }
        if (profile.supportDailyMessage === undefined) {
          profile.supportDailyMessage = true
        }
      })
    })
    this.version(20).stores({
      pregnancyJournalEntries: '++id, date, weekAtEntry, isGriefEntry, createdAt',
    })
    this.version(21).stores({
      lifeMilestones: '++id, date, category, sourceModule, isAuto, createdAt',
      lifeAppointments: '++id, date, type, reminder, createdAt',
    })
    this.version(22).stores({
      relationshipIdeas: '++id, createdAt',
      relationshipMemories: '++id, date, kind, createdAt',
      scratchCardStates: '++id, ideaId, revealed, savedToTry',
    })
    this.version(23).stores({
      adultingYouTubeLinks: '++id, category, addedAt',
    })
    this.version(24).stores({
      vehicleMaintenanceTasks: '++id, vehicleId, taskType, nextDueDate, nextDueMileage, active, completed',
    })
    this.version(25).stores({
      petAppointments: '++id, petId, date, type, reminder, completed, lifeAppointmentId',
      petVaccinations: '++id, petId, dateGiven, nextDue',
      petCareChecklists: '++id, petId, itemId, category, frequency',
      petHealthNotes: '++id, petId, updatedAt',
    })
    this.version(26).stores({
      careerProfile: '++id, updatedAt',
      careerGoals: '++id, targetDate, completed, createdAt',
      careerProgress: '++id, updatedAt',
    })
    this.version(27).stores({
      partnerProfile: '++id, updatedAt',
    })
    this.version(28).stores({
      recipes: '++id, name, mealType, createdAt',
    }).upgrade(tx => {
      return tx.table('recipes').toCollection().modify(recipe => {
        if (!recipe.directions) recipe.directions = []
      })
    })
    this.version(29).stores({
      recipes: '++id, name, mealType, createdAt',
    })
    this.version(30).stores({
      recipes: '++id, name, mealType, category, createdAt',
    }).upgrade(tx => {
      return tx.table('recipes').toCollection().modify(recipe => {
        if (!recipe.category) {
          recipe.category = 'misc'
        }
      })
    })
    this.version(31).stores({
      recipes: '++id, name, mealType, category, createdAt',
    }).upgrade(tx => {
      return tx.table('recipes').toCollection().modify(recipe => {
        if (!recipe.applianceTags) recipe.applianceTags = []
      })
    })
    this.version(32).stores({
      recipes: '++id, name, mealType, category, createdAt',
      recipeFeedback: '++id, recipeId, cookedAt, rating',
    })
    this.version(33).stores({
      ledgerEntries: '++id, type, account, source, sourceId, status, date, createdAt',
      financialAuditLog: '++id, timestamp, userAction, linkedLedgerEntryId',
      savingsGoals: '++id, name, createdAt, updatedAt, deadline, completedAt',
    }).upgrade(tx => {
      return tx.table('savingsGoals').toCollection().modify(goal => {
        if (!goal.icon) goal.icon = pickDefaultGoalIcon(goal.name)
        if (!goal.color) goal.color = pickDefaultGoalColor(goal.name)
        if (!goal.celebratedMilestones) goal.celebratedMilestones = []
      })
    })
    this.version(34).stores({
      opportunityPlans: '++id, opportunityId, goalId, active, createdAt',
    })
    this.version(35).stores({
      observations: '++id, sourceKey, module, category, priority, resolved, dismissed, createdAt, expiresAt',
      learningProfiles: '++id, key, category, updatedAt',
      intelligenceCache: '++id, cacheKey, updatedAt',
    })
    this.version(36).stores({
      pantryItems: '++id, location, name, expirationDate, barcode, lifecycleStage, storageLocation',
      inventoryEvents: '++id, itemId, type, createdAt',
    }).upgrade(tx => {
      return tx.table('pantryItems').toCollection().modify(item => {
        if (!item.storageLocation) {
          item.storageLocation = locationToStorage(item.location)
        }
        if (!item.lifecycleStage) {
          item.lifecycleStage = inferLifecycleStage(item)
        }
        if (!item.expirationConfidence) {
          item.expirationConfidence = item.expirationDate ? 'estimated' : 'unknown'
        }
      })
    })
    this.version(37).stores({
      mealLearning: '++id, recipeKey, updatedAt',
      pantryChallenge: '++id, weekStart, active',
    })
    this.version(38).stores({
      priceHistory: '++id, productName, store, recordedAt, source',
      dealAlerts: '++id, store, productName, recommendation, dismissed, createdAt',
      savingsRecords: '++id, type, createdAt, store',
      shoppingTrips: '++id, plannedDate, completed',
      coupons: '++id, store, expirationDate, used, barcode, source, createdAt, walletCategory',
    })
    this.version(39).stores({
      lifeContexts: '++id, type, active, manual, startDate, endDate',
      lifeMoments: '++id, type, date, createdAt',
    })
    this.version(40).stores({
      coupons: '++id, store, expirationDate, used, barcode, source, createdAt, walletCategory, couponType, productName, brand, parseConfidence',
    }).upgrade(async tx => {
      const { reparseCouponFromRaw } = await import('../lib/couponIntelligenceParser')
      await tx.table('coupons').toCollection().modify((coupon: Coupon) => {
        if (coupon.parseConfidence != null) return
        const raw = coupon.rawOcrText ?? coupon.rawText
        if (!raw?.trim()) return
        const result = reparseCouponFromRaw(coupon)
        if (!result) return
        const s = result.structured
        coupon.savingsAmount = s.savingsAmount
        coupon.percentOff = s.percentOff
        coupon.buyXGetY = s.buyXGetY
        coupon.productName = s.productName
        coupon.brand = s.brand
        coupon.category = s.category
        coupon.requiredQuantity = s.requiredQuantity
        coupon.sizeWeight = s.sizeWeight
        coupon.couponType = s.couponType
        coupon.storeName = s.storeName
        coupon.couponCode = s.couponCode
        coupon.termsConditions = s.termsConditions
        coupon.rawOcrText = s.rawOcrText
        coupon.parseConfidence = s.parseConfidence
        coupon.parsedAt = s.parsedAt
        if (!coupon.walletCategory || coupon.walletCategory === 'paper') {
          const type = s.couponType
          if (type === 'manufacturer') coupon.walletCategory = 'manufacturer'
          else if (type === 'store') coupon.walletCategory = 'store'
          else if (type === 'digital') coupon.walletCategory = 'digital'
        }
        if (s.productName && (!coupon.title || coupon.title === 'Scanned coupon')) {
          coupon.title = result.legacy.title ?? coupon.title
        }
        if (s.storeName && coupon.store === 'General') {
          coupon.store = s.storeName
        }
      })
    })
    this.version(41).stores({
      householdChallenges: '++id, weekStart, active, challengeId',
    })
    this.version(42).stores({
      celebrationMemories: '++id, type, date, source, createdAt',
      householdMemories: '++id, type, key, source, learnedAt',
    })
    this.version(43).stores({
      storyMemories: '++id, date, chapter, sourceModule, sourceId, autoGenerated, createdAt',
      gratitudeEntries: '++id, date, createdAt',
      lifeMoments: '++id, type, date, chapter, createdAt',
      lifeMilestones: '++id, date, category, chapter, sourceModule, isAuto, createdAt',
    })
    this.version(44).stores({
      forgeProgress: '++id, buildId, startedAt, completedAt',
      forgeProfile: 'id',
      forgeAchievements: 'id, status, buildId',
    })
    this.version(45).stores({
      villageQuestions: '++id, category, createdAt',
      villageSavedTips: '++id, sourceQuestionId, savedAt',
      villageChallengeProgress: '++id, challengeId, joinedAt',
      villageCelebrations: '++id, createdAt',
      userVillageProfile: 'id',
    })
    this.version(46).stores({
      villageWorldState: 'id',
      villageDailyActivity: '++id, date, buildingId, createdAt',
      villageDiscoveries: 'id, unlockedAt, buildingId',
    })
    this.version(47).stores({
      intelligenceImpact: '++id, monthKey, updatedAt',
    })
    this.version(48).stores({
      mealRatings: '++id, recipeId, recipeName, cookedAt, rating, source',
    })
    this.version(49).stores({
      financialAuditCache: '++id, computedAt',
      subscriptionPriceHistory: '++id, name, recordedAt',
      financialLeakRecords: '++id, type, detectedAt',
      goalImpactLog: '++id, date, goalId',
      financialHealthSnapshots: '++id, date, overall',
      simulatorPresets: '++id, label, category',
    })
    this.version(50).stores({
      shoppingIntelligenceCache: 'id, computedAt',
      priceMemory: 'id, itemName, store, recordedAt',
      purchasePatterns: '++id, itemName, lastPurchase, store',
      householdSupply: 'id, itemName, daysRemaining',
      receiptLearnings: 'id, itemName, updatedAt',
      tripPlans: 'id, date, store',
    })
    this.version(51).stores({
      homeReliefCache: 'id, computedAt',
    })
    this.version(52).stores({
      householdPreferences: 'id, key, learnedAt',
      lastHomeVisitSnapshot: 'id, visitedAt',
      householdConfidenceHistory: '++id, date, score',
    })
    this.version(53).stores({
      connectionPreferences: 'id, serviceId, optedIn, notifyWhenAvailable',
      connectedDeliveries: '++id, carrier, retailer, status, etaStart, createdAt',
      connectedGroceryOrders: '++id, store, expectedArrival, importedToPantry, createdAt',
      handledItemsCache: 'id, computedAt',
    })
    this.version(54).stores({
      timelineEvents: '++id, timestamp, date, category, source, entityId, entityType',
      timelineSnapshots: '++id, date',
      householdContinuityDocs: '++id, category, updatedAt',
    })
    this.version(55).stores({
      preparednessSnapshot: 'id, date, computedAt',
      whatIfResultsCache: 'id, scenarioId, computedAt',
      scanSessions: '++id, startedAt, store',
      scanSessionItems: '++id, sessionId, barcode, scannedAt',
      backgroundTasksLog: 'id, date, computedAt',
    })
    this.version(56).stores({
      commandCenterCache: 'id, computedAt',
    })
    this.version(57).stores({
      chatMessages: '++id, role, createdAt',
    })
    this.version(58).stores({
      syncQueue: '++id, tableName, recordId, updatedAt, createdAt',
      syncMeta: 'id, updatedAt',
      bills: '++id, dueDay, paid, category, updatedAt, syncStatus',
      pantryItems: '++id, location, name, expirationDate, barcode, lifecycleStage, storageLocation, updatedAt, syncStatus',
      groceryList: '++id, name, checked, category, addedAt, updatedAt, syncStatus',
      mealRatings: '++id, recipeId, recipeName, cookedAt, rating, source, updatedAt, syncStatus',
      lifeProfile: '++id, setupComplete, updatedAt, syncStatus',
      householdPreferences: 'id, key, learnedAt, updatedAt, syncStatus',
      connectionPreferences: 'id, serviceId, optedIn, notifyWhenAvailable, updatedAt, syncStatus',
      timelineEvents: '++id, timestamp, date, category, source, entityId, entityType, updatedAt, syncStatus',
    })
    this.version(59).stores({
      betaFeedbackPrompt: 'id, updatedAt',
      betaFeedbackResponses: '++id, createdAt, rating, syncedToCloud',
    })
    this.version(60).stores({
      bathroomReplaceables: '++id, kind, startedAt, updatedAt',
    })
  }
}

function locationToStorage(location: PantryItem['location']): StorageLocation {
  switch (location) {
    case 'fridge': return 'refrigerator'
    case 'spice': return 'spices'
    case 'baking': return 'baking'
    case 'snacks': return 'snacks'
    case 'drinks': return 'drinks'
    case 'pet-food': return 'pet-food'
    case 'freezer': return 'freezer'
    default: return 'pantry'
  }
}

function inferLifecycleStage(item: PantryItem): LifecycleStage {
  if (item.quantity <= 0) return 'used'
  if (item.location === 'freezer') return 'frozen'
  if (item.quantity <= item.lowStockThreshold) return 'running-low'
  if (item.expirationDate) {
    const exp = new Date(item.expirationDate)
    const now = new Date()
    if (exp < now) return 'expired'
    const days = Math.ceil((exp.getTime() - now.getTime()) / 86400000)
    if (days <= 7) return 'use-soon'
  }
  return 'stored'
}

function pickDefaultGoalIcon(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('emergency')) return '🛡'
  if (lower.includes('house') || lower.includes('home')) return '🏡'
  if (lower.includes('vehicle') || lower.includes('car')) return '🚗'
  if (lower.includes('christmas') || lower.includes('holiday')) return '🎄'
  if (lower.includes('vacation') || lower.includes('travel')) return '✈️'
  if (lower.includes('education') || lower.includes('school')) return '🎓'
  if (lower.includes('wedding')) return '💍'
  if (lower.includes('family')) return '❤️'
  return '✨'
}

function pickDefaultGoalColor(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('emergency')) return '#4a6741'
  if (lower.includes('house') || lower.includes('home')) return '#6b8f71'
  if (lower.includes('vehicle') || lower.includes('car')) return '#5a7a9a'
  if (lower.includes('christmas') || lower.includes('holiday')) return '#c45c4a'
  if (lower.includes('vacation') || lower.includes('travel')) return '#4a8a9a'
  if (lower.includes('education') || lower.includes('school')) return '#8a6b9a'
  if (lower.includes('wedding')) return '#c4a35a'
  return '#8a9a7b'
}

export const db = new HavenDatabase()

export async function seedInitialData() {
  const profileCount = await db.userProfile.count()
  if (profileCount > 0) return

  await db.userProfile.add({
    name: '',
    greeting: 'Welcome Home.',
    onboardingComplete: false,
    createdAt: new Date().toISOString(),
  })

  const villageAreas: VillageProgress['area'][] = [
    'bank', 'garden', 'library', 'town-square', 'community-center', 'family-home',
  ]
  for (const area of villageAreas) {
    await db.villageProgress.add({
      area,
      level: 1,
      lastUpdated: new Date().toISOString(),
    })
  }

  const encouragements = [
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
  ]

  const today = new Date().toISOString().split('T')[0]
  for (const message of encouragements) {
    await db.encouragements.add({ message, shown: false, date: today })
  }

  const month = today.slice(0, 7)
  const defaultBudgets = [
    { category: 'Groceries', monthlyLimit: 600 },
    { category: 'Dining Out', monthlyLimit: 150 },
    { category: 'Entertainment', monthlyLimit: 100 },
    { category: 'Shopping', monthlyLimit: 200 },
    { category: 'Transportation', monthlyLimit: 250 },
    { category: 'Healthcare', monthlyLimit: 100 },
  ]
  for (const b of defaultBudgets) {
    await db.budgets.add({ ...b, month })
  }
}
