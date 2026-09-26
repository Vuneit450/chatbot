// Vista Movimientos: lista del mes, buscador, filtros y exportar CSV.
(function () {
  window.Views = window.Views || {};
  window.Views.after = window.Views.after || {};

  const FILTERS = [
    { id: 'all', label: 'Todos' },
    { id: 'gasto', label: 'Gastos' },
    { id: 'ingreso', label: 'Ingresos' },
    { id: 'transfer', label: 'Transferencias' },
  ];

  function matchesQuery(state, t, q) {
    if (!q) return true;
    const cat = BolsilloState.catById(state, t.cat);
    const acc = BolsilloState.accById(state, t.acc);
    const toAcc = BolsilloState.accById(state, t.toAcc);
    const hay = [t.note, cat && cat.name, acc && acc.name, toAcc && toAcc.name, String(t.amount)]
      .filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q.toLowerCase());
  }

  function txIconLabel(state, t) {
    if (t.type === 'transfer') {
      const from = BolsilloState.accById(state, t.acc);
      const to = BolsilloState.accById(state, t.toAcc);
      return { icon: '🔁', label: `${from ? from.name : '?'} → ${to ? to.name : '?'}` };
    }
    const cat = BolsilloState.catById(state, t.cat);
    return { icon: cat ? cat.icon : '💳', label: cat ? cat.name : 'Sin categoría' };
  }

  function txRowHTML(state, t) {
    const currency = state.settings.currency;
    const sign = t.type === 'ingreso' ? '+' : t.type === 'gasto' ? '−' : '';
    const cls = t.type === 'ingreso' ? 'income' : t.type === 'gasto' ? 'expense' : '';
    const { icon, label } = txIconLabel(state, t);
    return `<div class="tx-row" data-action="open-tx-edit" data-id="${t.id}">
      <div class="icon">${icon}</div>
      <div class="mid">
        <div class="cat">${Fmt.esc(label)}</div>
        ${t.note ? `<div class="note">${Fmt.esc(t.note)}</div>` : ''}
      </div>
      <div class="amt ${cls}">${sign}${Fmt.formatCurrency(t.amount, currency)}</div>
    </div>`;
  }

  function listInner(state, app) {
    const month = app.month;
    const { type, q } = app.movFilter;
    const currency = state.settings.currency;
    const locale = Fmt.localeForCurrency(currency);
    let list = BolsilloState.monthTx(state, month);
    if (type !== 'all') list = list.filter((t) => t.type === type);
    list = list.filter((t) => matchesQuery(state, t, q));

    let income = 0; let expense = 0;
    for (const t of list) {
      if (t.type === 'ingreso') income += t.amount;
      else if (t.type === 'gasto') expense += t.amount;
    }

    const byDay = {};
    for (const t of list) {
      (byDay[t.date] = byDay[t.date] || []).push(t);
    }
    const days = Object.keys(byDay).sort((a, b) => (a < b ? 1 : -1));

    const totalsHTML = `<div class="totals-row">
      <div class="card"><div class="n tabular" style="color:var(--in)">${Fmt.formatCurrency(income, currency)}</div><div class="l">Ingresos</div></div>
      <div class="card"><div class="n tabular" style="color:var(--out)">${Fmt.formatCurrency(expense, currency)}</div><div class="l">Gastos</div></div>
      <div class="card"><div class="n tabular">${Fmt.formatCurrency(income - expense, currency)}</div><div class="l">Neto</div></div>
    </div>`;

    if (!days.length) {
      return totalsHTML + `<div class="empty-state"><span class="emoji">🔍</span><p>No hay movimientos con estos filtros.</p></div>`;
    }

    const daysHTML = days.map((day) => {
      const items = byDay[day];
      const net = items.reduce((s, t) => s + (t.type === 'ingreso' ? t.amount : t.type === 'gasto' ? -t.amount : 0), 0);
      return `<div class="tx-day">
        <div class="tx-day-head"><span>${Fmt.formatDateLong(day, locale)}</span><span class="tabular">${Fmt.formatCurrency(net, currency)}</span></div>
        ${items.map((t) => txRowHTML(state, t)).join('')}
      </div>`;
    }).join('');

    return totalsHTML + daysHTML;
  }

  window.Views.movimientos = function movimientos(state, app) {
    const month = app.month;
    const locale = Fmt.localeForCurrency(state.settings.currency);
    return `
      <div class="month-picker">
        <button class="icon-btn sm" data-action="month-prev" aria-label="Mes anterior">‹</button>
        <span class="label">${Fmt.monthLabel(month, locale)}</span>
        <button class="icon-btn sm" data-action="month-next" aria-label="Mes siguiente">›</button>
      </div>
      <div class="search-box">
        <input type="text" id="movSearch" placeholder="Buscar por nota, categoría, cuenta o monto"
          value="${Fmt.esc(app.movFilter.q)}" aria-label="Buscar movimientos">
      </div>
      <div class="segmented">
        ${FILTERS.map((f) => `<button type="button" class="${app.movFilter.type === f.id ? 'active' : ''}" data-action="mov-filter" data-type="${f.id}">${f.label}</button>`).join('')}
      </div>
      <div class="row-between" style="margin-bottom:10px">
        <span></span>
        <button class="btn ghost sm" data-action="mov-export-csv">Exportar CSV</button>
      </div>
      <div id="movListWrap">${listInner(state, app)}</div>
    `;
  };

  Object.assign(window.Actions || (window.Actions = {}), {
    'mov-filter': (el, e, app) => {
      app.movFilter.type = el.dataset.type;
      app.render();
    },
    'mov-export-csv': (el, e, app) => {
      const month = app.month;
      const { type, q } = app.movFilter;
      let list = BolsilloState.monthTx(app.state, month);
      if (type !== 'all') list = list.filter((t) => t.type === type);
      list = list.filter((t) => matchesQuery(app.state, t, q));
      const csv = BolsilloBackup.exportCSV(list, app.state);
      BolsilloBackup.downloadText(`bolsillo-${month}.csv`, csv, 'text/csv');
      app.toast('CSV exportado');
    },
  });

  window.Views.updateMovList = function (app) {
    const wrap = document.getElementById('movListWrap');
    if (wrap) wrap.innerHTML = listInner(app.state, app);
  };
})();
