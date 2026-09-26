// Núcleo de la app: navegación, hojas inferiores, movimiento (+), toasts, tema.
(function () {
  const ICONS = {
    inicio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
    movimientos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
    presupuesto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/></svg>',
    boveda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="12" cy="12" r="3"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3h.1a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5h.1a1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9v.1a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  };

  const TITLES = { inicio: 'Bolsillo', movimientos: 'Movimientos', presupuesto: 'Presupuesto', boveda: 'Bóveda', ajustes: 'Ajustes' };

  window.Actions = window.Actions || {};

  const App = {
    state: null,
    view: 'inicio',
    month: Fmt.currentMonthKey(),
    movFilter: { type: 'all', q: '' },
    presTab: 'sobres',
    boveda: { filter: 'all', q: '', tag: null },
    txDraft: null,
    txEditingId: null,
    vaultEditingId: null,
    editingImageKey: null,

    async init() {
      const raw = await BolsilloDB.kvGet('state');
      this.state = BolsilloState.migrateState(raw);
      this.applyTheme();
      const created = BolsilloState.generatePendingRecurring(this.state, Fmt.todayLocal());
      if (created.length) await this.save();
      this.render();
      if (created.length) {
        this.toast(`${created.length} movimiento${created.length > 1 ? 's' : ''} fijo${created.length > 1 ? 's' : ''} registrado${created.length > 1 ? 's' : ''}`);
      }
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      }
      document.addEventListener('click', (e) => this.onClick(e));
      document.addEventListener('input', (e) => this.onInput(e));
      document.addEventListener('submit', (e) => e.preventDefault());
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.closeSheet();
      });
      document.getElementById('imageInput').addEventListener('change', (e) => this.onImagesChosen(e));
      document.addEventListener('change', (e) => {
        if (e.target.id === 'importFile' && e.target.files && e.target.files[0]) {
          Views.importFile(e.target.files[0], this);
          e.target.value = '';
        }
      });
    },

    async save() {
      await BolsilloDB.kvSet('state', this.state);
    },

    applyTheme() {
      const t = this.state.settings.theme;
      if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
      else document.documentElement.removeAttribute('data-theme');
      document.querySelector('meta[name="theme-color"]').setAttribute('content',
        getComputedStyle(document.documentElement).getPropertyValue('--pine').trim() || '#1D5B4B');
    },

    setView(view) {
      this.view = view;
      this.closeSheet();
      this.render();
      document.getElementById('main').scrollTo?.(0, 0);
    },

    setMonth(delta) {
      this.month = Fmt.addMonthsToKey(this.month, delta);
      this.render();
    },

    render() {
      const main = document.getElementById('main');
      const ctx = this;
      main.innerHTML = Views[this.view](this.state, ctx);
      document.getElementById('topbarTitle').textContent = TITLES[this.view];
      const topAction = document.getElementById('topbarAction');
      if (this.view === 'ajustes') {
        topAction.innerHTML = ICONS.back;
        topAction.setAttribute('aria-label', 'Regresar');
        topAction.dataset.action = 'nav';
        topAction.dataset.view = 'inicio';
      } else {
        topAction.innerHTML = ICONS.gear;
        topAction.setAttribute('aria-label', 'Ajustes');
        topAction.dataset.action = 'goto-ajustes';
      }
      document.querySelectorAll('.tabbar .tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.view === this.view);
      });
      this.mountIcons();
      if (Views.after && Views.after[this.view]) Views.after[this.view](this.state, ctx);
    },

    mountIcons() {
      document.querySelectorAll('.tabbar .tab[data-view]').forEach((tab) => {
        if (!tab.innerHTML) tab.innerHTML = ICONS[tab.dataset.view];
      });
      const fab = document.querySelector('.tab-fab');
      if (fab && !fab.innerHTML) fab.innerHTML = ICONS.plus;
    },

    toast(msg) {
      const el = document.getElementById('toast');
      el.textContent = msg;
      el.classList.add('show');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    },

    openSheet(html) {
      document.getElementById('sheetContent').innerHTML = html;
      document.getElementById('sheetOverlay').hidden = false;
    },

    closeSheet() {
      const overlay = document.getElementById('sheetOverlay');
      if (!overlay.hidden) {
        overlay.hidden = true;
        document.getElementById('sheetContent').innerHTML = '';
      }
      this.txDraft = null;
      this.txEditingId = null;
    },

    onInput(e) {
      const id = e.target.id;
      if (id === 'movSearch') {
        this.movFilter.q = e.target.value;
        Views.updateMovList(this);
      } else if (id === 'vaultSearch') {
        this.boveda.q = e.target.value;
        Views.updateVaultGrid(this);
      }
    },

    onClick(e) {
      if (e.target === document.getElementById('sheetOverlay')) {
        this.closeSheet();
        return;
      }
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const action = el.dataset.action;
      const handlers = {
        nav: () => this.setView(el.dataset.view),
        'goto-ajustes': () => this.setView('ajustes'),
        'open-tx': () => this.openTxSheet(),
        'close-sheet': () => this.closeSheet(),
        'month-prev': () => this.setMonth(-1),
        'month-next': () => this.setMonth(1),
      };
      if (handlers[action]) {
        e.preventDefault();
        handlers[action]();
        return;
      }
      if (window.Actions[action]) {
        e.preventDefault();
        window.Actions[action](el, e, this);
      }
    },

    // ---- Hoja de movimiento ----
    openTxSheet(txId) {
      const editing = txId ? this.state.tx.find((t) => t.id === txId) : null;
      const firstCat = (type) => (this.state.categories.find((c) => c.type === type) || {}).id || '';
      this.txEditingId = editing ? editing.id : null;
      this.txDraft = editing
        ? { ...editing, repeat: 'no' }
        : {
            type: 'gasto', amount: 0, cat: firstCat('gasto'),
            acc: this.state.accounts[0] ? this.state.accounts[0].id : '',
            toAcc: this.state.accounts[1] ? this.state.accounts[1].id : (this.state.accounts[0] ? this.state.accounts[0].id : ''),
            date: Fmt.todayLocal(), note: '', repeat: 'no',
          };
      this.openSheet(this.txSheetHTML());
    },

    syncDraftFromDOM() {
      const d = this.txDraft;
      const q = (sel) => document.querySelector(sel);
      const amt = q('#txAmount');
      if (amt) d.amount = Fmt.parseAmount(amt.value);
      const note = q('#txNote');
      if (note) d.note = note.value;
      const date = q('#txDate');
      if (date) d.date = date.value || Fmt.todayLocal();
      const acc = q('#txAcc');
      if (acc) d.acc = acc.value;
      const toAcc = q('#txToAcc');
      if (toAcc) d.toAcc = toAcc.value;
      const repeat = q('#txRepeat');
      if (repeat) d.repeat = repeat.value;
    },

    txSheetHTML() {
      const state = this.state;
      const d = this.txDraft;
      const cats = state.categories.filter((c) => c.type === d.type);
      const isTransfer = d.type === 'transfer';
      const accOptions = (selected) => state.accounts.map((a) =>
        `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${a.icon} ${Fmt.esc(a.name)}</option>`).join('');
      return `
        <div class="sheet-handle"></div>
        <div class="sheet-head">
          <h2>${this.txEditingId ? 'Editar movimiento' : 'Registrar movimiento'}</h2>
          <button class="icon-btn" data-action="close-sheet" aria-label="Cerrar">${ICONS.close}</button>
        </div>
        <div class="type-toggle">
          <button type="button" class="${d.type === 'gasto' ? 'active gasto' : ''}" data-action="tx-type" data-type="gasto">Gasto</button>
          <button type="button" class="${d.type === 'ingreso' ? 'active ingreso' : ''}" data-action="tx-type" data-type="ingreso">Ingreso</button>
          <button type="button" class="${d.type === 'transfer' ? 'active transfer' : ''}" data-action="tx-type" data-type="transfer">Transferencia</button>
        </div>
        <input class="amount-input" id="txAmount" inputmode="decimal" type="text" placeholder="0.00"
          value="${d.amount ? Fmt.formatNumber(d.amount, state.settings.currency) : ''}" aria-label="Monto">
        ${isTransfer ? '' : `
          <div class="cat-grid" role="listbox" aria-label="Categoría">
            ${cats.map((c) => `<button type="button" class="cat-chip ${c.id === d.cat ? 'active' : ''}" data-action="tx-cat" data-cat="${c.id}">
              <span class="em">${c.icon}</span><span>${Fmt.esc(c.name)}</span>
            </button>`).join('')}
          </div>`}
        <div class="field">
          <label for="txAcc">${isTransfer ? 'Desde cuenta' : 'Cuenta'}</label>
          <select id="txAcc">${accOptions(d.acc)}</select>
        </div>
        ${isTransfer ? `
          <div class="field">
            <label for="txToAcc">Hacia cuenta</label>
            <select id="txToAcc">${accOptions(d.toAcc)}</select>
          </div>` : ''}
        <div class="field">
          <label for="txDate">Fecha</label>
          <input type="date" id="txDate" value="${d.date}">
        </div>
        <div class="field">
          <label for="txNote">Nota</label>
          <input type="text" id="txNote" value="${Fmt.esc(d.note || '')}" placeholder="Opcional">
        </div>
        <div class="field">
          <label for="txRepeat">Repetir</label>
          <select id="txRepeat">
            <option value="no" ${d.repeat === 'no' ? 'selected' : ''}>No se repite</option>
            <option value="semanal" ${d.repeat === 'semanal' ? 'selected' : ''}>Cada semana</option>
            <option value="quincenal" ${d.repeat === 'quincenal' ? 'selected' : ''}>Cada 15 días</option>
            <option value="mensual" ${d.repeat === 'mensual' ? 'selected' : ''}>Cada mes</option>
            <option value="anual" ${d.repeat === 'anual' ? 'selected' : ''}>Cada año</option>
          </select>
        </div>
        <div id="txError" class="text-muted" style="color:var(--out);font-weight:700;margin-bottom:10px;"></div>
        <button class="btn primary block" data-action="tx-save">Guardar movimiento</button>
        ${this.txEditingId ? '<button class="btn danger block" style="margin-top:10px" data-action="tx-delete">Eliminar</button>' : ''}
      `;
    },

    rerenderTxSheet() {
      this.openSheet(this.txSheetHTML());
    },

    async compressImage(file) {
      try {
        const bitmap = await createImageBitmap(file);
        const maxSide = 1600;
        const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
        const w = Math.max(1, Math.round(bitmap.width * scale));
        const h = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, w, h);
        const blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85));
        return blob || file;
      } catch (err) {
        return file;
      }
    },

    async onImagesChosen(e) {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      if (!files.length) return;
      const isFirstImage = !this.state.vault.some((v) => v.kind === 'image');
      if (isFirstImage && navigator.storage && navigator.storage.persist) {
        try { await navigator.storage.persist(); } catch (err) { /* no soportado */ }
      }
      for (const file of files) {
        const blob = await this.compressImage(file);
        const key = Fmt.uid();
        await BolsilloDB.blobSet(key, blob);
        const title = (file.name || 'Imagen').replace(/\.[a-z0-9]+$/i, '') || 'Imagen';
        this.state.vault.push({ id: Fmt.uid(), kind: 'image', title, url: '', note: '', tags: [], imgKey: key, created: Date.now(), fav: false });
      }
      await this.save();
      this.render();
      this.toast(files.length > 1 ? 'Imágenes guardadas' : 'Imagen guardada');
    },
  };

  Object.assign(window.Actions, {
    'tx-type': (el, e, app) => {
      app.syncDraftFromDOM();
      const type = el.dataset.type;
      app.txDraft.type = type;
      if (type !== 'transfer') {
        const cats = app.state.categories.filter((c) => c.type === type);
        if (!cats.find((c) => c.id === app.txDraft.cat)) app.txDraft.cat = cats[0] ? cats[0].id : '';
      }
      if (type === 'transfer' && app.txDraft.acc === app.txDraft.toAcc) {
        const other = app.state.accounts.find((a) => a.id !== app.txDraft.acc);
        if (other) app.txDraft.toAcc = other.id;
      }
      app.rerenderTxSheet();
    },
    'tx-cat': (el, e, app) => {
      app.syncDraftFromDOM();
      app.txDraft.cat = el.dataset.cat;
      app.rerenderTxSheet();
    },
    'tx-save': async (el, e, app) => {
      app.syncDraftFromDOM();
      const d = app.txDraft;
      const errBox = document.getElementById('txError');
      if (!(d.amount > 0)) {
        errBox.textContent = 'El monto debe ser mayor a cero.';
        return;
      }
      if (d.type === 'transfer' && d.acc === d.toAcc) {
        errBox.textContent = 'Elige dos cuentas distintas para transferir.';
        return;
      }
      if (!d.acc) {
        errBox.textContent = 'Agrega una cuenta primero en Ajustes.';
        return;
      }
      if (app.txEditingId) {
        const tx = app.state.tx.find((t) => t.id === app.txEditingId);
        Object.assign(tx, { type: d.type, amount: d.amount, cat: d.cat, acc: d.acc, toAcc: d.toAcc, date: d.date, note: d.note });
      } else {
        const tx = { id: Fmt.uid(), type: d.type, amount: d.amount, cat: d.cat, acc: d.acc, toAcc: d.toAcc, date: d.date, note: d.note };
        app.state.tx.push(tx);
        if (d.repeat && d.repeat !== 'no') {
          const day = Number(d.date.slice(8, 10));
          const rec = {
            id: Fmt.uid(), type: d.type, amount: d.amount, cat: d.cat, acc: d.acc, toAcc: d.toAcc,
            note: d.note, freq: d.repeat, day, active: true,
            next: BolsilloState.nextRecurringDate({ next: d.date, freq: d.repeat, day }),
          };
          app.state.recurring.push(rec);
        }
      }
      await app.save();
      app.closeSheet();
      app.month = Fmt.monthKeyOf(d.date);
      app.render();
      app.toast('Movimiento guardado');
    },
    'tx-delete': async (el, e, app) => {
      if (!confirm('¿Eliminar este movimiento?')) return;
      app.state.tx = app.state.tx.filter((t) => t.id !== app.txEditingId);
      await app.save();
      app.closeSheet();
      app.render();
      app.toast('Movimiento eliminado');
    },
  });

  window.App = App;
  document.addEventListener('DOMContentLoaded', () => App.init());
})();
