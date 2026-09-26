// Modelo de datos: estado por defecto, migración y cálculos financieros.
(function () {
  const DEFAULT_CATEGORIES = [
    { id: 'comida', name: 'Comida', icon: '🍽️', type: 'gasto', group: 'necesidad' },
    { id: 'super', name: 'Súper', icon: '🛒', type: 'gasto', group: 'necesidad' },
    { id: 'transporte', name: 'Transporte', icon: '🚌', type: 'gasto', group: 'necesidad' },
    { id: 'vivienda', name: 'Vivienda', icon: '🏠', type: 'gasto', group: 'necesidad' },
    { id: 'servicios', name: 'Servicios', icon: '💡', type: 'gasto', group: 'necesidad' },
    { id: 'salud', name: 'Salud', icon: '💊', type: 'gasto', group: 'necesidad' },
    { id: 'educacion', name: 'Educación', icon: '📚', type: 'gasto', group: 'necesidad' },
    { id: 'mascotas', name: 'Mascotas', icon: '🐾', type: 'gasto', group: 'necesidad' },
    { id: 'ropa', name: 'Ropa', icon: '👕', type: 'gasto', group: 'deseo' },
    { id: 'ocio', name: 'Ocio', icon: '🎬', type: 'gasto', group: 'deseo' },
    { id: 'suscripciones', name: 'Suscripciones', icon: '📺', type: 'gasto', group: 'deseo' },
    { id: 'regalos', name: 'Regalos', icon: '🎁', type: 'gasto', group: 'deseo' },
    { id: 'viajes', name: 'Viajes', icon: '✈️', type: 'gasto', group: 'deseo' },
    { id: 'otros', name: 'Otros', icon: '📦', type: 'gasto', group: 'deseo' },
    { id: 'deudas', name: 'Deudas', icon: '💳', type: 'gasto', group: 'ahorro' },
    { id: 'ahorro', name: 'Ahorro', icon: '🐖', type: 'gasto', group: 'ahorro' },
    { id: 'sueldo', name: 'Sueldo', icon: '💼', type: 'ingreso', group: 'necesidad' },
    { id: 'freelance', name: 'Freelance', icon: '💻', type: 'ingreso', group: 'necesidad' },
    { id: 'ventas', name: 'Ventas', icon: '🏷️', type: 'ingreso', group: 'necesidad' },
    { id: 'inversiones', name: 'Inversiones', icon: '📈', type: 'ingreso', group: 'necesidad' },
    { id: 'regalos-ing', name: 'Regalos', icon: '🎀', type: 'ingreso', group: 'necesidad' },
    { id: 'otros-ing', name: 'Otros ingresos', icon: '➕', type: 'ingreso', group: 'necesidad' },
  ];

  const DEFAULT_ACCOUNTS = [
    { id: 'efectivo', name: 'Efectivo', icon: '💵', initial: 0 },
    { id: 'banco', name: 'Banco', icon: '🏦', initial: 0 },
    { id: 'tarjeta', name: 'Tarjeta', icon: '💳', initial: 0 },
  ];

  function defaultState() {
    return {
      v: 1,
      settings: {
        currency: Fmt.detectDefaultCurrency(),
        theme: 'auto',
        alert: 80,
        expectedIncome: 0,
      },
      accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a })),
      categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
      tx: [],
      recurring: [],
      budgets: {},
      goals: [],
      vault: [],
    };
  }

  function migrateState(raw) {
    const def = defaultState();
    if (!raw || typeof raw !== 'object') return def;
    const out = { v: 1 };
    out.settings = { ...def.settings, ...(raw.settings || {}) };
    out.accounts = Array.isArray(raw.accounts) && raw.accounts.length ? raw.accounts : def.accounts;
    out.categories = Array.isArray(raw.categories) && raw.categories.length ? raw.categories : def.categories;
    out.tx = Array.isArray(raw.tx) ? raw.tx : [];
    out.recurring = Array.isArray(raw.recurring) ? raw.recurring : [];
    out.budgets = raw.budgets && typeof raw.budgets === 'object' ? raw.budgets : {};
    out.goals = Array.isArray(raw.goals) ? raw.goals : [];
    out.vault = Array.isArray(raw.vault) ? raw.vault : [];
    return out;
  }

  function catById(state, id) {
    return state.categories.find((c) => c.id === id);
  }
  function accById(state, id) {
    return state.accounts.find((a) => a.id === id);
  }

  function accountBalance(state, accId) {
    const acc = accById(state, accId);
    let bal = acc ? Fmt.round2(acc.initial) : 0;
    for (const t of state.tx) {
      if (t.type === 'ingreso' && t.acc === accId) bal += t.amount;
      else if (t.type === 'gasto' && t.acc === accId) bal -= t.amount;
      else if (t.type === 'transfer') {
        if (t.acc === accId) bal -= t.amount;
        if (t.toAcc === accId) bal += t.amount;
      }
    }
    return Fmt.round2(bal);
  }

  function totalBalance(state) {
    return Fmt.round2(state.accounts.reduce((s, a) => s + accountBalance(state, a.id), 0));
  }

  function monthTx(state, yyyymm) {
    return state.tx.filter((t) => Fmt.monthKeyOf(t.date) === yyyymm);
  }

  function monthSummary(state, yyyymm) {
    const list = monthTx(state, yyyymm);
    let income = 0;
    let expense = 0;
    for (const t of list) {
      if (t.type === 'ingreso') income += t.amount;
      else if (t.type === 'gasto') expense += t.amount;
    }
    const net = Fmt.round2(income - expense);
    const savingsRate = income > 0 ? Fmt.round2((net / income) * 100) : 0;
    return { income: Fmt.round2(income), expense: Fmt.round2(expense), net, savingsRate };
  }

  function categorySpend(state, yyyymm, type) {
    const list = monthTx(state, yyyymm).filter((t) => t.type === (type || 'gasto'));
    const map = {};
    for (const t of list) {
      map[t.cat] = Fmt.round2((map[t.cat] || 0) + t.amount);
    }
    return map;
  }

  function last6MonthsData(state, yyyymm) {
    const months = [];
    for (let i = 5; i >= 0; i--) months.push(Fmt.addMonthsToKey(yyyymm, -i));
    return months.map((m) => ({ month: m, ...monthSummary(state, m) }));
  }

  function budgetStatus(state, yyyymm) {
    const spend = categorySpend(state, yyyymm, 'gasto');
    const alert = state.settings.alert || 80;
    const rows = [];
    for (const catId of Object.keys(state.budgets)) {
      const limit = state.budgets[catId];
      if (!limit || limit <= 0) continue;
      const cat = catById(state, catId);
      const spent = spend[catId] || 0;
      const pct = limit > 0 ? Fmt.round2((spent / limit) * 100) : 0;
      let level = 'ok';
      if (spent > limit) level = 'over';
      else if (pct >= alert) level = 'warn';
      rows.push({
        catId, cat, limit, spent,
        pct, level,
        available: Fmt.round2(limit - spent),
      });
    }
    const withoutBudget = Object.keys(spend).filter((c) => !(state.budgets[c] > 0));
    const totalBudgeted = Fmt.round2(Object.values(state.budgets).reduce((s, v) => s + (v || 0), 0));
    const totalSpent = Fmt.round2(Object.values(spend).reduce((s, v) => s + v, 0));
    return {
      rows, withoutBudget: withoutBudget.map((id) => ({ catId: id, cat: catById(state, id), spent: spend[id] })),
      totalBudgeted, totalSpent, available: Fmt.round2(totalBudgeted - totalSpent),
    };
  }

  function porAsignar(state) {
    const totalBudgeted = Object.values(state.budgets).reduce((s, v) => s + (v || 0), 0);
    return Fmt.round2((state.settings.expectedIncome || 0) - totalBudgeted);
  }

  function dailyAllowance(state, yyyymm) {
    const today = Fmt.todayLocal();
    const isCurrent = Fmt.monthKeyOf(today) === yyyymm;
    const daysInMonth = Fmt.daysInMonthKey(yyyymm);
    const status = budgetStatus(state, yyyymm);
    if (!isCurrent) {
      return { isCurrent, daysLeft: 0, perDay: 0, projected: 0, over: false };
    }
    const dayOfMonth = Number(today.slice(8, 10));
    const daysLeft = Math.max(daysInMonth - dayOfMonth + 1, 1);
    const remaining = status.totalBudgeted - status.totalSpent;
    const perDay = Fmt.round2(remaining / daysLeft);
    const dailyAvg = status.totalSpent / dayOfMonth;
    const projected = Fmt.round2(dailyAvg * daysInMonth);
    return { isCurrent, daysLeft, perDay, projected, over: status.totalBudgeted > 0 && projected > status.totalBudgeted };
  }

  function suggestBudget(state, catId, yyyymm) {
    const months = [Fmt.addMonthsToKey(yyyymm, -1), Fmt.addMonthsToKey(yyyymm, -2), Fmt.addMonthsToKey(yyyymm, -3)];
    let sum = 0;
    let count = 0;
    for (const m of months) {
      const spend = categorySpend(state, m, 'gasto');
      if (spend[catId] != null) {
        sum += spend[catId];
        count++;
      }
    }
    if (count === 0) return 0;
    const avg = sum / count;
    return Math.ceil(avg / 10) * 10;
  }

  function categorySpendLastNMonths(state, catId, yyyymm, n) {
    const out = [];
    for (let i = 1; i <= n; i++) {
      const m = Fmt.addMonthsToKey(yyyymm, -i);
      const spend = categorySpend(state, m, 'gasto');
      out.push({ month: m, amount: spend[catId] || 0 });
    }
    return out.reverse();
  }

  function goalMonthlyNeeded(goal) {
    const remaining = goal.target - goal.saved;
    if (remaining <= 0) return 0;
    if (!goal.deadline) return remaining;
    const today = Fmt.parseLocalDate(Fmt.todayLocal());
    const dl = Fmt.parseLocalDate(goal.deadline);
    const months = Math.max((dl.getFullYear() - today.getFullYear()) * 12 + (dl.getMonth() - today.getMonth()), 1);
    return Fmt.round2(remaining / months);
  }

  function rule502030(state, yyyymm) {
    const list = monthTx(state, yyyymm);
    let income = 0;
    const byGroup = { necesidad: 0, deseo: 0, ahorro: 0 };
    for (const t of list) {
      if (t.type === 'ingreso') income += t.amount;
      else if (t.type === 'gasto') {
        const cat = catById(state, t.cat);
        const group = cat ? cat.group : 'deseo';
        byGroup[group] = (byGroup[group] || 0) + t.amount;
      }
    }
    const sobrante = income - (byGroup.necesidad + byGroup.deseo + byGroup.ahorro);
    const ahorroReal = byGroup.ahorro + Math.max(sobrante, 0);
    return {
      income: Fmt.round2(income),
      necesidad: { meta: Fmt.round2(income * 0.5), real: Fmt.round2(byGroup.necesidad) },
      deseo: { meta: Fmt.round2(income * 0.3), real: Fmt.round2(byGroup.deseo) },
      ahorro: { meta: Fmt.round2(income * 0.2), real: Fmt.round2(ahorroReal) },
    };
  }

  function addDaysToStr(dateStr, days) {
    const d = Fmt.parseLocalDate(dateStr);
    d.setDate(d.getDate() + days);
    return Fmt.dateToLocalStr(d);
  }

  function addMonthsClamped(dateStr, monthsDelta, day) {
    const d = Fmt.parseLocalDate(dateStr);
    let y = d.getFullYear();
    let m = d.getMonth() + monthsDelta;
    y += Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    const targetDay = day || d.getDate();
    const daysInTarget = new Date(y, m + 1, 0).getDate();
    const finalDay = Math.min(targetDay, daysInTarget);
    return Fmt.dateToLocalStr(new Date(y, m, finalDay));
  }

  function nextRecurringDate(rec) {
    if (rec.freq === 'semanal') return addDaysToStr(rec.next, 7);
    if (rec.freq === 'quincenal') return addDaysToStr(rec.next, 15);
    if (rec.freq === 'mensual') return addMonthsClamped(rec.next, 1, rec.day);
    if (rec.freq === 'anual') return addMonthsClamped(rec.next, 12, rec.day);
    return addDaysToStr(rec.next, 30);
  }

  function generatePendingRecurring(state, todayStr) {
    const created = [];
    const CAP = 60;
    for (const rec of state.recurring) {
      if (!rec.active) continue;
      let guard = 0;
      while (rec.next <= todayStr && guard < CAP) {
        const txObj = {
          id: Fmt.uid(), type: rec.type, amount: rec.amount, cat: rec.cat,
          acc: rec.acc, toAcc: rec.toAcc, date: rec.next, note: rec.note, recId: rec.id,
        };
        state.tx.push(txObj);
        created.push(txObj);
        rec.next = nextRecurringDate(rec);
        guard++;
      }
    }
    return created;
  }

  function monthlyEquivalent(rec) {
    if (rec.freq === 'semanal') return rec.amount * (52 / 12);
    if (rec.freq === 'quincenal') return rec.amount * (24 / 12);
    if (rec.freq === 'anual') return rec.amount / 12;
    return rec.amount;
  }

  window.BolsilloState = {
    DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS,
    defaultState, migrateState, catById, accById,
    accountBalance, totalBalance, monthTx, monthSummary, categorySpend,
    last6MonthsData, budgetStatus, porAsignar, dailyAllowance, suggestBudget,
    categorySpendLastNMonths, goalMonthlyNeeded, rule502030,
    addDaysToStr, addMonthsClamped, nextRecurringDate, generatePendingRecurring,
    monthlyEquivalent,
  };
})();
