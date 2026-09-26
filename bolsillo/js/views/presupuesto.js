// Vista Presupuesto: Sobres, Metas, 50/30/20 y Fijos.
(function () {
  window.Views = window.Views || {};
  window.Views.after = window.Views.after || {};

  const TABS = [
    { id: 'sobres', label: 'Sobres' },
    { id: 'metas', label: 'Metas' },
    { id: 'regla', label: '50/30/20' },
    { id: 'fijos', label: 'Fijos' },
  ];

  function envelopeCard(state, row, currency) {
    return `<div class="envelope" data-action="env-edit" data-cat="${row.catId}">
      <div class="envelope-body">
        <div class="envelope-head">
          <span class="name">${row.cat ? row.cat.icon : ''} ${Fmt.esc(row.cat ? row.cat.name : '')}</span>
          <span class="tabular">${Fmt.formatCurrency(row.spent, currency)} / ${Fmt.formatCurrency(row.limit, currency)}</span>
        </div>
        <div class="progress-track"><div class="progress-fill ${row.level === 'over' ? 'over' : row.level === 'warn' ? 'warn' : ''}" style="width:${Math.min(row.pct, 100)}%"></div></div>
        <div class="envelope-foot">
          <span>${Math.round(row.pct)}% usado</span>
          <span class="${row.available < 0 ? 'avail neg' : 'avail'}">${row.available < 0 ? 'Excedido ' : 'Disponible '}${Fmt.formatCurrency(Math.abs(row.available), currency)}</span>
        </div>
      </div>
    </div>`;
  }

  function sobresTab(state, app) {
    const month = app.month;
    const currency = state.settings.currency;
    const status = BolsilloState.budgetStatus(state, month);
    const asignar = BolsilloState.porAsignar(state);
    const daily = BolsilloState.dailyAllowance(state, month);
    return `
      <div class="card">
        <h2>Base cero</h2>
        <div class="row-between"><span>Ingreso esperado</span><span class="tabular">${Fmt.formatCurrency(state.settings.expectedIncome, currency)}</span></div>
        <div class="row-between"><span>Presupuestado</span><span class="tabular">${Fmt.formatCurrency(status.totalBudgeted, currency)}</span></div>
        <div class="row-between" style="font-weight:800;margin-top:6px"><span>Por asignar</span><span class="tabular" style="color:${asignar < 0 ? 'var(--out)' : 'var(--in)'}">${Fmt.formatCurrency(asignar, currency)}</span></div>
      </div>
      <div class="totals-row">
        <div class="card"><div class="n tabular">${Fmt.formatCurrency(status.totalBudgeted, currency)}</div><div class="l">Presupuestado</div></div>
        <div class="card"><div class="n tabular">${Fmt.formatCurrency(status.totalSpent, currency)}</div><div class="l">Gastado</div></div>
        <div class="card"><div class="n tabular">${Fmt.formatCurrency(status.available, currency)}</div><div class="l">Disponible</div></div>
      </div>
      ${daily.isCurrent ? `<div class="card">
        <p>Te quedan <strong>${daily.daysLeft}</strong> días: puedes gastar <strong class="tabular">${Fmt.formatCurrency(Math.max(daily.perDay, 0), currency)}</strong> al día.</p>
        <p class="text-muted">Al ritmo actual, cerrarás el mes en <strong class="tabular" style="color:${daily.over ? 'var(--out)' : 'var(--ink)'}">${Fmt.formatCurrency(daily.projected, currency)}</strong>${daily.over ? ' (por arriba de tu presupuesto)' : ''}.</p>
      </div>` : ''}
      <div class="row-between"><h2>Tus sobres</h2><button class="btn ghost sm" data-action="env-add">Agregar sobre</button></div>
      ${status.rows.length ? status.rows.map((r) => envelopeCard(state, r, currency)).join('') : `<div class="empty-state"><span class="emoji">✉️</span><p>Todavía no tienes sobres de presupuesto.</p></div>`}
      ${status.withoutBudget.length ? `<div class="card">
        <h3>Gastaste sin presupuesto</h3>
        ${status.withoutBudget.map((r) => `<div class="row-between" style="padding:6px 0">
          <span>${r.cat ? r.cat.icon : ''} ${Fmt.esc(r.cat ? r.cat.name : '')} · ${Fmt.formatCurrency(r.spent, currency)}</span>
          <button class="btn sm" data-action="env-assign" data-cat="${r.catId}">Asignar</button>
        </div>`).join('')}
      </div>` : ''}
    `;
  }

  function envSheetHTML(state, catId) {
    const cat = BolsilloState.catById(state, catId);
    const currency = state.settings.currency;
    const limit = state.budgets[catId] || 0;
    const month = window.App.month;
    const hist = BolsilloState.categorySpendLastNMonths(state, catId, month, 3);
    const locale = Fmt.localeForCurrency(currency);
    return `
      <div class="sheet-handle"></div>
      <div class="sheet-head"><h2>${cat ? cat.icon : ''} ${Fmt.esc(cat ? cat.name : '')}</h2>
        <button class="icon-btn" data-action="close-sheet" aria-label="Cerrar">✕</button></div>
      <div class="field"><label for="envLimit">Límite mensual</label>
        <input type="text" inputmode="decimal" id="envLimit" value="${limit ? Fmt.formatNumber(limit, currency) : ''}" placeholder="0.00"></div>
      <button class="btn ghost sm" data-action="env-suggest" data-cat="${catId}" style="margin-bottom:14px">Sugerir con mi promedio de 3 meses</button>
      <div class="card">
        <h3>Gasto en los últimos 3 meses</h3>
        ${hist.map((h) => `<div class="row-between"><span>${Fmt.monthLabel(h.month, locale)}</span><span class="tabular">${Fmt.formatCurrency(h.amount, currency)}</span></div>`).join('')}
      </div>
      <button class="btn primary block" data-action="env-save" data-cat="${catId}">Guardar sobre</button>
      ${limit ? `<button class="btn danger block" style="margin-top:10px" data-action="env-remove" data-cat="${catId}">Quitar presupuesto</button>` : ''}
    `;
  }

  function goalCard(g, currency) {
    const pct = g.target > 0 ? Math.min(Math.round((g.saved / g.target) * 100), 100) : 0;
    const needed = BolsilloState.goalMonthlyNeeded(g);
    return `<div class="card goal-card" data-action="goal-edit" data-id="${g.id}">
      <div class="icon">${g.icon || '🎯'}</div>
      <div class="info">
        <div style="font-weight:700">${Fmt.esc(g.name)}</div>
        <div class="progress-track" style="margin:6px 0"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="row-between text-muted" style="font-size:0.78rem">
          <span class="tabular">${Fmt.formatCurrency(g.saved, currency)} de ${Fmt.formatCurrency(g.target, currency)}</span>
          <span>${pct}%</span>
        </div>
        ${needed > 0 ? `<div class="text-muted" style="font-size:0.78rem">Aporta ${Fmt.formatCurrency(needed, currency)}/mes para llegar</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <button class="btn sm pine" data-action="goal-contribute" data-id="${g.id}" data-mode="aportar">Aportar</button>
        <button class="btn sm ghost" data-action="goal-contribute" data-id="${g.id}" data-mode="retirar">Retirar</button>
      </div>
    </div>`;
  }

  function metasTab(state, app) {
    const currency = state.settings.currency;
    return `
      <div class="row-between"><h2>Metas de ahorro</h2><button class="btn ghost sm" data-action="goal-add">Nueva meta</button></div>
      ${state.goals.length ? state.goals.map((g) => goalCard(g, currency)).join('') : `<div class="empty-state"><span class="emoji">🎯</span><p>Todavía no tienes metas.</p>
        <button class="btn primary" data-action="goal-add">Crear meta</button></div>`}
    `;
  }

  function goalSheetHTML(state, goal) {
    const editing = !!goal;
    const g = goal || { name: '', icon: '🎯', target: 0, saved: 0, deadline: '' };
    const currency = state.settings.currency;
    return `
      <div class="sheet-handle"></div>
      <div class="sheet-head"><h2>${editing ? 'Editar meta' : 'Nueva meta'}</h2>
        <button class="icon-btn" data-action="close-sheet" aria-label="Cerrar">✕</button></div>
      <div class="field"><label for="goalIcon">Ícono</label><input type="text" id="goalIcon" maxlength="4" value="${Fmt.esc(g.icon)}"></div>
      <div class="field"><label for="goalName">Nombre</label><input type="text" id="goalName" value="${Fmt.esc(g.name)}" placeholder="Vacaciones"></div>
      <div class="field"><label for="goalTarget">Objetivo</label><input type="text" inputmode="decimal" id="goalTarget" value="${g.target ? Fmt.formatNumber(g.target, currency) : ''}"></div>
      <div class="field"><label for="goalSaved">Ahorrado hasta ahora</label><input type="text" inputmode="decimal" id="goalSaved" value="${g.saved ? Fmt.formatNumber(g.saved, currency) : ''}"></div>
      <div class="field"><label for="goalDeadline">Fecha límite</label><input type="date" id="goalDeadline" value="${g.deadline || ''}"></div>
      <div id="goalError" style="color:var(--out);font-weight:700;margin-bottom:10px"></div>
      <button class="btn primary block" data-action="goal-save" data-id="${editing ? g.id : ''}">Guardar meta</button>
      ${editing ? `<button class="btn danger block" style="margin-top:10px" data-action="goal-delete" data-id="${g.id}">Eliminar meta</button>` : ''}
    `;
  }

  function contribSheetHTML(state, goal, mode) {
    const currency = state.settings.currency;
    const accOptions = state.accounts.map((a) => `<option value="${a.id}">${a.icon} ${Fmt.esc(a.name)}</option>`).join('');
    return `
      <div class="sheet-handle"></div>
      <div class="sheet-head"><h2>${mode === 'aportar' ? 'Aportar a' : 'Retirar de'} ${Fmt.esc(goal.name)}</h2>
        <button class="icon-btn" data-action="close-sheet" aria-label="Cerrar">✕</button></div>
      <input class="amount-input" id="contribAmount" inputmode="decimal" type="text" placeholder="0.00" aria-label="Monto">
      ${mode === 'aportar' ? `
        <div class="field"><label for="contribAcc">Cuenta</label><select id="contribAcc">${accOptions}</select></div>
        <label class="row-between" style="margin-bottom:14px"><span>Registrar también como gasto en Ahorro</span>
          <input type="checkbox" id="contribAsExpense" checked style="width:20px;height:20px"></label>
      ` : ''}
      <div id="contribError" style="color:var(--out);font-weight:700;margin-bottom:10px"></div>
      <button class="btn primary block" data-action="goal-contrib-save" data-id="${goal.id}" data-mode="${mode}">Confirmar</button>
    `;
  }

  function reglaTab(state, app) {
    const currency = state.settings.currency;
    const r = BolsilloState.rule502030(state, app.month);
    const row = (label, o) => {
      const pct = o.meta > 0 ? Math.min(Math.round((o.real / o.meta) * 100), 999) : 0;
      return `<div class="card">
        <div class="row-between" style="font-weight:700">${label}<span>${pct}%</span></div>
        <div class="progress-track" style="margin:8px 0"><div class="progress-fill ${o.real > o.meta ? 'warn' : ''}" style="width:${Math.min(pct, 100)}%"></div></div>
        <div class="row-between text-muted" style="font-size:0.82rem"><span>Real: ${Fmt.formatCurrency(o.real, currency)}</span><span>Meta: ${Fmt.formatCurrency(o.meta, currency)}</span></div>
      </div>`;
    };
    if (r.income <= 0) {
      return `<div class="empty-state"><span class="emoji">📊</span><p>Registra ingresos este mes para ver tu regla 50/30/20.</p></div>`;
    }
    return row('Necesidades · meta 50%', r.necesidad) + row('Deseos · meta 30%', r.deseo) + row('Ahorro · meta 20%', r.ahorro);
  }

  function fijoRow(state, rec, currency) {
    const cat = BolsilloState.catById(state, rec.cat);
    const acc = BolsilloState.accById(state, rec.acc);
    const freqLabel = { semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual', anual: 'Anual' }[rec.freq] || rec.freq;
    return `<div class="settings-item">
      <div style="flex:1;min-width:0" data-action="fijo-edit" data-id="${rec.id}">
        <div style="font-weight:700">${cat ? cat.icon : '🔁'} ${Fmt.esc(cat ? cat.name : rec.type)} · ${Fmt.formatCurrency(rec.amount, currency)}</div>
        <div class="text-muted" style="font-size:0.78rem">${freqLabel} · próximo ${Fmt.formatDateHuman(rec.next, Fmt.localeForCurrency(currency))} · ${acc ? acc.name : ''} ${!rec.active ? '· pausado' : ''}</div>
      </div>
      <button class="btn sm ghost" data-action="fijo-toggle" data-id="${rec.id}">${rec.active ? 'Pausar' : 'Reanudar'}</button>
    </div>`;
  }

  function fijosTab(state, app) {
    const currency = state.settings.currency;
    const monthlyTotal = state.recurring.filter((r) => r.active).reduce((s, r) => s + BolsilloState.monthlyEquivalent(r), 0);
    return `
      <div class="card row-between"><span>Equivalente mensual total</span><span class="tabular" style="font-weight:800">${Fmt.formatCurrency(monthlyTotal, currency)}</span></div>
      <div class="row-between"><h2>Movimientos fijos</h2><button class="btn ghost sm" data-action="fijo-add">Nuevo fijo</button></div>
      ${state.recurring.length ? state.recurring.map((r) => fijoRow(state, r, currency)).join('') : `<div class="empty-state"><span class="emoji">🔁</span><p>Todavía no tienes movimientos fijos.</p></div>`}
    `;
  }

  function fijoSheetHTML(state, rec) {
    const editing = !!(rec && rec.id);
    const r = rec || { type: 'gasto', amount: 0, cat: (state.categories.find((c) => c.type === 'gasto') || {}).id, acc: (state.accounts[0] || {}).id, note: '', freq: 'mensual', next: Fmt.todayLocal() };
    const currency = state.settings.currency;
    const cats = state.categories.filter((c) => c.type === r.type);
    const accOptions = state.accounts.map((a) => `<option value="${a.id}" ${a.id === r.acc ? 'selected' : ''}>${a.icon} ${Fmt.esc(a.name)}</option>`).join('');
    return `
      <div class="sheet-handle"></div>
      <div class="sheet-head"><h2>${editing ? 'Editar fijo' : 'Nuevo fijo'}</h2>
        <button class="icon-btn" data-action="close-sheet" aria-label="Cerrar">✕</button></div>
      <div class="type-toggle">
        <button type="button" class="${r.type === 'gasto' ? 'active gasto' : ''}" data-action="fijo-type" data-type="gasto">Gasto</button>
        <button type="button" class="${r.type === 'ingreso' ? 'active ingreso' : ''}" data-action="fijo-type" data-type="ingreso">Ingreso</button>
      </div>
      <input class="amount-input" id="fijoAmount" inputmode="decimal" type="text" value="${r.amount ? Fmt.formatNumber(r.amount, currency) : ''}" placeholder="0.00">
      <div class="cat-grid">
        ${cats.map((c) => `<button type="button" class="cat-chip ${c.id === r.cat ? 'active' : ''}" data-action="fijo-cat" data-cat="${c.id}"><span class="em">${c.icon}</span><span>${Fmt.esc(c.name)}</span></button>`).join('')}
      </div>
      <div class="field"><label for="fijoAcc">Cuenta</label><select id="fijoAcc">${accOptions}</select></div>
      <div class="field"><label for="fijoNext">Próxima fecha</label><input type="date" id="fijoNext" value="${r.next}"></div>
      <div class="field"><label for="fijoFreq">Frecuencia</label>
        <select id="fijoFreq">
          <option value="semanal" ${r.freq === 'semanal' ? 'selected' : ''}>Cada semana</option>
          <option value="quincenal" ${r.freq === 'quincenal' ? 'selected' : ''}>Cada 15 días</option>
          <option value="mensual" ${r.freq === 'mensual' ? 'selected' : ''}>Cada mes</option>
          <option value="anual" ${r.freq === 'anual' ? 'selected' : ''}>Cada año</option>
        </select>
      </div>
      <div class="field"><label for="fijoNote">Nota</label><input type="text" id="fijoNote" value="${Fmt.esc(r.note || '')}"></div>
      <div id="fijoError" style="color:var(--out);font-weight:700;margin-bottom:10px"></div>
      <button class="btn primary block" data-action="fijo-save" data-id="${editing ? r.id : ''}">Guardar fijo</button>
      ${editing ? `<button class="btn danger block" style="margin-top:10px" data-action="fijo-delete" data-id="${r.id}">Eliminar</button>` : ''}
    `;
  }

  window.Views.presupuesto = function presupuesto(state, app) {
    const month = app.month;
    const locale = Fmt.localeForCurrency(state.settings.currency);
    const body = app.presTab === 'sobres' ? sobresTab(state, app)
      : app.presTab === 'metas' ? metasTab(state, app)
      : app.presTab === 'regla' ? reglaTab(state, app)
      : fijosTab(state, app);
    return `
      <div class="month-picker">
        <button class="icon-btn sm" data-action="month-prev" aria-label="Mes anterior">‹</button>
        <span class="label">${Fmt.monthLabel(month, locale)}</span>
        <button class="icon-btn sm" data-action="month-next" aria-label="Mes siguiente">›</button>
      </div>
      <div class="segmented">
        ${TABS.map((t) => `<button type="button" class="${app.presTab === t.id ? 'active' : ''}" data-action="pres-tab" data-tab="${t.id}">${t.label}</button>`).join('')}
      </div>
      ${body}
    `;
  };

  Object.assign(window.Actions || (window.Actions = {}), {
    'pres-tab': (el, e, app) => { app.presTab = el.dataset.tab; app.render(); },

    'env-edit': (el, e, app) => app.openSheet(envSheetHTML(app.state, el.dataset.cat)),
    'env-assign': (el, e, app) => app.openSheet(envSheetHTML(app.state, el.dataset.cat)),
    'env-add': (el, e, app) => {
      const without = app.state.categories.filter((c) => c.type === 'gasto' && !(app.state.budgets[c.id] > 0));
      if (!without.length) { app.toast('Ya tienes sobres en todas tus categorías de gasto'); return; }
      app.openSheet(envSheetHTML(app.state, without[0].id));
    },
    'env-suggest': (el, e, app) => {
      const sug = BolsilloState.suggestBudget(app.state, el.dataset.cat, app.month);
      const input = document.getElementById('envLimit');
      if (input) input.value = Fmt.formatNumber(sug, app.state.settings.currency);
    },
    'env-save': async (el, e, app) => {
      const val = Fmt.parseAmount(document.getElementById('envLimit').value);
      if (val > 0) app.state.budgets[el.dataset.cat] = val;
      else delete app.state.budgets[el.dataset.cat];
      await app.save();
      app.closeSheet();
      app.render();
      app.toast('Sobre guardado');
    },
    'env-remove': async (el, e, app) => {
      delete app.state.budgets[el.dataset.cat];
      await app.save();
      app.closeSheet();
      app.render();
      app.toast('Presupuesto eliminado');
    },

    'goal-add': (el, e, app) => app.openSheet(goalSheetHTML(app.state, null)),
    'goal-edit': (el, e, app) => {
      const g = app.state.goals.find((x) => x.id === el.dataset.id);
      app.openSheet(goalSheetHTML(app.state, g));
    },
    'goal-save': async (el, e, app) => {
      const errBox = document.getElementById('goalError');
      const name = document.getElementById('goalName').value.trim();
      const icon = document.getElementById('goalIcon').value.trim() || '🎯';
      const target = Fmt.parseAmount(document.getElementById('goalTarget').value);
      const saved = Fmt.parseAmount(document.getElementById('goalSaved').value);
      const deadline = document.getElementById('goalDeadline').value;
      if (!name) { errBox.textContent = 'Ponle un nombre a tu meta.'; return; }
      if (!(target > 0)) { errBox.textContent = 'El objetivo debe ser mayor a cero.'; return; }
      const id = el.dataset.id;
      if (id) {
        const g = app.state.goals.find((x) => x.id === id);
        Object.assign(g, { name, icon, target, saved, deadline });
      } else {
        app.state.goals.push({ id: Fmt.uid(), name, icon, target, saved, deadline });
      }
      await app.save();
      app.closeSheet();
      app.render();
      app.toast('Meta guardada');
    },
    'goal-delete': async (el, e, app) => {
      if (!confirm('¿Eliminar esta meta?')) return;
      app.state.goals = app.state.goals.filter((g) => g.id !== el.dataset.id);
      await app.save();
      app.closeSheet();
      app.render();
      app.toast('Meta eliminada');
    },
    'goal-contribute': (el, e, app) => {
      const g = app.state.goals.find((x) => x.id === el.dataset.id);
      app.openSheet(contribSheetHTML(app.state, g, el.dataset.mode));
    },
    'goal-contrib-save': async (el, e, app) => {
      const g = app.state.goals.find((x) => x.id === el.dataset.id);
      const mode = el.dataset.mode;
      const errBox = document.getElementById('contribError');
      const amount = Fmt.parseAmount(document.getElementById('contribAmount').value);
      if (!(amount > 0)) { errBox.textContent = 'El monto debe ser mayor a cero.'; return; }
      if (mode === 'retirar' && amount > g.saved) { errBox.textContent = 'No puedes retirar más de lo ahorrado.'; return; }
      g.saved = Fmt.round2(g.saved + (mode === 'aportar' ? amount : -amount));
      if (mode === 'aportar') {
        const asExpense = document.getElementById('contribAsExpense');
        if (asExpense && asExpense.checked) {
          const acc = document.getElementById('contribAcc').value;
          const ahorroCat = app.state.categories.find((c) => c.type === 'gasto' && c.group === 'ahorro') || app.state.categories.find((c) => c.type === 'gasto');
          app.state.tx.push({ id: Fmt.uid(), type: 'gasto', amount, cat: ahorroCat.id, acc, date: Fmt.todayLocal(), note: `Aporte a meta: ${g.name}` });
        }
      }
      await app.save();
      app.closeSheet();
      app.render();
      app.toast(mode === 'aportar' ? 'Aporte registrado' : 'Retiro registrado');
    },

    'fijo-add': (el, e, app) => app.openSheet(fijoSheetHTML(app.state, null)),
    'fijo-edit': (el, e, app) => {
      const r = app.state.recurring.find((x) => x.id === el.dataset.id);
      app.openSheet(fijoSheetHTML(app.state, r));
    },
    'fijo-type': (el, e, app) => {
      const id = document.querySelector('[data-action="fijo-save"]').dataset.id || undefined;
      const amount = Fmt.parseAmount(document.getElementById('fijoAmount').value);
      const acc = document.getElementById('fijoAcc').value;
      const next = document.getElementById('fijoNext').value;
      const freq = document.getElementById('fijoFreq').value;
      const note = document.getElementById('fijoNote').value;
      const type = el.dataset.type;
      const cats = app.state.categories.filter((c) => c.type === type);
      app.openSheet(fijoSheetHTML(app.state, { id, type, amount, cat: cats[0] ? cats[0].id : '', acc, next, freq, note }));
    },
    'fijo-cat': (el, e, app) => {
      const id = document.querySelector('[data-action="fijo-save"]').dataset.id || undefined;
      const amount = Fmt.parseAmount(document.getElementById('fijoAmount').value);
      const acc = document.getElementById('fijoAcc').value;
      const next = document.getElementById('fijoNext').value;
      const freq = document.getElementById('fijoFreq').value;
      const note = document.getElementById('fijoNote').value;
      const typeBtn = document.querySelector('.type-toggle button.active');
      const type = typeBtn ? typeBtn.dataset.type : 'gasto';
      app.openSheet(fijoSheetHTML(app.state, { id, type, amount, cat: el.dataset.cat, acc, next, freq, note }));
    },
    'fijo-save': async (el, e, app) => {
      const errBox = document.getElementById('fijoError');
      const amount = Fmt.parseAmount(document.getElementById('fijoAmount').value);
      const acc = document.getElementById('fijoAcc').value;
      const next = document.getElementById('fijoNext').value || Fmt.todayLocal();
      const freq = document.getElementById('fijoFreq').value;
      const note = document.getElementById('fijoNote').value;
      const typeBtn = document.querySelector('.type-toggle button.active');
      const type = typeBtn ? typeBtn.dataset.type : 'gasto';
      const catBtn = document.querySelector('.cat-chip.active');
      const cat = catBtn ? catBtn.dataset.cat : '';
      if (!(amount > 0)) { errBox.textContent = 'El monto debe ser mayor a cero.'; return; }
      const day = Number(next.slice(8, 10));
      const id = el.dataset.id;
      if (id) {
        const r = app.state.recurring.find((x) => x.id === id);
        Object.assign(r, { type, amount, cat, acc, next, freq, note, day });
      } else {
        app.state.recurring.push({ id: Fmt.uid(), type, amount, cat, acc, next, freq, note, day, active: true });
      }
      await app.save();
      app.closeSheet();
      app.render();
      app.toast('Fijo guardado');
    },
    'fijo-toggle': async (el, e, app) => {
      const r = app.state.recurring.find((x) => x.id === el.dataset.id);
      r.active = !r.active;
      await app.save();
      app.render();
    },
    'fijo-delete': async (el, e, app) => {
      if (!confirm('¿Eliminar este movimiento fijo?')) return;
      app.state.recurring = app.state.recurring.filter((r) => r.id !== el.dataset.id);
      await app.save();
      app.closeSheet();
      app.render();
      app.toast('Fijo eliminado');
    },
  });
})();
