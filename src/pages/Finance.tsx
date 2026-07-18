import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { BETA_BANNER_COPY, isBetaSimplifiedUi } from '../lib/betaFeatures'
import { db, type Bill } from '../db/database'
import { useBills, useBudgets, useTransactions, useFundEntries, useSavingsGoals, useSavingsDeposits, useLedgerEntries, useOpportunityPlans, useUserProfile } from '../hooks/useHavenData'
import { MoneyAssistantHero } from '../components/finance/MoneyAssistantHero'
import { useScrollToTopOnChange } from '../hooks/useScrollToTopOnChange'
import { ensureMonthlyBudgets } from '../lib/ensureBudgets'
import {
  calculateBudgetStatus,
  calculateFinancialHealth,
  generateFinanceInsights,
  getImpulseQuestion,
  getMonthSpendingByCategory,
} from '../lib/financeCoach'
import { buildSpendingMonitorSummary, getWeeklySpending } from '../lib/spendingMonitor'
import { summarizeMonthFunds } from '../lib/fundBalance'
import {
  calculateAvailableFunds,
  calculateNetWorth,
} from '../lib/financialEngine'
import { buildFinancialTimeline } from '../lib/financialTimeline'
import { computeMoneyProtected, computeSavingsAnalytics, getMonthlySpending, getSavingsProgress } from '../lib/savingsAnalytics'
import { createIncome, createAdjustment, createExpense, cancelLedgerEntry } from '../lib/ledgerService'
import { generateSavingsInsights } from '../lib/savingsInsights'
import { addSavingsDeposit, deleteSavingsGoal, createSavingsGoal } from '../lib/savingsGoals'
import { getNewMilestones, PURPOSE_CHIPS } from '../lib/savingsMilestones'
import { SavingsGoalCard } from '../components/SavingsGoalCard'
import { MoneyOpportunitiesSection } from '../components/MoneyOpportunitiesSection'
import { SavingsScreenshotScanner, SavingsDepositConfirm } from '../components/SavingsScreenshotScanner'
import type { SavingsScanResult } from '../components/SavingsScreenshotScanner'
import { PurposeTransferModal } from '../components/PurposeTransferModal'
import { MilestoneCelebration } from '../components/MilestoneCelebration'
import { FinancialTimelineCard } from '../components/FinancialTimelineCard'
import type { SavingsMilestone } from '../lib/savingsMilestones'
import {
  BILL_CATEGORIES,
  BILL_FREQUENCY_LABELS,
  formatBillDueLabel,
  getMonthlyBillsTotal,
  isBillOverdue,
  sortBillsByDueDate,
  type BillFrequency,
} from '../lib/billSchedule'
import {
  BILL_CSV_ACCEPT,
  downloadBillCsvTemplate,
  parseBillsCsv,
  parsedRowsToBills,
  type BillImportResult,
} from '../lib/billImport'
import {
  canMarkBillPaid,
  getPaidBillsTotal,
  getUnpaidBillsTotal,
  isBillPaidThisCycle,
  payBill,
  unpayBill,
} from '../lib/billPayment'
import { ReceiptScanner, ReceiptReview, type ReceiptScanResult, type ReceiptSaveData } from '../components/ReceiptScanner'
import { addReceiptItemsToPantry } from '../lib/pantryAutomation'
import { recordPricesFromReceipt } from '../lib/buyingIntelligence/priceHistory'
import hbi from '../lib/buyingIntelligence/hbi'
import { addReceiptItemsToPetSupplies, addReceiptVetExpenses } from '../lib/petCareAutomation'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import buttonStyles from '../components/Button.module.css'
import { PageHeader } from '../components/PageHeader'
import { ActionMenu } from '../components/ui/ActionMenu'
import { ResponsiveTabs } from '../components/ui/MobileTabSelect'
import { FilterDropdown } from '../components/ui/FilterDropdown'
import { SectionToggle } from '../components/ui/SectionToggle'
import { CompactCard } from '../components/ui/CompactCard'
import { FinancialIntelligenceDashboard } from '../components/financialIntelligence/FinancialIntelligenceDashboard'
import { useFinancialIntelligence } from '../hooks/useFinancialIntelligence'
import { openAskHaven } from '../lib/havenChat'
import styles from './Finance.module.css'
import listStyles from './ModulePage.module.css'

const TX_CATEGORIES = ['Groceries', 'Pet Care', 'Dining Out', 'Entertainment', 'Shopping', 'Transportation', 'Healthcare', 'Bills', 'Savings', 'Other']

