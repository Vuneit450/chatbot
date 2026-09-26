// Vista Ajustes: preferencias, cuentas, categorías, respaldo y datos.
(function () {
  window.Views = window.Views || {};
  window.Views.after = window.Views.after || {};

  const CURRENCIES = ['MXN', 'COP', 'ARS', 'CLP', 'PEN', 'EUR', 'USD'];
  const EMOJI_SET = ['💵', '🏦', '💳', '🐖', '🍽️', '🛒', '🚌', '🏠', '💡', '💊', '📚', '🐾', '👕', '🎬', '📺', '🎁', '✈️', '📦', '💼', '💻', '🏷️', '📈', '🎀', '➕', '🎯', '🚗', '🎓', '🐶', '🍿', '⚽'];

  function segmented(options, current, action) {
    return `<div class="segmented">${options.map((o) => `<button type="button" class="${o.id === current ? 'active' : ''}" data-action="${action}" data-value="${o.id}">${o.label}</button>`).join('')}</div>`;
  }

  function generalSection(state) {
    return `<div class="settings-group">
      <h3>Moneda</h3>
      ${segmented(CURRENCIES.map((c) => ({ id: c, label: c })), state.settings.currency, 'set-currency')}
      <h3>Tema</h3>
      ${segmented([{ id: 'auto', label: 'Auto' }, { id: 'light', label: 'Claro' }, { id: 'dark', label: 'Oscuro' }], state.settings.theme, 'set-theme')}
      <h3>Alerta de presupuesto</h3>
      ${segmented([{ id: 70, label: '70%' }, { id: 80, label: '80%' }, { id: 90, label: '90%' }], state.settings.alert, 'set-alert')}
      <h3>Ingreso mensual esperado</h3>
      <div style="display:flex;gap:8px">
        <input type="text" inputmode="decimal" id="expectedIncomeInput" value="${state.settings.expectedIncome ? Fmt.formatNumber(state.settings.expectedIncome, state.settings.currency) : ''}" style="flex:1;min-height:44px;border-radius:12px;border:2px solid var(--edge);background:var(--surface2);padding:0 12px">
        <button class="btn sm pine" data-action="save-income">Guardar</button>
      </div>
    </div>`;
  }

  function accountsSection(state) {
    return `<div class="settings-group">
      <div class="row-between"><h3>Cuentas</h3><button class="btn ghost sm" data-action="acc-add">Agregar</button></div>
      ${state.accounts.map((a) => `<div class="settings-item">
        <div data-action="acc-edit" data-id="${a.id}" style="flex:1">${a.icon} ${Fmt.esc(a.name)}
          <span class="text-muted"> · ${Fmt.formatCurrency(BolsilloState.accountBalance(state, a.id), state.settings.currency)}</span>
        </div>
      </div>`).join('')}
    </div>`;
  }

  function categoriesSection(state) {
    const gasto = state.categories.filter((c) => c.type === 'gasto');
    const ingreso = state.categories.filter((c) => c.type === 'ingreso');
    const row = (c) => `<div class="settings-item">
      <div data-action="cat-edit" data-id="${c.id}" style="flex:1">${c.icon} ${Fmt.esc(c.name)}</div>
    </div>`;
    return `<div class="settings-group">
      <div class="row-between"><h3>Categorías</h3><button class="btn ghost sm" data-action="cat-add">Agregar</button></div>
      <h3>Gasto</h3>${gasto.map(row).join('')}
      <h3>Ingreso</h3>${ingreso.map(row).join('')}
    </div>`;
  }

  function backupSection(state, storageInfo) {
    return `<div class="settings-group">
      <h3>Respaldo</h3>
      <button class="btn pine block" data-action="backup-export">Exportar copia (JSON)</button>
      <button class="btn ghost block" style="margin-top:8px" data-action="backup-import-trigger">Importar copia</button>
      <input type="file" id="importFile" accept="application/json" hidden>
      <button class="btn ghost block" style="margin-top:8px" data-action="backup-csv-all">Exportar todo a CSV</button>
      <p class="text-muted" style="margin-top:10px">Espacio usado: ${storageInfo}</p>
    </div>`;
  }

  function dataSection(state) {
    const hasTx = state.tx.length > 0;
    return `<div class="settings-group">
      <h3>Datos</h3>
      ${!hasTx ? '<button class="btn ghost block" data-action="load-sample">Probar con datos de ejemplo</button>' : ''}
      <button class="btn danger block" style="margin-top:8px" data-action="wipe-all">Borrar todos los datos</button>
    </div>`;
  }

  window.Views.ajustes = function ajustes(state, app) {
    setTimeout(() => {
      if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate().then((info) => {
          const el = document.getElementById('storageInfo');
          if (el && info.usage != null) {
            const mb = (info.usage / (1024 * 1024)).toFixed(1);
            el.textContent = `Espacio usado: ${mb} MB`;
          }
        });
      }
    }, 0);
    return `
      ${generalSection(state)}
      ${accountsSection(state)}
      ${categoriesSection(state)}
      ${backupSection(state, 'calculando…')}
      ${dataSection(state)}
      <p id="storageInfo" class="text-muted text-center"></p>
    `;
  };

  function accSheetHTML(acc) {
    const editing = !!acc;
    const a = acc || { name: '', icon: '💰', initial: 0 };
    return `
      <div class="sheet-handle"></div>
      <div class="sheet-head"><h2>${editing ? 'Editar cuenta' : 'Nueva cuenta'}</h2>
        <button class="icon-btn" data-action="close-sheet" aria-label="Cerrar">✕</button></div>
      <div class="field"><label for="accName">Nombre</label><input type="text" id="accName" value="${Fmt.esc(a.name)}"></div>
      <div class="field"><label for="accIcon">Ícono</label><input type="text" id="accIcon" maxlength="4" value="${Fmt.esc(a.icon)}"></div>
      <div class="emoji-grid">${EMOJI_SET.map((em) => `<button type="button" data-action="pick-emoji" data-target="accIcon" data-emoji="${em}">${em}</button>`).join('')}</div>
      <div class="field"><label for="accInitial">Saldo inicial</label><input type="text" inputmode="decimal" id="accInitial" value="${a.initial ? a.initial : ''}"></div>
      <div id="accError" style="color:var(--out);font-weight:700;margin-bottom:10px"></div>
      <button class="btn primary block" data-action="acc-save" data-id="${editing ? a.id : ''}">Guardar cuenta</button>
      ${editing ? `<button class="btn danger block" style="margin-top:10px" data-action="acc-delete" data-id="${a.id}">Eliminar cuenta</button>` : ''}
    `;
  }

  function catSheetHTML(cat) {
    const editing = !!(cat && cat.id);
    const c = cat || { name: '', icon: '📦', type: 'gasto', group: 'necesidad' };
    return `
      <div class="sheet-handle"></div>
      <div class="sheet-head"><h2>${editing ? 'Editar categoría' : 'Nueva categoría'}</h2>
        <button class="icon-btn" data-action="close-sheet" aria-label="Cerrar">✕</button></div>
      <div class="type-toggle">
        <button type="button" class="${c.type === 'gasto' ? 'active gasto' : ''}" data-action="cat-set-type" data-type="gasto">Gasto</button>
        <button type="button" class="${c.type === 'ingreso' ? 'active ingreso' : ''}" data-action="cat-set-type" data-type="ingreso">Ingreso</button>
      </div>
      <div class="field"><label for="catName">Nombre</label><input type="text" id="catName" value="${Fmt.esc(c.name)}"></div>
      <div class="field"><label for="catIcon">Ícono</label><input type="text" id="catIcon" maxlength="4" value="${Fmt.esc(c.icon)}"></div>
      <div class="emoji-grid">${EMOJI_SET.map((em) => `<button type="button" data-action="pick-emoji" data-target="catIcon" data-emoji="${em}">${em}</button>`).join('')}</div>
      ${c.type === 'gasto' ? `<div class="field"><label>Grupo</label>
        <div class="segmented">
          ${['necesidad', 'deseo', 'ahorro'].map((g) => `<button type="button" class="${g === c.group ? 'active' : ''}" data-action="cat-set-group" data-group="${g}">${g.charAt(0).toUpperCase() + g.slice(1)}</button>`).join('')}
        </div></div>` : ''}
      <div id="catError" style="color:var(--out);font-weight:700;margin-bottom:10px"></div>
      <button class="btn primary block" data-action="cat-save" data-id="${editing ? c.id : ''}" data-type="${c.type}" data-group="${c.group || 'necesidad'}">Guardar categoría</button>
      ${editing ? `<button class="btn danger block" style="margin-top:10px" data-action="cat-delete" data-id="${c.id}">Eliminar categoría</button>` : ''}
    `;
  }

  function loadSampleData(app) {
    const s = app.state;
    const today = Fmt.todayLocal();
    const month = Fmt.monthKeyOf(today);
    const day = (n) => `${month}-${String(n).padStart(2, '0')}`;
    const cat = (id) => (s.categories.find((c) => c.id === id) || s.categories[0]).id;
    const acc = s.accounts[0].id;
    const acc2 = s.accounts[1] ? s.accounts[1].id : acc;
    s.tx.push(
      { id: Fmt.uid(), type: 'ingreso', amount: 15000, cat: cat('sueldo'), acc, date: day(1), note: 'Nómina' },
      { id: Fmt.uid(), type: 'gasto', amount: 1200, cat: cat('super'), acc, date: day(3), note: 'Súper de la quincena' },
      { id: Fmt.uid(), type: 'gasto', amount: 450, cat: cat('transporte'), acc, date: day(4), note: '' },
      { id: Fmt.uid(), type: 'gasto', amount: 800, cat: cat('ocio'), acc, date: day(6), note: 'Cine y cena' },
      { id: Fmt.uid(), type: 'gasto', amount: 3200, cat: cat('vivienda'), acc: acc2, date: day(5), note: 'Renta' },
      { id: Fmt.uid(), type: 'transfer', amount: 1000, acc, toAcc: acc2, date: day(7), note: 'Ahorro del mes' },
    );
    s.budgets[cat('super')] = 1500;
    s.budgets[cat('ocio')] = 700;
    s.budgets[cat('vivienda')] = 3200;
    s.settings.expectedIncome = 15000;
    s.goals.push({ id: Fmt.uid(), name: 'Vacaciones', icon: '🏖️', target: 10000, saved: 2500, deadline: Fmt.addMonthsToKey(month, 6) + '-15' });
  }

  Object.assign(window.Actions || (window.Actions = {}), {
    'set-currency': async (el, e, app) => { app.state.settings.currency = el.dataset.value; await app.save(); app.render(); },
    'set-theme': async (el, e, app) => { app.state.settings.theme = el.dataset.value; app.applyTheme(); await app.save(); app.render(); },
    'set-alert': async (el, e, app) => { app.state.settings.alert = Number(el.dataset.value); await app.save(); app.render(); },
    'save-income': async (el, e, app) => {
      app.state.settings.expectedIncome = Fmt.parseAmount(document.getElementById('expectedIncomeInput').value);
      await app.save();
      app.toast('Ingreso esperado guardado');
    },

    'acc-add': (el, e, app) => app.openSheet(accSheetHTML(null)),
    'acc-edit': (el, e, app) => app.openSheet(accSheetHTML(app.state.accounts.find((a) => a.id === el.dataset.id))),
    'acc-save': async (el, e, app) => {
      const errBox = document.getElementById('accError');
      const name = document.getElementById('accName').value.trim();
      const icon = document.getElementById('accIcon').value.trim() || '💰';
      const initial = Fmt.parseAmount(document.getElementById('accInitial').value);
      if (!name) { errBox.textContent = 'Ponle un nombre a la cuenta.'; return; }
      const id = el.dataset.id;
      if (id) Object.assign(app.state.accounts.find((a) => a.id === id), { name, icon, initial });
      else app.state.accounts.push({ id: Fmt.uid(), name, icon, initial });
      await app.save();
      app.closeSheet();
      app.render();
      app.toast('Cuenta guardada');
    },
    'acc-delete': async (el, e, app) => {
      const id = el.dataset.id;
      const inUse = app.state.tx.some((t) => t.acc === id || t.toAcc === id);
      if (inUse) { app.toast('No puedes eliminar una cuenta con movimientos'); return; }
      if (!confirm('¿Eliminar esta cuenta?')) return;
      app.state.accounts = app.state.accounts.filter((a) => a.id !== id);
      await app.save();
      app.closeSheet();
      app.render();
      app.toast('Cuenta eliminada');
    },

    'cat-add': (el, e, app) => app.openSheet(catSheetHTML(null)),
    'cat-edit': (el, e, app) => app.openSheet(catSheetHTML(app.state.categories.find((c) => c.id === el.dataset.id))),
    'cat-set-type': (el, e, app) => {
      const id = document.querySelector('[data-action="cat-save"]').dataset.id || undefined;
      const c = { id, name: document.getElementById('catName').value, icon: document.getElementById('catIcon').value, type: el.dataset.type, group: 'necesidad' };
      app.openSheet(catSheetHTML(c));
    },
    'cat-set-group': (el, e, app) => {
      const id = document.querySelector('[data-action="cat-save"]').dataset.id || undefined;
      const c = { id, name: document.getElementById('catName').value, icon: document.getElementById('catIcon').value, type: 'gasto', group: el.dataset.group };
      app.openSheet(catSheetHTML(c));
    },
    'cat-save': async (el, e, app) => {
      const errBox = document.getElementById('catError');
      const name = document.getElementById('catName').value.trim();
      const icon = document.getElementById('catIcon').value.trim() || '📦';
      const type = el.dataset.type;
      const group = el.dataset.group;
      if (!name) { errBox.textContent = 'Ponle un nombre a la categoría.'; return; }
      const id = el.dataset.id;
      if (id) Object.assign(app.state.categories.find((c) => c.id === id), { name, icon, type, group });
      else app.state.categories.push({ id: Fmt.uid(), name, icon, type, group });
      await app.save();
      app.closeSheet();
      app.render();
      app.toast('Categoría guardada');
    },
    'cat-delete': async (el, e, app) => {
      const id = el.dataset.id;
      const inUse = app.state.tx.some((t) => t.cat === id) || app.state.budgets[id] > 0 || app.state.recurring.some((r) => r.cat === id);
      if (inUse) { app.toast('No puedes eliminar una categoría en uso'); return; }
      if (!confirm('¿Eliminar esta categoría?')) return;
      app.state.categories = app.state.categories.filter((c) => c.id !== id);
      await app.save();
      app.closeSheet();
      app.render();
      app.toast('Categoría eliminada');
    },
    'pick-emoji': (el, e, app) => {
      const target = document.getElementById(el.dataset.target);
      if (target) target.value = el.dataset.emoji;
    },

    'backup-export': async (el, e, app) => {
      const json = await BolsilloBackup.exportBackup(app.state);
      BolsilloBackup.downloadText(`bolsillo-respaldo-${Fmt.todayLocal()}.json`, json, 'application/json');
      app.toast('Copia exportada');
    },
    'backup-import-trigger': (el, e, app) => document.getElementById('importFile').click(),
    'backup-csv-all': (el, e, app) => {
      const csv = BolsilloBackup.exportCSV(app.state.tx, app.state);
      BolsilloBackup.downloadText(`bolsillo-todo.csv`, csv, 'text/csv');
      app.toast('CSV exportado');
    },

    'load-sample': async (el, e, app) => {
      loadSampleData(app);
      await app.save();
      app.render();
      app.toast('Datos de ejemplo cargados');
    },
    'wipe-all': async (el, e, app) => {
      if (!confirm('Esto borrará todos tus datos. ¿Continuar?')) return;
      if (!confirm('¿Seguro? Esta acción no se puede deshacer.')) return;
      await BolsilloDB.clearAll();
      app.state = BolsilloState.defaultState();
      await app.save();
      app.month = Fmt.currentMonthKey();
      app.setView('inicio');
      app.toast('Todos los datos fueron borrados');
    },
  });

  window.Views.importFile = async function (file, app) {
    try {
      const text = await file.text();
      if (!confirm('Importar reemplazará todos tus datos actuales. ¿Continuar?')) return;
      const state = await BolsilloBackup.importBackup(text);
      app.state = state;
      await app.save();
      app.vaultUrls = {};
      app.render();
      app.toast('Copia importada');
    } catch (err) {
      app.toast('No se pudo importar el archivo');
    }
  };
})();
