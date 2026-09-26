// Vista Inicio: estado financiero del mes.
(function () {
  window.Views = window.Views || {};
  window.Views.after = window.Views.after || {};

  function donutSlices(state, month) {
    const spend = BolsilloState.categorySpend(state, month, 'gasto');
    const rows = Object.keys(spend).map((catId) => {
      const cat = BolsilloState.catById(state, catId);
      return { label: cat ? `${cat.icon} ${cat.name}` : 'Otras', value: spend[catId] };
    }).sort((a, b) => b.value - a.value);
    const top = rows.slice(0, 5);
    const restSum = rows.slice(5).reduce((s, r) => s + r.value, 0);
    if (restSum > 0) top.push({ label: 'Otras', value: restSum });
    return top;
  }

  function recentTx(state, n) {
    return [...state.tx].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, n);
  }

  function txIcon(state, t) {
    if (t.type === 'transfer') return '🔁';
    const cat = BolsilloState.catById(state, t.cat);
    return cat ? cat.icon : '💳';
  }

  function txLabel(state, t) {
    if (t.type === 'transfer') {
      const from = BolsilloState.accById(state, t.acc);
      const to = BolsilloState.accById(state, t.toAcc);
      return `${from ? from.name : '?'} → ${to ? to.name : '?'}`;
    }
    const cat = BolsilloState.catById(state, t.cat);
    return cat ? cat.name : 'Sin categoría';
  }

  function txRowHTML(state, t) {
    const currency = state.settings.currency;
    const sign = t.type === 'ingreso' ? '+' : t.type === 'gasto' ? '−' : '';
    const cls = t.type === 'ingreso' ? 'income' : t.type === 'gasto' ? 'expense' : '';
    return `<div class="tx-row" data-action="open-tx-edit" data-id="${t.id}">
      <div class="icon">${txIcon(state, t)}</div>
      <div class="mid">
        <div class="cat">${Fmt.esc(txLabel(state, t))}</div>
        <div class="note">${Fmt.esc(t.note || Fmt.formatDateHuman(t.date, Fmt.localeForCurrency(currency)))}</div>
      </div>
      <div class="amt ${cls}">${sign}${Fmt.formatCurrency(t.amount, currency)}</div>
    </div>`;
  }

  function budgetAlerts(state, month) {
    const status = BolsilloState.budgetStatus(state, month);
    const bad = status.rows.filter((r) => r.level !== 'ok');
    if (!bad.length) return '';
    return bad.map((r) => `<div class="alert-banner ${r.level === 'over' ? 'over' : ''}">
      ${r.level === 'over' ? '⚠️' : '🔔'} ${Fmt.esc(r.cat ? r.cat.name : '')}: ${Math.round(r.pct)}% de tu límite
    </div>`).join('');
  }

  window.Views.inicio = function inicio(state, app) {
    const month = app.month;
    const currency = state.settings.currency;
    const locale = Fmt.localeForCurrency(currency);
    const summary = BolsilloState.monthSummary(state, month);
    const total = BolsilloState.totalBalance(state);
    const slices = donutSlices(state, month);
    const bars = BolsilloState.last6MonthsData(state, month);
    const recent = recentTx(state, 5);
    const hasAnyTx = state.tx.length > 0;

    return `
      <div class="month-picker">
        <button class="icon-btn sm" data-action="month-prev" aria-label="Mes anterior">‹</button>
        <span class="label">${Fmt.monthLabel(month, locale)}</span>
        <button class="icon-btn sm" data-action="month-next" aria-label="Mes siguiente">›</button>
      </div>
      <div class="balance-hero">
        <div class="label">Saldo total</div>
        <div class="balance-amount tabular">${Fmt.formatCurrency(total, currency)}</div>
        <div class="balance-sub">
          <div class="stat income"><div class="n tabular">${Fmt.formatCurrency(summary.income, currency)}</div><div class="l">Ingresos</div></div>
          <div class="stat expense"><div class="n tabular">${Fmt.formatCurrency(summary.expense, currency)}</div><div class="l">Gastos</div></div>
          <div class="stat"><div class="n tabular">${summary.savingsRate}%</div><div class="l">Ahorro</div></div>
        </div>
      </div>

      ${budgetAlerts(state, month)}

      ${state.accounts.length ? `<div class="acc-carousel">
        ${state.accounts.map((a) => {
          const bal = BolsilloState.accountBalance(state, a.id);
          return `<div class="acc-card">
            <div class="icon">${a.icon}</div>
            <div class="name">${Fmt.esc(a.name)}</div>
            <div class="amt tabular ${bal < 0 ? 'neg' : ''}">${Fmt.formatCurrency(bal, currency)}</div>
          </div>`;
        }).join('')}
      </div>` : ''}

      <div class="card">
        <h2>Gastos por categoría</h2>
        ${slices.length ? `<div class="donut-wrap">
          ${BolsilloCharts.donutChart(slices)}
          <ul class="legend-list">${BolsilloCharts.donutLegend(slices, currency)}</ul>
        </div>` : `<div class="empty-state"><span class="emoji">🧾</span><p>Sin gastos este mes todavía.</p>
          <button class="btn primary" data-action="open-tx">Registrar gasto</button></div>`}
      </div>

      <div class="card">
        <h2>Ingresos y gastos · 6 meses</h2>
        ${BolsilloCharts.barChart6m(bars)}
      </div>

      <div class="card">
        <div class="row-between"><h2>Movimientos recientes</h2>
          ${hasAnyTx ? '<button class="btn ghost sm" data-action="nav" data-view="movimientos">Ver todos</button>' : ''}
        </div>
        ${recent.length ? recent.map((t) => txRowHTML(state, t)).join('') : `
          <div class="empty-state"><span class="emoji">👛</span><p>Todavía no registras movimientos.</p>
          <button class="btn primary" data-action="open-tx">Registrar gasto</button></div>`}
      </div>
    `;
  };

  Object.assign(window.Actions || (window.Actions = {}), {
    'open-tx-edit': (el, e, app) => app.openTxSheet(el.dataset.id),
  });
})();