export function Finance() {
  const bills = useBills()
  const budgets = useBudgets()
  const transactions = useTransactions()
  const fundEntries = useFundEntries()
  const savingsGoals = useSavingsGoals()
  const savingsDeposits = useSavingsDeposits()
  const ledgerEntries = useLedgerEntries()
  const opportunityPlans = useOpportunityPlans()
  const profile = useUserProfile()
  const [searchParams] = useSearchParams()
  const month = format(new Date(), 'yyyy-MM')

  const { brief: fiBrief, loading: fiLoading, refresh: refreshFI } = useFinancialIntelligence()
  const beta = isBetaSimplifiedUi()

  useEffect(() => { ensureMonthlyBudgets() }, [])
  useEffect(() => {
    const t = searchParams.get('tab')
    if (t === 'savings') setTab('savings')
    if (t === 'opportunities') setTab(beta ? 'intelligence' : 'opportunities')
    if (t === 'overview') setTab(beta ? 'bills' : 'overview')
    if (t === 'bills') setTab('bills')
    if (t === 'intelligence') setTab('intelligence')
    if (t === 'watch' && beta) setTab('bills')
    if (t === 'coach' && beta) setTab('intelligence')
    if (t === 'spending' && beta) setTab('bills')
  }, [searchParams, beta])

  const [tab, setTab] = useState<'intelligence' | 'overview' | 'bills' | 'watch' | 'budget' | 'spending' | 'savings' | 'opportunities' | 'coach'>(
    () => (isBetaSimplifiedUi() ? 'bills' : 'intelligence'),
  )
  const [billFilter, setBillFilter] = useState<'all' | 'unpaid' | 'paid' | 'overdue'>(
    () => (isBetaSimplifiedUi() ? 'unpaid' : 'all'),
  )
  const [txSort, setTxSort] = useState<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'>('date-desc')
  useScrollToTopOnChange(tab)
  const [showBillForm, setShowBillForm] = useState(false)
  const [showTxForm, setShowTxForm] = useState(false)
  const [showBudgetForm, setShowBudgetForm] = useState(false)
  const [showImpulseModal, setShowImpulseModal] = useState(false)
  const [showReceiptScanner, setShowReceiptScanner] = useState(false)
  const [receiptReview, setReceiptReview] = useState<ReceiptScanResult | null>(null)
  const [receiptPantryMessage, setReceiptPantryMessage] = useState<string | null>(null)

  // Bill form
  const [billName, setBillName] = useState('')
  const [billAmount, setBillAmount] = useState('')
  const [billDueDate, setBillDueDate] = useState(() => new Date().toISOString().split('T')[0])
  const [billCategory, setBillCategory] = useState<string>(BILL_CATEGORIES[0])
  const [billFrequency, setBillFrequency] = useState<BillFrequency>('monthly')
  const [billNotes, setBillNotes] = useState('')
  const [billImportPreview, setBillImportPreview] = useState<BillImportResult | null>(null)
  const [billImportMessage, setBillImportMessage] = useState<string | null>(null)
  const [billPaymentMessage, setBillPaymentMessage] = useState<string | null>(null)

  // Transaction form
  const [txAmount, setTxAmount] = useState('')
  const [txCategory, setTxCategory] = useState('Shopping')
  const [txDesc, setTxDesc] = useState('')
  const [txStore, setTxStore] = useState('')
  const [txIsImpulse, setTxIsImpulse] = useState(false)

  // Budget form
  const [budgetCategory, setBudgetCategory] = useState('Groceries')
  const [budgetLimit, setBudgetLimit] = useState('')

  // Funds form
  const [showFundForm, setShowFundForm] = useState(false)
  const [fundAmount, setFundAmount] = useState('')
  const [fundDate, setFundDate] = useState(() => new Date().toISOString().split('T')[0])
  const [fundKind, setFundKind] = useState<'income' | 'credit'>('income')

  // Savings
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [goalName, setGoalName] = useState('')
  const [goalTarget, setGoalTarget] = useState('')
  const [goalDeadline, setGoalDeadline] = useState('')
  const [goalNotes, setGoalNotes] = useState('')
  const [depositGoalId, setDepositGoalId] = useState<number | null>(null)
  const [showManualDeposit, setShowManualDeposit] = useState(false)
  const [depositAmount, setDepositAmount] = useState('')
  const [depositNote, setDepositNote] = useState('')
  const [depositDate, setDepositDate] = useState(() => new Date().toISOString().split('T')[0])
  const [showSavingsScanner, setShowSavingsScanner] = useState(false)
  const [savingsScanResult, setSavingsScanResult] = useState<SavingsScanResult | null>(null)
  const [showPurposeTransfer, setShowPurposeTransfer] = useState(false)
  const [pendingTransferAmount, setPendingTransferAmount] = useState(0)
  const [celebration, setCelebration] = useState<{ milestone: SavingsMilestone; goalName: string } | null>(null)

  const budgetStatus = useMemo(
    () => calculateBudgetStatus(budgets ?? [], transactions ?? [], month),
    [budgets, transactions, month]
  )
  const health = useMemo(
    () => calculateFinancialHealth(budgetStatus, transactions ?? [], bills ?? [], month),
    [budgetStatus, transactions, bills, month]
  )
  const insights = useMemo(
    () => generateFinanceInsights(budgetStatus, transactions ?? [], month),
    [budgetStatus, transactions, month]
  )
  const spendingByCategory = useMemo(
    () => getMonthSpendingByCategory(transactions ?? [], month),
    [transactions, month]
  )
  const spendingMonitor = useMemo(
    () => buildSpendingMonitorSummary(transactions ?? [], budgets ?? [], month),
    [transactions, budgets, month]
  )
  const weeklySpending = useMemo(
    () => getWeeklySpending(transactions ?? [], month),
    [transactions, month]
  )
  const fundSummary = useMemo(
    () => summarizeMonthFunds(fundEntries ?? [], transactions ?? [], month, ledgerEntries ?? []),
    [fundEntries, transactions, month, ledgerEntries],
  )
  const timeline = useMemo(
    () => buildFinancialTimeline(ledgerEntries ?? [], month, transactions ?? []),
    [ledgerEntries, month, transactions],
  )
  const moneyProtected = useMemo(
    () => computeMoneyProtected(ledgerEntries ?? [], savingsGoals ?? [], month),
    [ledgerEntries, savingsGoals, month],
  )
  const savingsAnalytics = useMemo(
    () => computeSavingsAnalytics(ledgerEntries ?? [], savingsGoals ?? [], month),
    [ledgerEntries, savingsGoals, month],
  )
  const monthlySpending = useMemo(
    () => getMonthlySpending(ledgerEntries ?? [], month),
    [ledgerEntries, month],
  )
  const savingsProgress = useMemo(
    () => getSavingsProgress(savingsGoals ?? []),
    [savingsGoals],
  )
  const netWorth = useMemo(
    () => calculateNetWorth(ledgerEntries ?? []),
    [ledgerEntries],
  )
  const availableFunds = useMemo(
    () => calculateAvailableFunds(ledgerEntries ?? []),
    [ledgerEntries],
  )
  const savingsInsights = useMemo(
    () => generateSavingsInsights(budgetStatus, savingsGoals ?? []),
    [budgetStatus, savingsGoals]
  )
  const savingsTotals = useMemo(() => savingsProgress, [savingsProgress])
  const sortedBills = useMemo(
    () => sortBillsByDueDate(bills ?? []),
    [bills],
  )
  const monthlyBillsTotal = useMemo(
    () => getMonthlyBillsTotal(bills ?? []),
    [bills],
  )
  const unpaidBills = sortedBills.filter(b => !isBillPaidThisCycle(b))
  const overdueBills = unpaidBills.filter(b => isBillOverdue(b))
  const paidBillsTotal = useMemo(
    () => getPaidBillsTotal(bills ?? []),
    [bills],
  )
  const unpaidBillsTotal = useMemo(
    () => getUnpaidBillsTotal(bills ?? []),
    [bills],
  )
  const filteredBills = useMemo(() => {
    if (billFilter === 'all') return sortedBills
    if (billFilter === 'overdue') return sortedBills.filter(b => isBillOverdue(b))
    if (billFilter === 'paid') return sortedBills.filter(b => isBillPaidThisCycle(b))
    return sortedBills.filter(b => !isBillPaidThisCycle(b))
  }, [sortedBills, billFilter])

  const monthTx = transactions?.filter(t => t.date.startsWith(month)) ?? []
  const sortedMonthTx = useMemo(() => {
    const copy = [...monthTx]
    copy.sort((a, b) => {
      if (txSort === 'amount-desc') return b.amount - a.amount
      if (txSort === 'amount-asc') return a.amount - b.amount
      if (txSort === 'date-asc') return a.date.localeCompare(b.date)
      return b.date.localeCompare(a.date)
    })
    return copy
  }, [monthTx, txSort])
  const monthFunds = fundEntries?.filter(f => f.date.startsWith(month)) ?? []

  async function addBill(e: React.FormEvent) {
    e.preventDefault()
    if (!billName.trim() || !billAmount || !billDueDate) return
    const due = new Date(billDueDate)
    await db.bills.add({
      name: billName.trim(),
      amount: parseFloat(billAmount),
      dueDay: due.getDate(),
      dueDate: billDueDate,
      paid: false,
      category: billCategory,
      recurring: billFrequency !== 'once',
      frequency: billFrequency,
      notes: billNotes.trim() || undefined,
    })
    setBillName('')
    setBillAmount('')
    setBillDueDate(new Date().toISOString().split('T')[0])
    setBillCategory(BILL_CATEGORIES[0])
    setBillFrequency('monthly')
    setBillNotes('')
    setShowBillForm(false)
    setTab('bills')
  }

  async function addTransaction(e: React.FormEvent, paused = false) {
    e.preventDefault()
    if (!txAmount || !txDesc.trim()) return
    const amount = parseFloat(txAmount)
    const date = new Date().toISOString().split('T')[0]
    let ledgerEntryId: number | undefined
    if (!paused) {
      ledgerEntryId = await createExpense(amount, txCategory, {
        description: txDesc.trim(),
        date,
      })
    }
    await db.transactions.add({
      amount,
      category: txCategory,
      description: txDesc.trim(),
      date,
      isImpulse: txIsImpulse,
      impulsePaused: paused,
      store: txStore || undefined,
      ledgerEntryId,
    })
    setTxAmount('')
    setTxDesc('')
    setTxStore('')
    setTxIsImpulse(false)
    setShowTxForm(false)
    setShowImpulseModal(false)
    refreshFI()
  }

  async function addBudget(e: React.FormEvent) {
    e.preventDefault()
    if (!budgetLimit) return
    const existing = budgets?.find(b => b.category === budgetCategory && b.month === month)
    if (existing?.id) {
      await db.budgets.update(existing.id, { monthlyLimit: parseFloat(budgetLimit) })
    } else {
      await db.budgets.add({
        category: budgetCategory,
        monthlyLimit: parseFloat(budgetLimit),
        month,
      })
    }
    setBudgetLimit('')
    setShowBudgetForm(false)
  }

  async function handleMarkPaid(bill: Bill) {
    if (!bill.id || !canMarkBillPaid(bill)) return
    try {
      const { amount } = await payBill(bill)
      setBillPaymentMessage(
        beta
          ? `I’ll remember ${bill.name} as paid ($${amount.toFixed(2)}).`
          : `Paid $${amount.toFixed(2)} for ${bill.name} — deducted from available funds`,
      )
      setBillImportMessage(null)
    } catch {
      setBillPaymentMessage(
        beta
          ? 'Something didn’t go quite as planned. Let’s try again.'
          : 'Could not mark bill as paid. Try again.',
      )
    }
  }

  async function handleUnpay(bill: Bill) {
    if (!bill.id) return
    await unpayBill(bill)
    setBillPaymentMessage(`Undid payment for ${bill.name} — funds restored`)
  }

  async function deleteBill(id: number) {
    await db.bills.delete(id)
  }

  async function handleBillCsvSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    try {
      const text = await file.text()
      const result = parseBillsCsv(text)
      setBillImportPreview(result)
      setBillImportMessage(null)
      setShowBillForm(false)
      setTab('bills')
    } catch {
      setBillImportPreview(null)
      setBillImportMessage('Could not read that file. Save your spreadsheet as CSV and try again.')
    }
  }

  async function confirmBillImport() {
    if (!billImportPreview?.validRows.length) return
    const toAdd = parsedRowsToBills(billImportPreview.validRows)
    await db.bills.bulkAdd(toAdd)
    const count = toAdd.length
    setBillImportPreview(null)
    setBillImportMessage(`✓ Imported ${count} bill${count !== 1 ? 's' : ''} — reminders will show on your briefing`)
    setTab('bills')
  }

  async function deleteTransaction(id: number) {
    const tx = await db.transactions.get(id)
    if (tx?.ledgerEntryId) await cancelLedgerEntry(tx.ledgerEntryId)
    await db.transactions.delete(id)
  }

  async function addFundEntry(e: React.FormEvent) {
    e.preventDefault()
    if (!fundAmount || parseFloat(fundAmount) <= 0) return
    const amount = parseFloat(fundAmount)
    if (fundKind === 'income') {
      await createIncome(amount, 'Funds Added', fundDate)
    } else {
      await createAdjustment(amount, 'Spending Credit', fundDate)
    }
    await db.fundEntries.add({
      amount,
      date: fundDate,
      kind: fundKind,
      createdAt: new Date().toISOString(),
    })
    setFundAmount('')
    setFundDate(new Date().toISOString().split('T')[0])
    setFundKind('income')
    setShowFundForm(false)
  }

  async function deleteFundEntry(id: number) {
    const entry = await db.fundEntries.get(id)
    if (entry) {
      const ledger = (ledgerEntries ?? []).find(
        le => le.status === 'posted' && le.amount === entry.amount && le.date === entry.date
          && (entry.kind === 'income' ? le.type === 'income' : le.type === 'adjustment'),
      )
      if (ledger?.id) await cancelLedgerEntry(ledger.id)
    }
    await db.fundEntries.delete(id)
  }

  async function addSavingsGoal(e: React.FormEvent) {
    e.preventDefault()
    if (!goalName.trim() || !goalTarget || parseFloat(goalTarget) <= 0) return
    const chip = PURPOSE_CHIPS.find(c => goalName.toLowerCase().includes(c.label.toLowerCase())) ?? PURPOSE_CHIPS[7]
    await createSavingsGoal({
      name: goalName.trim(),
      icon: chip.icon,
      color: chip.color,
      targetAmount: parseFloat(goalTarget),
      deadline: goalDeadline || undefined,
      notes: goalNotes.trim() || undefined,
    })
    setGoalName('')
    setGoalTarget('')
    setGoalDeadline('')
    setGoalNotes('')
    setShowGoalForm(false)
    setTab('savings')
  }

  function startManualDeposit(goalId: number) {
    setDepositGoalId(goalId)
    setDepositAmount('')
    setDepositNote('')
    setDepositDate(new Date().toISOString().split('T')[0])
    setShowManualDeposit(true)
    setShowSavingsScanner(false)
    setSavingsScanResult(null)
  }

  function startScreenshotDeposit(goalId: number) {
    setDepositGoalId(goalId)
    setShowSavingsScanner(true)
    setShowManualDeposit(false)
    setSavingsScanResult(null)
  }

  async function saveManualDeposit(e: React.FormEvent) {
    e.preventDefault()
    if (!depositGoalId || !depositAmount || parseFloat(depositAmount) <= 0) return
    const amount = parseFloat(depositAmount)
    setPendingTransferAmount(amount)
    setShowManualDeposit(false)
    setShowPurposeTransfer(true)
  }

  async function completeSavingsTransfer(
    goalId: number | 'new',
    chip: typeof PURPOSE_CHIPS[number],
    customName?: string,
  ) {
    const amount = pendingTransferAmount || parseFloat(depositAmount)
    if (amount <= 0) return

    let targetGoalId = typeof goalId === 'number' ? goalId : depositGoalId
    if (goalId === 'new') {
      targetGoalId = await createSavingsGoal({
        name: customName ?? chip.label,
        icon: chip.icon,
        color: chip.color,
        targetAmount: amount * 4,
      })
    }
    if (!targetGoalId) return

    const isScreenshot = !!savingsScanResult
    await addSavingsDeposit(
      targetGoalId,
      amount,
      depositDate,
      isScreenshot ? 'screenshot' : 'manual',
      {
        note: depositNote.trim() || undefined,
        imageData: savingsScanResult?.imageData,
        rawText: savingsScanResult?.rawText,
      },
    )

    const goal = (savingsGoals ?? []).find(g => g.id === targetGoalId)
      ?? await db.savingsGoals.get(targetGoalId)
    if (goal) {
      const newMilestones = getNewMilestones(goal)
      if (newMilestones.length > 0) {
        setCelebration({ milestone: newMilestones[0], goalName: goal.name })
        await db.savingsGoals.update(targetGoalId, {
          celebratedMilestones: [...(goal.celebratedMilestones ?? []), newMilestones[0].id],
        })
      }
    }

    setShowPurposeTransfer(false)
    setPendingTransferAmount(0)
    setDepositGoalId(null)
    setDepositAmount('')
    setDepositNote('')
    setSavingsScanResult(null)
  }

  async function saveScreenshotDeposit(amount: number, note?: string) {
    if (!depositGoalId || amount <= 0) return
    setPendingTransferAmount(amount)
    if (note) setDepositNote(note)
    setSavingsScanResult(null)
    setShowSavingsScanner(false)
    setShowPurposeTransfer(true)
  }

  async function handleDeleteGoal(id: number) {
    await deleteSavingsGoal(id)
  }

  async function saveReceipt(data: ReceiptSaveData) {
    const date = data.date
    const ledgerEntryId = await createExpense(data.amount, data.category, {
      description: data.description,
      date,
      source: 'manual',
    })
    const txId = await db.transactions.add({
      amount: data.amount,
      category: data.category,
      description: data.description,
      date,
      isImpulse: false,
      store: data.store,
      source: 'receipt',
      ledgerEntryId,
      receiptImageData: data.imageData,
      receiptRawText: data.rawText,
    })
    const receiptId = await db.receipts.add({
      store: data.store,
      amount: data.amount,
      date: data.date,
      category: data.category,
      imageData: data.imageData,
      rawText: data.rawText,
      lineItems: data.lineItems,
      transactionId: txId as number,
      createdAt: new Date().toISOString(),
    })

    const messages: string[] = []
    const routed = data.routedItems ?? []
    const legacyPantry = data.pantryItems ?? []

    if (routed.length > 0) {
      const pantryItems = routed
        .filter(i => i.destination === 'pantry' && i.pantryLocation)
        .map(i => ({
          name: i.name,
          location: i.pantryLocation!,
          category: i.pantryCategory ?? 'General',
        }))
      const petItems = routed
        .filter(i => i.destination === 'pet-supply' && i.petSupplyType)
        .map(i => ({ name: i.name, supplyType: i.petSupplyType!, price: i.price }))
      const vetItems = routed
        .filter(i => i.destination === 'vet')
        .map(i => ({ name: i.name, amount: i.price }))

      if (pantryItems.length > 0) {
        const { added, updated } = await addReceiptItemsToPantry(pantryItems, data.date)
        const parts: string[] = []
        if (added > 0) parts.push(`${added} new`)
        if (updated > 0) parts.push(`${updated} updated`)
        messages.push(`Pantry: ${parts.join(', ')}`)
      }
      if (petItems.length > 0) {
        const { added, updated } = await addReceiptItemsToPetSupplies(petItems, data.date)
        messages.push(`Pet supplies: ${added + updated} item${added + updated !== 1 ? 's' : ''}`)
      }
      if (vetItems.length > 0) {
        const count = await addReceiptVetExpenses(vetItems, data.date, data.store, receiptId as number)
        messages.push(`Vet: ${count} bill${count !== 1 ? 's' : ''}`)
      }
    } else if (legacyPantry.length > 0) {
      const { added, updated } = await addReceiptItemsToPantry(legacyPantry, data.date)
      const parts: string[] = []
      if (added > 0) parts.push(`${added} new`)
      if (updated > 0) parts.push(`${updated} updated`)
      messages.push(`Pantry: ${parts.join(', ')}`)
    }

    setReceiptPantryMessage(messages.length > 0 ? messages.join(' · ') : null)

    if (data.lineItems?.length && data.store) {
      await recordPricesFromReceipt(data.store, data.lineItems, data.date)
      hbi.refreshDebounced({ trigger: 'receipt-scan' })
    }

    setReceiptReview(null)
    setShowReceiptScanner(false)
    setTab(beta ? 'bills' : 'watch')
    refreshFI()
  }

  const financeTabs = (
    [
      { id: 'bills' as const, label: beta ? 'Due' : '📅 Bills', badge: unpaidBills.length || undefined },
      { id: 'intelligence' as const, label: beta ? 'Tips' : '✦ Intelligence' },
      ...(!beta ? [{ id: 'overview' as const, label: 'Overview' }] : []),
      ...(!beta ? [{ id: 'watch' as const, label: '👁 Spending Watch' }] : []),
      { id: 'budget' as const, label: 'Budgets' },
      ...(!beta ? [{ id: 'spending' as const, label: 'History' }] : []),
      { id: 'savings' as const, label: beta ? 'Savings' : '🐷 Savings' },
      ...(!beta ? [{ id: 'opportunities' as const, label: '💡 Opportunities' }] : []),
      ...(!beta ? [{ id: 'coach' as const, label: 'Money School' }] : []),
    ] as const
  ).map(t => ({ id: t.id, label: t.label, badge: 'badge' in t ? t.badge : undefined }))

  return (
    <div className={listStyles.page}>
      {/* Beta: MoneyAssistantHero greets — skip duplicate page chrome */}
      {!beta && (
        <PageHeader
          icon="💰"
          title="Financial Intelligence"
          subtitle="Where can you save money? Calm, executive insight — no bank connection required"
        />
      )}

      {beta && (
        <p className={styles.whisper} role="status">
          {BETA_BANNER_COPY}
        </p>
      )}

      {!beta && (
        <div style={{ marginBottom: '1rem' }}>
          <button
            type="button"
            className={buttonStyles.secondary}
            onClick={() =>
              openAskHaven({
                hint: 'You opened me from Finance — ask about bills due, subscriptions, or what you can afford.',
                query: undefined,
              })
            }
          >
            Ask Haven about money
          </button>
        </div>
      )}
      {receiptPantryMessage && (
        <div className={listStyles.alertBanner}>
          ✓ Receipt saved — {receiptPantryMessage}
        </div>
      )}

      {beta ? (
        <MoneyAssistantHero
          userName={profile?.name}
          nextBill={unpaidBills[0] ?? null}
          overdueCount={overdueBills.length}
          unpaidCount={unpaidBills.length}
          unpaidTotal={unpaidBillsTotal}
          topCategory={spendingByCategory[0] ?? null}
          monthSpendTotal={monthTx.reduce((sum, t) => sum + t.amount, 0)}
          hasAnyBills={sortedBills.length > 0}
          onSeeDue={() => {
            setTab('bills')
            if (sortedBills.length === 0) {
              setShowBillForm(true)
              setShowTxForm(false)
              setShowFundForm(false)
            }
          }}
          onCareForBill={
            unpaidBills[0] && canMarkBillPaid(unpaidBills[0])
              ? bill => {
                  void handleMarkPaid(bill)
                }
              : undefined
          }
        />
      ) : (
        <div className={styles.healthCard}>
          <div className={styles.healthScore} style={{ borderColor: health.color }}>
            <span className={styles.scoreValue} style={{ color: health.color }}>{health.score}</span>
            <span className={styles.scoreLabel}>Financial Health</span>
            <span className={styles.scoreStatus} style={{ color: health.color }}>{health.label}</span>
          </div>
          <div className={styles.healthStats}>
            <div><strong>${fundSummary.fundsIn.toFixed(2)}</strong><span>funds in</span></div>
            <div><strong>${monthlySpending.toFixed(2)}</strong><span>spent this month</span></div>
            <div>
              <strong style={{ color: availableFunds >= 0 ? '#4a6741' : '#c45c4a' }}>
                ${availableFunds.toFixed(2)}
              </strong>
              <span>available funds</span>
            </div>
          </div>
        </div>
      )}

      <ResponsiveTabs
        tabs={financeTabs}
        active={tab}
        onChange={setTab}
        mobileLabel="Finance section"
        ariaLabel="Finance sections"
        tabsClassName={styles.tabs}
        tabClassName={styles.tab}
        tabActiveClassName={styles.tabActive}
      />

      {billImportMessage && (
        <div className={listStyles.alertBanner}>{billImportMessage}</div>
      )}

      {billPaymentMessage && (
        <div className={listStyles.alertBanner}>{billPaymentMessage}</div>
      )}

      <input
        id="bill-csv-input"
        type="file"
        accept={BILL_CSV_ACCEPT}
        className={styles.hiddenFileInput}
        onChange={handleBillCsvSelected}
      />

      <div className={listStyles.actions}>
        <div className={listStyles.actionRowPrimary}>
          {beta ? (
            <>
              <Button size="sm" onClick={() => { setShowBillForm(!showBillForm); setShowTxForm(false); setShowFundForm(false); setBillImportPreview(null) }}>
                + Add Bill
              </Button>
              <Button size="sm" variant="secondary" onClick={() => { setShowFundForm(!showFundForm); setShowTxForm(false); setShowBillForm(false) }}>
                + Add Funds
              </Button>
              <ActionMenu
                label="More"
                items={[
                  { label: 'Scan Receipt', icon: '📷', onClick: () => setShowReceiptScanner(true) },
                  { label: 'Log Spending', icon: '💸', onClick: () => { setShowTxForm(!showTxForm); setShowBillForm(false); setShowFundForm(false) } },
                  { label: 'Upload Bills CSV', icon: '📄', onClick: () => document.getElementById('bill-csv-input')?.click() },
                  { label: 'Savings Goal', icon: '🎯', onClick: () => { setShowGoalForm(!showGoalForm); setTab('savings') } },
                  { label: 'Set Budget', icon: '📊', onClick: () => setShowBudgetForm(!showBudgetForm) },
                  {
                    label: 'Ask Haven',
                    icon: '💬',
                    onClick: () =>
                      openAskHaven({
                        hint: 'You opened me from Finance — ask about bills due, subscriptions, or what you can afford.',
                        query: undefined,
                      }),
                  },
                ]}
              />
            </>
          ) : (
            <>
              <Button size="sm" onClick={() => { setShowFundForm(!showFundForm); setShowTxForm(false); setShowBillForm(false) }}>
                + Add Funds
              </Button>
              <Button size="sm" onClick={() => setShowReceiptScanner(true)}>📷 Scan Receipt</Button>
              <ActionMenu
                label="More"
                items={[
                  { label: 'Log Spending', icon: '💸', onClick: () => { setShowTxForm(!showTxForm); setShowBillForm(false); setShowFundForm(false) } },
                  { label: 'Add Bill', icon: '📋', onClick: () => { setShowBillForm(!showBillForm); setShowTxForm(false); setShowFundForm(false); setBillImportPreview(null) } },
                  { label: 'Upload Bills CSV', icon: '📄', onClick: () => document.getElementById('bill-csv-input')?.click() },
                  { label: 'Savings Goal', icon: '🎯', onClick: () => { setShowGoalForm(!showGoalForm); setTab('savings') } },
                  { label: 'Set Budget', icon: '📊', onClick: () => setShowBudgetForm(!showBudgetForm) },
                ]}
              />
            </>
          )}
        </div>
      </div>

      {showGoalForm && (
        <Card title="New savings goal">
          <form onSubmit={addSavingsGoal} className={listStyles.form}>
            <input
              className={listStyles.input}
              placeholder="What are you saving for? (Emergency fund, vacation…)"
              value={goalName}
              onChange={e => setGoalName(e.target.value)}
              required
            />
            <div className={listStyles.formRow}>
              <input
                className={listStyles.input}
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Target amount"
                value={goalTarget}
                onChange={e => setGoalTarget(e.target.value)}
                required
              />
              <input
                className={listStyles.input}
                type="date"
                value={goalDeadline}
                onChange={e => setGoalDeadline(e.target.value)}
                title="Optional deadline"
              />
            </div>
            <input
              className={listStyles.input}
              placeholder="Notes (optional)"
              value={goalNotes}
              onChange={e => setGoalNotes(e.target.value)}
            />
            <Button type="submit">Create goal</Button>
          </form>
        </Card>
      )}

      {showManualDeposit && depositGoalId && (
        <Card title="Add savings deposit">
          <form onSubmit={saveManualDeposit} className={listStyles.form}>
            <div className={listStyles.formRow}>
              <input
                className={listStyles.input}
                type="date"
                value={depositDate}
                onChange={e => setDepositDate(e.target.value)}
                required
              />
              <input
                className={listStyles.input}
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Amount you put away"
                value={depositAmount}
                onChange={e => setDepositAmount(e.target.value)}
                required
              />
            </div>
            <input
              className={listStyles.input}
              placeholder="Note (optional)"
              value={depositNote}
              onChange={e => setDepositNote(e.target.value)}
            />
            <div className={listStyles.formRow}>
              <Button type="submit">Save deposit</Button>
              <Button variant="ghost" type="button" onClick={() => { setShowManualDeposit(false); setDepositGoalId(null) }}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {showFundForm && (
        <Card>
          <form onSubmit={addFundEntry} className={listStyles.form}>
            <div className={listStyles.formRow}>
              <input
                className={listStyles.input}
                type="date"
                value={fundDate}
                onChange={e => setFundDate(e.target.value)}
                required
              />
              <input
                className={listStyles.input}
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Amount"
                value={fundAmount}
                onChange={e => setFundAmount(e.target.value)}
                required
              />
            </div>
            <div className={styles.fundKindRow}>
              <label className={`${styles.fundKindOption} ${fundKind === 'income' ? styles.fundKindActive : ''}`}>
                <input
                  type="radio"
                  name="fundKind"
                  checked={fundKind === 'income'}
                  onChange={() => setFundKind('income')}
                />
                <span>Add funds</span>
                <small>Payday, cash in, deposit</small>
              </label>
              <label className={`${styles.fundKindOption} ${fundKind === 'credit' ? styles.fundKindActive : ''}`}>
                <input
                  type="radio"
                  name="fundKind"
                  checked={fundKind === 'credit'}
                  onChange={() => setFundKind('credit')}
                />
                <span>Reduce spending</span>
                <small>Return, refund, correction</small>
              </label>
            </div>
            <Button type="submit">Save</Button>
          </form>
        </Card>
      )}

      {showTxForm && !showImpulseModal && (
        <Card>
          <form onSubmit={e => addTransaction(e)} className={listStyles.form}>
            <input className={listStyles.input} type="number" step="0.01" placeholder="Amount" value={txAmount} onChange={e => setTxAmount(e.target.value)} required />
            <div className={listStyles.formRow}>
              <input className={listStyles.input} placeholder="What was it for?" value={txDesc} onChange={e => setTxDesc(e.target.value)} required />
              <select className={listStyles.select} value={txCategory} onChange={e => setTxCategory(e.target.value)}>
                {TX_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input className={listStyles.input} placeholder="Store (optional)" value={txStore} onChange={e => setTxStore(e.target.value)} />
            </div>
            <label className={styles.impulseCheck}>
              <input type="checkbox" checked={txIsImpulse} onChange={e => setTxIsImpulse(e.target.checked)} />
              This was an impulse purchase
            </label>
            <Button type="submit" onClick={e => { if (txIsImpulse) { e.preventDefault(); setShowImpulseModal(true) } }}>
              {txIsImpulse ? 'Pause & Reflect' : 'Save'}
            </Button>
          </form>
        </Card>
      )}

      {showImpulseModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>Take a breath first</h3>
            <p className={styles.impulseQuestion}>{getImpulseQuestion()}</p>
            <p className={styles.impulseSub}>
              Impulse purchases aren't failures — they're moments to learn from.
              You can still log this, or choose not to buy.
            </p>
            <div className={styles.modalActions}>
              <Button variant="secondary" onClick={e => addTransaction(e as unknown as React.FormEvent, true)}>
                I decided not to buy ✓
              </Button>
              <Button onClick={e => addTransaction(e as unknown as React.FormEvent, false)}>
                Log purchase anyway
              </Button>
              <Button variant="ghost" onClick={() => setShowImpulseModal(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {billImportPreview && (
        <Card title="Review CSV import">
          <p className={styles.csvImportIntro}>
            Found <strong>{billImportPreview.validRows.length}</strong> bill{billImportPreview.validRows.length !== 1 ? 's' : ''} ready to import.
            {billImportPreview.errors.length > 0 && (
              <> <span className={styles.csvImportWarn}>{billImportPreview.errors.length} row{billImportPreview.errors.length !== 1 ? 's' : ''} skipped.</span></>
            )}
          </p>
          {billImportPreview.errors.length > 0 && (
            <ul className={styles.csvImportErrors}>
              {billImportPreview.errors.slice(0, 5).map(err => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          )}
          {billImportPreview.validRows.length > 0 ? (
            <>
              <ul className={styles.csvPreviewList}>
                {billImportPreview.validRows.slice(0, 8).map(row => (
                  <li key={row.rowNumber} className={styles.csvPreviewItem}>
                    <span className={styles.csvPreviewName}>{row.name}</span>
                    <span className={styles.csvPreviewMeta}>
                      ${row.amount.toFixed(2)} · {row.dueDate ?? `day ${row.dueDay}`} · {BILL_FREQUENCY_LABELS[row.frequency]}
                    </span>
                  </li>
                ))}
              </ul>
              {billImportPreview.validRows.length > 8 && (
                <p className={styles.csvImportMore}>+{billImportPreview.validRows.length - 8} more</p>
              )}
              <div className={listStyles.formRow}>
                <Button onClick={confirmBillImport}>Import {billImportPreview.validRows.length} Bills</Button>
                <Button variant="ghost" onClick={() => setBillImportPreview(null)}>Cancel</Button>
              </div>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setBillImportPreview(null)}>Close</Button>
          )}
        </Card>
      )}

      {showBillForm && (
        <Card title="Add a Bill">
          <form onSubmit={addBill} className={listStyles.form}>
            <input
              className={listStyles.input}
              placeholder="Bill name (e.g. Electric, Rent, Netflix)"
              value={billName}
              onChange={e => setBillName(e.target.value)}
              required
            />
            <div className={listStyles.formRow}>
              <input
                className={listStyles.input}
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Amount"
                value={billAmount}
                onChange={e => setBillAmount(e.target.value)}
                required
              />
              <input
                className={listStyles.input}
                type="date"
                value={billDueDate}
                onChange={e => setBillDueDate(e.target.value)}
                required
              />
            </div>
            <div className={listStyles.formRow}>
              <select className={listStyles.select} value={billCategory} onChange={e => setBillCategory(e.target.value)}>
                {BILL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className={listStyles.select} value={billFrequency} onChange={e => setBillFrequency(e.target.value as BillFrequency)}>
                {(Object.entries(BILL_FREQUENCY_LABELS) as [BillFrequency, string][]).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <textarea
              className={styles.billNotes}
              placeholder="Notes (optional) — account number, autopay, reminder..."
              value={billNotes}
              onChange={e => setBillNotes(e.target.value)}
              rows={2}
            />
            <Button type="submit">Save Bill</Button>
          </form>
        </Card>
      )}

      {showBudgetForm && (
        <Card>
          <form onSubmit={addBudget} className={listStyles.form}>
            <div className={listStyles.formRow}>
              <select className={listStyles.select} value={budgetCategory} onChange={e => setBudgetCategory(e.target.value)}>
                {TX_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input className={listStyles.input} type="number" step="0.01" placeholder="Monthly limit" value={budgetLimit} onChange={e => setBudgetLimit(e.target.value)} />
              <Button type="submit">Save Budget</Button>
            </div>
          </form>
        </Card>
      )}

      {tab === 'bills' && (
        <div className={styles.billsSection}>
          {beta ? (
            <SectionToggle title="Import from spreadsheet" summary="CSV upload" defaultExpanded={false}>
              <p className={styles.csvHelp}>
                Upload a CSV with columns: <strong>name</strong>, <strong>amount</strong>, <strong>due date</strong>.
                Optional: category, frequency (monthly, weekly, yearly, once), notes.
              </p>
              <div className={listStyles.formRow}>
                <label
                  htmlFor="bill-csv-input"
                  className={`${buttonStyles.btn} ${buttonStyles.secondary} ${buttonStyles.md}`}
                >
                  Choose CSV File
                </label>
                <Button variant="ghost" onClick={downloadBillCsvTemplate}>Download template</Button>
              </div>
            </SectionToggle>
          ) : (
            <Card title="Import from spreadsheet">
              <p className={styles.csvHelp}>
                Upload a CSV with columns: <strong>name</strong>, <strong>amount</strong>, <strong>due date</strong>.
                Optional: category, frequency (monthly, weekly, yearly, once), notes.
              </p>
              <div className={listStyles.formRow}>
                <label
                  htmlFor="bill-csv-input"
                  className={`${buttonStyles.btn} ${buttonStyles.secondary} ${buttonStyles.md}`}
                >
                  Choose CSV File
                </label>
                <Button variant="ghost" onClick={downloadBillCsvTemplate}>Download template</Button>
              </div>
            </Card>
          )}

          {!beta && (
            <div className={styles.billsSummary}>
              <div className={styles.billsSummaryBox}>
                <span className={styles.billsSummaryValue}>${monthlyBillsTotal.toFixed(2)}</span>
                <span className={styles.billsSummaryLabel}>estimated monthly</span>
              </div>
              <div className={styles.billsSummaryBox}>
                <span className={styles.billsSummaryValue}>${unpaidBillsTotal.toFixed(2)}</span>
                <span className={styles.billsSummaryLabel}>unpaid due</span>
              </div>
              <div className={styles.billsSummaryBox}>
                <span className={styles.billsSummaryValue}>${paidBillsTotal.toFixed(2)}</span>
                <span className={styles.billsSummaryLabel}>paid this cycle</span>
              </div>
              {overdueBills.length > 0 && (
                <div className={`${styles.billsSummaryBox} ${styles.billsSummaryAlert}`}>
                  <span className={styles.billsSummaryValue}>{overdueBills.length}</span>
                  <span className={styles.billsSummaryLabel}>overdue</span>
                </div>
              )}
            </div>
          )}

          <Card title={beta ? (unpaidBills.length > 0 ? 'What\'s due' : 'Your bills') : 'Your Bills'}>
            {sortedBills.length > 0 && (
              <FilterDropdown
                label="Filter bills"
                mobileOnly={false}
                compactOnDesktop
                value={billFilter}
                onChange={setBillFilter}
                options={[
                  { id: 'all', label: 'All bills', count: sortedBills.length },
                  { id: 'unpaid', label: 'Unpaid', count: unpaidBills.length },
                  { id: 'paid', label: 'Paid this cycle', count: sortedBills.length - unpaidBills.length },
                  { id: 'overdue', label: 'Overdue', count: overdueBills.length },
                ]}
              />
            )}
            {filteredBills.length === 0 ? (
              <p className={listStyles.empty}>
                {sortedBills.length === 0
                  ? (beta
                    ? 'Add your first bill so I can tell you what’s coming'
                    : <>Tap <strong>+ Add Bill</strong> or <strong>Upload Bills CSV</strong> to track rent, utilities, subscriptions, and more.</>)
                  : billFilter === 'unpaid'
                    ? 'All caught up — nothing unpaid this cycle.'
                    : 'No bills match this filter.'}
              </p>
            ) : (
              <ul className={styles.billList}>
                {filteredBills.map(bill => {
                  const paidThisCycle = isBillPaidThisCycle(bill)
                  const canPay = canMarkBillPaid(bill)
                  return (
                  <li
                    key={bill.id}
                    className={`${styles.billItem} ${paidThisCycle ? styles.billPaid : ''} ${isBillOverdue(bill) ? styles.billOverdue : ''}`}
                  >
                    <div className={styles.billInfo}>
                      <span className={styles.billName}>{bill.name}</span>
                      <span className={styles.billMeta}>
                        {!beta && <span className={listStyles.badge}>{bill.category}</span>}
                        {!beta && (
                          <span className={listStyles.badge}>
                            {BILL_FREQUENCY_LABELS[bill.frequency ?? 'monthly']}
                          </span>
                        )}
                        <span className={isBillOverdue(bill) ? styles.billDueOverdue : styles.billDue}>
                          {formatBillDueLabel(bill)}
                        </span>
                      </span>
                      {paidThisCycle && bill.lastPaidDate && (
                        <span className={styles.billPaidMeta}>
                          Paid {format(new Date(bill.lastPaidDate), 'MMM d')} · ${bill.amount.toFixed(2)} deducted
                        </span>
                      )}
                      {!beta && bill.notes && <span className={styles.billNotesText}>{bill.notes}</span>}
                    </div>
                    <div className={`${listStyles.itemMeta} ${styles.billActions}`}>
                      <span className={listStyles.amount}>${bill.amount.toFixed(2)}</span>
                      {canPay ? (
                        <Button variant="secondary" className={styles.markPaidBtn} onClick={() => handleMarkPaid(bill)}>
                          {beta ? 'Mark paid' : 'Mark Paid'}
                        </Button>
                      ) : paidThisCycle && (bill.paymentLedgerEntryId || bill.paymentTransactionId) ? (
                        <button type="button" className={styles.unpayBtn} onClick={() => handleUnpay(bill)}>
                          Undo
                        </button>
                      ) : null}
                      <button className={listStyles.deleteBtn} onClick={() => bill.id && deleteBill(bill.id)}>×</button>
                    </div>
                  </li>
                  )
                })}
              </ul>
            )}
            {beta && sortedBills.length === 0 && (
              <div className={listStyles.formRow} style={{ marginTop: '0.75rem' }}>
                <Button size="sm" onClick={() => { setShowBillForm(true); setShowTxForm(false); setShowFundForm(false) }}>
                  + Add your first bill
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'intelligence' && (
        fiLoading && !fiBrief ? (
          <p className={listStyles.empty}>{beta ? 'Checking what\'s coming…' : 'Running your home financial audit…'}</p>
        ) : fiBrief ? (
          <FinancialIntelligenceDashboard
            brief={fiBrief}
            ledgerEntries={ledgerEntries ?? []}
            savingsGoals={savingsGoals ?? []}
            month={month}
            onShowAllInsights={() => setTab(beta ? 'intelligence' : 'opportunities')}
          />
        ) : (
          <p className={listStyles.empty}>
            {beta ? 'Could not load tips. ' : 'Could not load financial intelligence. '}
            <button type="button" className={styles.viewBillsLink} onClick={() => refreshFI()}>Retry</button>
          </p>
        )
      )}

      {tab === 'overview' && (
        <>
          <div className={listStyles.statGrid}>
            <CompactCard
              value={`$${availableFunds.toFixed(0)}`}
              label="Available"
              alert={availableFunds < 0}
            />
            <CompactCard
              value={`$${moneyProtected.totalSavings.toFixed(0)}`}
              label="Protected"
              sub={moneyProtected.savingsRate > 0 ? `${moneyProtected.savingsRate}% of income` : undefined}
            />
            <CompactCard value={`$${monthlySpending.toFixed(0)}`} label="Spending" />
            <CompactCard value={`$${unpaidBillsTotal.toFixed(0)}`} label="Bills due" />
            <CompactCard value={`${savingsProgress.percent}%`} label="Savings" />
            <CompactCard value={`$${netWorth.toFixed(0)}`} label="Net worth" sub="future-ready" />
          </div>

          <SectionToggle title="Budget Overview" summary={`${budgetStatus.length} categories`} defaultExpanded>
            {budgetStatus.length === 0 ? (
              <p className={listStyles.empty}>Set budgets to start tracking your spending.</p>
            ) : (
              <div className={styles.budgetList}>
                {budgetStatus.map(b => (
                  <div key={b.category} className={styles.budgetRow}>
                    <div className={styles.budgetHeader}>
                      <span>{b.category}</span>
                      <span className={styles.budgetAmounts}>
                        ${b.spent.toFixed(0)} / ${b.limit.toFixed(0)}
                      </span>
                    </div>
                    <div className={styles.budgetBar}>
                      <div
                        className={`${styles.budgetFill} ${styles[b.status]}`}
                        style={{ width: `${Math.min(100, b.percentUsed)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionToggle>

          <SectionToggle title="Financial Timeline" summary={`${timeline.length} events`} defaultExpanded={false}>
            <FinancialTimelineCard items={timeline} limit={12} bare />
          </SectionToggle>
        </>
      )}

      {tab === 'watch' && (
        <div className={styles.watchSection}>
          <div className={styles.noBankBanner}>
            <strong>No bank connection.</strong> Haven only tracks what you choose to log or scan.
            Your money, your control, your pace.
          </div>

          <div className={styles.paceCard}>
            <h3 className={styles.paceTitle}>This month's pace</h3>
            <p className={styles.paceMessage}>{spendingMonitor.pace.message}</p>
            <div className={styles.paceStats}>
              <div>
                <span className={styles.paceValue}>${spendingMonitor.pace.dailyAverage.toFixed(2)}</span>
                <span className={styles.paceLabel}>daily average</span>
              </div>
              <div>
                <span className={styles.paceValue}>{spendingMonitor.trackingStreak}</span>
                <span className={styles.paceLabel}>day tracking streak</span>
              </div>
              <div>
                <span className={styles.paceValue}>{spendingMonitor.receiptCount}</span>
                <span className={styles.paceLabel}>receipts scanned</span>
              </div>
            </div>
          </div>

          <Card title="Month-over-month">
            <p className={styles.trendMessage}>{spendingMonitor.trend.message}</p>
            <div className={styles.compareRow}>
              <div className={styles.compareBox}>
                <span className={styles.compareLabel}>This month</span>
                <span className={styles.compareValue}>${fundSummary.netSpent.toFixed(2)}</span>
                {fundSummary.spendingCredits > 0 && (
                  <span className={styles.compareNote}>
                    ${fundSummary.spendingCredits.toFixed(2)} in credits applied
                  </span>
                )}
              </div>
              <div className={styles.compareBox}>
                <span className={styles.compareLabel}>Last month</span>
                <span className={styles.compareValue}>${spendingMonitor.totalLastMonth.toFixed(2)}</span>
              </div>
            </div>
          </Card>

          {weeklySpending.length > 0 && (
            <Card title="Weekly rhythm">
              <div className={styles.weeklyChart}>
                {weeklySpending.map(w => {
                  const max = Math.max(...weeklySpending.map(x => x.total), 1)
                  return (
                    <div key={w.week} className={styles.weekBar}>
                      <div className={styles.weekFill} style={{ height: `${(w.total / max) * 100}%` }} />
                      <span className={styles.weekLabel}>{w.week}</span>
                      <span className={styles.weekAmount}>${w.total.toFixed(0)}</span>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {spendingMonitor.topStores.length > 0 && (
            <Card title="Where you shop most">
              <ul className={styles.storeList}>
                {spendingMonitor.topStores.map(s => (
                  <li key={s.store} className={styles.storeItem}>
                    <span>{s.store}</span>
                    <span className={styles.storeMeta}>{s.count} visit{s.count !== 1 ? 's' : ''} · ${s.total.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className={styles.insightGrid}>
            {spendingMonitor.insights.map((insight, i) => (
              <div key={i} className={`${styles.watchInsight} ${styles[insight.type]}`}>
                <h4>{insight.title}</h4>
                <p>{insight.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'budget' && (
        <Card title="Monthly Budgets">
          {budgetStatus.map(b => (
            <div key={b.category} className={`${styles.budgetCard} ${styles[b.status]}`}>
              <div className={styles.budgetCardHeader}>
                <h4>{b.category}</h4>
                <span className={b.status === 'over' ? styles.overBudget : ''}>
                  {b.status === 'over' ? 'Over budget' : b.status === 'warning' ? 'Almost there' : 'On track'}
                </span>
              </div>
              <div className={styles.budgetNumbers}>
                <span>Spent: <strong>${b.spent.toFixed(2)}</strong></span>
                <span>Remaining: <strong>${Math.max(0, b.remaining).toFixed(2)}</strong></span>
                <span>Limit: ${b.limit.toFixed(2)}</span>
              </div>
              <div className={styles.budgetBar}>
                <div className={`${styles.budgetFill} ${styles[b.status]}`} style={{ width: `${Math.min(100, b.percentUsed)}%` }} />
              </div>
            </div>
          ))}
        </Card>
      )}

      {tab === 'spending' && (
        <>
          <Card title="Spending by Category">
            {spendingByCategory.length === 0 ? (
              <p className={listStyles.empty}>No spending logged this month.</p>
            ) : (
              <div className={styles.spendingChart}>
                {spendingByCategory.map(({ category, total }) => {
                  const max = spendingByCategory[0]?.total ?? 1
                  return (
                    <div key={category} className={styles.chartRow}>
                      <span className={styles.chartLabel}>{category}</span>
                      <div className={styles.chartBar}>
                        <div className={styles.chartFill} style={{ width: `${(total / max) * 100}%` }} />
                      </div>
                      <span className={styles.chartValue}>${total.toFixed(2)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          <Card title="All Transactions">
            <FilterDropdown
              label="Sort"
              mobileOnly={false}
              compactOnDesktop
              value={txSort}
              onChange={setTxSort}
              options={[
                { id: 'date-desc', label: 'Newest first' },
                { id: 'date-asc', label: 'Oldest first' },
                { id: 'amount-desc', label: 'Highest amount' },
                { id: 'amount-asc', label: 'Lowest amount' },
              ]}
            />
            {monthTx.length === 0 && monthFunds.length === 0 ? (
              <p className={listStyles.empty}>Nothing logged this month yet.</p>
            ) : (
            <ul className={listStyles.list}>
              {monthFunds.map(entry => (
                <li key={`fund-${entry.id}`} className={listStyles.listItem}>
                  <span>
                    {entry.kind === 'income' ? 'Funds added' : 'Spending reduced'}
                    <span className={entry.kind === 'income' ? styles.incomeTag : styles.creditTag}>
                      {entry.kind === 'income' ? 'in' : 'credit'}
                    </span>
                  </span>
                  <div className={listStyles.itemMeta}>
                    <span className={listStyles.badge}>{format(new Date(entry.date), 'MMM d')}</span>
                    <span className={`${listStyles.amount} ${entry.kind === 'income' ? styles.incomeAmount : styles.creditAmount}`}>
                      {entry.kind === 'income' ? '+' : '−'}${entry.amount.toFixed(2)}
                    </span>
                    <button className={listStyles.deleteBtn} onClick={() => entry.id && deleteFundEntry(entry.id)}>×</button>
                  </div>
                </li>
              ))}
              {sortedMonthTx.map(tx => (
                <li key={tx.id} className={listStyles.listItem}>
                  <span>
                    {tx.description}
                    {tx.source === 'receipt' && <span className={styles.receiptTag}>receipt</span>}
                    {tx.source === 'bill' && <span className={styles.billTag}>bill</span>}
                    {tx.isImpulse && <span className={styles.impulseTag}>impulse</span>}
                    {tx.impulsePaused && <span className={styles.pausedTag}>paused ✓</span>}
                  </span>
                  <div className={listStyles.itemMeta}>
                    <span className={listStyles.badge}>{format(new Date(tx.date), 'MMM d')}</span>
                    <span className={listStyles.amount}>${tx.amount.toFixed(2)}</span>
                    <button className={listStyles.deleteBtn} onClick={() => tx.id && deleteTransaction(tx.id)}>×</button>
                  </div>
                </li>
              ))}
            </ul>
            )}
          </Card>
        </>
      )}

      {tab === 'savings' && (
        <div className={styles.savingsSection}>
          <div className={styles.moneyProtectedCard}>
            <div className={styles.moneyProtectedTitle}>Money Protected</div>
            <div className={styles.moneyProtectedValue}>${moneyProtected.totalSavings.toFixed(2)}</div>
            <div className={styles.moneyProtectedStats}>
              <div className={styles.moneyProtectedStat}>
                <strong>+${moneyProtected.weeklyGrowth.toFixed(0)}</strong>
                <span>this week</span>
              </div>
              <div className={styles.moneyProtectedStat}>
                <strong>+${moneyProtected.monthlyGrowth.toFixed(0)}</strong>
                <span>this month</span>
              </div>
              <div className={styles.moneyProtectedStat}>
                <strong>{moneyProtected.savingsRate}%</strong>
                <span>of income saved</span>
              </div>
            </div>
          </div>

          <div className={styles.savingsSummary}>
            <div className={styles.savingsSummaryBox}>
              <span className={styles.savingsSummaryValue}>${savingsTotals.saved.toFixed(2)}</span>
              <span className={styles.savingsSummaryLabel}>total saved</span>
            </div>
            <div className={styles.savingsSummaryBox}>
              <span className={styles.savingsSummaryValue}>{savingsTotals.count}</span>
              <span className={styles.savingsSummaryLabel}>active goals</span>
            </div>
            {savingsTotals.target > 0 && (
              <div className={styles.savingsSummaryBox}>
                <span className={styles.savingsSummaryValue}>
                  {Math.round((savingsTotals.saved / savingsTotals.target) * 100)}%
                </span>
                <span className={styles.savingsSummaryLabel}>overall progress</span>
              </div>
            )}
          </div>

          {savingsTotals.target > 0 && (
            <div className={styles.savingsOverallMeter}>
              <div className={styles.savingsMeterLabels}>
                <span>All goals combined</span>
                <span>${savingsTotals.saved.toFixed(0)} / ${savingsTotals.target.toFixed(0)}</span>
              </div>
              <div className={styles.savingsMeterBar}>
                <div
                  className={styles.savingsMeterFill}
                  style={{ width: `${Math.min(100, Math.round((savingsTotals.saved / savingsTotals.target) * 100))}%` }}
                />
              </div>
            </div>
          )}

          {(savingsGoals ?? []).length === 0 ? (
            <Card title="Your savings spot">
              <p className={listStyles.empty}>
                Name what you're saving for, set a target, then log deposits manually or from a bank screenshot.
                No guilt about the pace — progress is progress.
              </p>
              <Button onClick={() => setShowGoalForm(true)}>Create your first goal</Button>
            </Card>
          ) : (
            (savingsGoals ?? []).map(goal => (
              <SavingsGoalCard
                key={goal.id}
                goal={goal}
                deposits={(savingsDeposits ?? []).filter(d => d.savingsGoalId === goal.id)}
                ledgerEntries={ledgerEntries ?? []}
                onAddDeposit={startManualDeposit}
                onScanDeposit={startScreenshotDeposit}
                onDelete={handleDeleteGoal}
              />
            ))
          )}

          <Card title="Savings Timeline">
            {timeline.filter(t => t.type === 'transfer').length === 0 ? (
              <p className={listStyles.empty}>Transfers to your savings vault will appear here.</p>
            ) : (
              <ul className={styles.timelineList}>
                {timeline.filter(t => t.type === 'transfer').slice(0, 10).map(item => (
                  <li key={item.id} className={styles.timelineItem}>
                    <span className={styles.timelineIcon}>{item.icon}</span>
                    <div className={styles.timelineBody}>
                      <span className={styles.timelineLabel}>{item.label}</span>
                      <span className={styles.timelineMeta}>
                        {format(new Date(item.date), 'MMM d')} · balance ${item.runningBalance.toFixed(2)}
                      </span>
                    </div>
                    <span className={styles.timelineAmount}>{item.amountDisplay}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Savings Analytics">
            <div className={styles.savingsAnalyticsGrid}>
              <div className={styles.savingsAnalyticBox}>
                <div className={styles.savingsAnalyticValue}>{savingsAnalytics.longestStreak} days</div>
                <div className={styles.savingsAnalyticLabel}>longest streak</div>
              </div>
              <div className={styles.savingsAnalyticBox}>
                <div className={styles.savingsAnalyticValue}>${savingsAnalytics.totalSavedThisYear.toFixed(0)}</div>
                <div className={styles.savingsAnalyticLabel}>saved this year</div>
              </div>
              <div className={styles.savingsAnalyticBox}>
                <div className={styles.savingsAnalyticValue}>${savingsAnalytics.avgMonthly.toFixed(0)}</div>
                <div className={styles.savingsAnalyticLabel}>avg monthly</div>
              </div>
              <div className={styles.savingsAnalyticBox}>
                <div className={styles.savingsAnalyticValue}>${savingsAnalytics.largestContribution.toFixed(0)}</div>
                <div className={styles.savingsAnalyticLabel}>largest contribution</div>
              </div>
              {savingsAnalytics.mostActiveGoal && (
                <div className={styles.savingsAnalyticBox}>
                  <div className={styles.savingsAnalyticValue}>{savingsAnalytics.mostActiveGoal.name}</div>
                  <div className={styles.savingsAnalyticLabel}>most active goal</div>
                </div>
              )}
              {savingsAnalytics.completionForecast && (
                <div className={styles.savingsAnalyticBox}>
                  <div className={styles.savingsAnalyticValue}>{savingsAnalytics.completionForecast}</div>
                  <div className={styles.savingsAnalyticLabel}>completion forecast</div>
                </div>
              )}
            </div>
          </Card>

          {savingsInsights.length > 0 && (
            <Card title="Where you could save">
              <div className={styles.insightGrid}>
                {savingsInsights.map((insight, i) => (
                  <div key={i} className={`${styles.watchInsight} ${styles[insight.type] ?? styles.tip}`}>
                    <h4>{insight.title}</h4>
                    <p>{insight.message}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === 'opportunities' && (
        <MoneyOpportunitiesSection
          ledgerEntries={ledgerEntries ?? []}
          transactions={transactions ?? []}
          savingsGoals={savingsGoals ?? []}
          opportunityPlans={opportunityPlans ?? []}
        />
      )}

      {tab === 'coach' && (
        <div className={styles.coachSection}>
          <p className={styles.coachLead}>
            Money coaching stays here during beta — lessons and playbooks return after we nail the basics.
          </p>
          {savingsInsights.slice(0, 3).map((insight, i) => (
            <div key={`savings-${i}`} className={`${styles.insightCard} ${styles[insight.type] ?? styles.tip}`}>
              <h4>{insight.title}</h4>
              <p>{insight.message}</p>
            </div>
          ))}
          {insights.map((insight, i) => (
            <div key={i} className={`${styles.insightCard} ${styles[insight.type]}`}>
              <h4>{insight.title}</h4>
              <p>{insight.message}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'overview' && (
        <Card title="Upcoming Bills">
          {sortedBills.length > 0 && (
            <div className={styles.billsOverviewTotals}>
              <span><strong>${unpaidBillsTotal.toFixed(2)}</strong> unpaid</span>
              <span><strong>${paidBillsTotal.toFixed(2)}</strong> paid this cycle</span>
            </div>
          )}
          {unpaidBills.length === 0 ? (
            <p className={listStyles.empty}>
              {sortedBills.length === 0 ? 'No bills yet — open the Bills tab to add some.' : 'All caught up on bills.'}
            </p>
          ) : (
            <ul className={styles.billList}>
              {unpaidBills.slice(0, 5).map(bill => (
                <li
                  key={bill.id}
                  className={`${styles.billItem} ${isBillOverdue(bill) ? styles.billOverdue : ''}`}
                >
                  <div className={styles.billInfo}>
                    <span className={styles.billName}>{bill.name}</span>
                    <span className={isBillOverdue(bill) ? styles.billDueOverdue : styles.billDue}>
                      {formatBillDueLabel(bill)}
                    </span>
                  </div>
                  <div className={listStyles.itemMeta}>
                    <span className={listStyles.amount}>${bill.amount.toFixed(2)}</span>
                    {canMarkBillPaid(bill) && (
                      <Button variant="secondary" className={styles.markPaidBtn} onClick={() => handleMarkPaid(bill)}>
                        Mark Paid
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {sortedBills.length > 0 && (
            <button type="button" className={styles.viewBillsLink} onClick={() => setTab('bills')}>
              View all bills →
            </button>
          )}
        </Card>
      )}

      {showPurposeTransfer && (
        <PurposeTransferModal
          amount={pendingTransferAmount || parseFloat(depositAmount) || 0}
          existingGoals={(savingsGoals ?? []).filter(g => g.id).map(g => ({
            id: g.id!,
            name: g.name,
            icon: g.icon ?? '✨',
          }))}
          onConfirm={completeSavingsTransfer}
          onCancel={() => { setShowPurposeTransfer(false); setPendingTransferAmount(0) }}
        />
      )}

      {celebration && (
        <MilestoneCelebration
          milestone={celebration.milestone}
          goalName={celebration.goalName}
          onDismiss={() => setCelebration(null)}
        />
      )}

      {showSavingsScanner && depositGoalId && !savingsScanResult && (
        <SavingsScreenshotScanner
          goalName={(savingsGoals ?? []).find(g => g.id === depositGoalId)?.name ?? 'Savings'}
          onResult={result => { setSavingsScanResult(result); setShowSavingsScanner(false) }}
          onClose={() => { setShowSavingsScanner(false); setDepositGoalId(null) }}
        />
      )}

      {savingsScanResult && depositGoalId && (
        <SavingsDepositConfirm
          goalName={(savingsGoals ?? []).find(g => g.id === depositGoalId)?.name ?? 'Savings'}
          initialAmount={savingsScanResult.amount}
          confidence={savingsScanResult.confidence}
          onSave={(amount, note) => saveScreenshotDeposit(amount, note)}
          onCancel={() => { setSavingsScanResult(null); setDepositGoalId(null) }}
        />
      )}

      {showReceiptScanner && !receiptReview && (
        <ReceiptScanner
          onResult={result => { setReceiptReview(result); setShowReceiptScanner(false) }}
          onClose={() => setShowReceiptScanner(false)}
        />
      )}

      {receiptReview && (
        <ReceiptReview
          result={receiptReview}
          onSave={saveReceipt}
          onCancel={() => setReceiptReview(null)}
        />
      )}
    </div>
  )
}
