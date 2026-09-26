// Vista Bóveda: enlaces e imágenes guardados 100% local.
(function () {
  window.Views = window.Views || {};
  window.Views.after = window.Views.after || {};

  const FILTERS = [
    { id: 'all', label: 'Todo' },
    { id: 'link', label: 'Enlaces' },
    { id: 'image', label: 'Imágenes' },
    { id: 'fav', label: 'Favoritos' },
  ];

  function domainOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch (e) {
      return url;
    }
  }

  function matchesQuery(item, q) {
    if (!q) return true;
    const hay = [item.title, item.note, item.url, ...(item.tags || [])].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q.toLowerCase());
  }

  function allTags(state) {
    const set = new Set();
    for (const item of state.vault) (item.tags || []).forEach((t) => set.add(t));
    return [...set].sort();
  }

  function filteredVault(state, app) {
    const { filter, q, tag } = app.boveda;
    let list = [...state.vault];
    if (filter === 'link') list = list.filter((i) => i.kind === 'link');
    else if (filter === 'image') list = list.filter((i) => i.kind === 'image');
    else if (filter === 'fav') list = list.filter((i) => i.fav);
    if (tag) list = list.filter((i) => (i.tags || []).includes(tag));
    list = list.filter((i) => matchesQuery(i, q));
    return list.sort((a, b) => b.created - a.created);
  }

  function tileHTML(item) {
    if (item.kind === 'image') {
      return `<div class="vault-tile" data-action="vault-open" data-id="${item.id}">
        <img class="thumb" data-thumb-key="${item.imgKey}" alt="${Fmt.esc(item.title)}">
        <div class="title">${item.fav ? '★ ' : ''}${Fmt.esc(item.title)}</div>
      </div>`;
    }
    const domain = domainOf(item.url);
    return `<div class="vault-tile link" data-action="vault-open" data-id="${item.id}">
      <div class="domain-badge">${Fmt.esc((domain[0] || '#').toUpperCase())}</div>
      <div class="link-info">
        <div class="link-title">${item.fav ? '★ ' : ''}${Fmt.esc(item.title)}</div>
        <div class="link-url">${Fmt.esc(domain)}</div>
      </div>
    </div>`;
  }

  function gridInner(state, app) {
    const list = filteredVault(state, app);
    if (!list.length) {
      return `<div class="empty-state"><span class="emoji">🔗</span><p>Nada por aquí todavía.</p></div>`;
    }
    return `<div class="vault-grid">${list.map(tileHTML).join('')}</div>`;
  }

  window.Views.boveda = function boveda(state, app) {
    const tags = allTags(state);
    return `
      <div class="search-box">
        <input type="text" id="vaultSearch" placeholder="Buscar por título, nota o etiqueta" value="${Fmt.esc(app.boveda.q)}" aria-label="Buscar en la bóveda">
      </div>
      <div class="segmented">
        ${FILTERS.map((f) => `<button type="button" class="${app.boveda.filter === f.id ? 'active' : ''}" data-action="vault-filter" data-filter="${f.id}">${f.label}</button>`).join('')}
      </div>
      ${tags.length ? `<div class="tag-chips">
        ${tags.map((t) => `<button type="button" class="tag-chip" style="${app.boveda.tag === t ? 'background:var(--gold)' : ''}" data-action="vault-tag" data-tag="${Fmt.esc(t)}">${Fmt.esc(t)}</button>`).join('')}
      </div>` : ''}
      <div class="row-between" style="margin-bottom:12px">
        <button class="btn pine sm" data-action="vault-add-link">+ Enlace</button>
        <button class="btn pine sm" data-action="vault-add-images">+ Imágenes</button>
      </div>
      <div id="vaultGridWrap">${gridInner(state, app)}</div>
    `;
  };

  window.Views.updateVaultGrid = function (app) {
    const wrap = document.getElementById('vaultGridWrap');
    if (wrap) {
      wrap.innerHTML = gridInner(app.state, app);
      mountThumbs(app);
    }
  };

  function mountThumbs(app) {
    app.vaultUrls = app.vaultUrls || {};
    document.querySelectorAll('#main img[data-thumb-key]').forEach((el) => {
      const key = el.dataset.thumbKey;
      if (app.vaultUrls[key]) {
        el.src = app.vaultUrls[key];
        return;
      }
      BolsilloDB.blobGet(key).then((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        app.vaultUrls[key] = url;
        el.src = url;
      });
    });
  }
  window.Views.after.boveda = mountThumbs;

  function linkSheetHTML(item) {
    const editing = !!item;
    const i = item || { url: '', title: '', note: '', tags: [], fav: false };
    return `
      <div class="sheet-handle"></div>
      <div class="sheet-head"><h2>${editing ? 'Editar enlace' : 'Guardar enlace'}</h2>
        <button class="icon-btn" data-action="close-sheet" aria-label="Cerrar">✕</button></div>
      <div class="field">
        <label for="linkUrl">URL</label>
        <div style="display:flex;gap:8px">
          <input type="url" id="linkUrl" value="${Fmt.esc(i.url)}" placeholder="https://" style="flex:1">
          <button class="btn sm" type="button" data-action="vault-paste">Pegar</button>
        </div>
      </div>
      <div class="field"><label for="linkTitle">Título</label><input type="text" id="linkTitle" value="${Fmt.esc(i.title)}" placeholder="(el dominio si lo dejas vacío)"></div>
      <div class="field"><label for="linkNote">Nota</label><textarea id="linkNote">${Fmt.esc(i.note)}</textarea></div>
      <div class="field"><label for="linkTags">Etiquetas (separadas por coma)</label><input type="text" id="linkTags" value="${Fmt.esc((i.tags || []).join(', '))}"></div>
      <label class="row-between" style="margin-bottom:14px"><span>Favorito</span><input type="checkbox" id="linkFav" ${i.fav ? 'checked' : ''} style="width:20px;height:20px"></label>
      <div id="linkError" style="color:var(--out);font-weight:700;margin-bottom:10px"></div>
      <button class="btn primary block" data-action="link-save" data-id="${editing ? i.id : ''}">Guardar enlace</button>
      ${editing ? `
        <button class="btn ghost block" style="margin-top:10px" data-action="link-visit" data-url="${Fmt.esc(i.url)}">Abrir enlace</button>
        <button class="btn danger block" style="margin-top:10px" data-action="vault-delete" data-id="${i.id}">Eliminar</button>
      ` : ''}
    `;
  }

  async function imageSheetHTML(item, app) {
    let src = app.vaultUrls && app.vaultUrls[item.imgKey];
    if (!src) {
      const blob = await BolsilloDB.blobGet(item.imgKey);
      if (blob) {
        src = URL.createObjectURL(blob);
        app.vaultUrls = app.vaultUrls || {};
        app.vaultUrls[item.imgKey] = src;
      }
    }
    return `
      <div class="sheet-handle"></div>
      <div class="sheet-head"><h2>Imagen</h2>
        <button class="icon-btn" data-action="close-sheet" aria-label="Cerrar">✕</button></div>
      ${src ? `<img src="${src}" alt="${Fmt.esc(item.title)}" style="width:100%;border-radius:14px;border:2px solid var(--edge);margin-bottom:12px;max-height:280px;object-fit:contain;background:var(--surface2)">` : ''}
      <div class="field"><label for="linkTitle">Título</label><input type="text" id="linkTitle" value="${Fmt.esc(item.title)}"></div>
      <div class="field"><label for="linkNote">Nota</label><textarea id="linkNote">${Fmt.esc(item.note)}</textarea></div>
      <div class="field"><label for="linkTags">Etiquetas (separadas por coma)</label><input type="text" id="linkTags" value="${Fmt.esc((item.tags || []).join(', '))}"></div>
      <label class="row-between" style="margin-bottom:14px"><span>Favorito</span><input type="checkbox" id="linkFav" ${item.fav ? 'checked' : ''} style="width:20px;height:20px"></label>
      <div class="row-between" style="gap:8px;margin-bottom:10px">
        <button class="btn sm pine" style="flex:1" data-action="vault-share" data-id="${item.id}">Compartir</button>
        <button class="btn sm ghost" style="flex:1" data-action="vault-download" data-id="${item.id}">Descargar</button>
      </div>
      <div id="linkError" style="color:var(--out);font-weight:700;margin-bottom:10px"></div>
      <button class="btn primary block" data-action="link-save" data-id="${item.id}">Guardar cambios</button>
      <button class="btn danger block" style="margin-top:10px" data-action="vault-delete" data-id="${item.id}">Eliminar</button>
    `;
  }

  Object.assign(window.Actions || (window.Actions = {}), {
    'vault-filter': (el, e, app) => { app.boveda.filter = el.dataset.filter; app.render(); },
    'vault-tag': (el, e, app) => {
      app.boveda.tag = app.boveda.tag === el.dataset.tag ? null : el.dataset.tag;
      app.render();
    },
    'vault-add-link': (el, e, app) => app.openSheet(linkSheetHTML(null)),
    'vault-add-images': (el, e, app) => document.getElementById('imageInput').click(),
    'vault-paste': async (el, e, app) => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) document.getElementById('linkUrl').value = text.trim();
      } catch (err) {
        app.toast('No se pudo leer el portapapeles');
      }
    },
    'vault-open': async (el, e, app) => {
      const item = app.state.vault.find((i) => i.id === el.dataset.id);
      if (!item) return;
      if (item.kind === 'link') app.openSheet(linkSheetHTML(item));
      else app.openSheet(await imageSheetHTML(item, app));
    },
    'link-visit': (el, e, app) => {
      let url = el.dataset.url;
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      window.open(url, '_blank', 'noopener');
    },
    'link-save': async (el, e, app) => {
      const errBox = document.getElementById('linkError');
      const id = el.dataset.id;
      const existing = id ? app.state.vault.find((i) => i.id === id) : null;
      const isLink = !existing || existing.kind === 'link';
      let url = existing ? existing.url : '';
      if (isLink) {
        url = document.getElementById('linkUrl').value.trim();
        if (!url) { errBox.textContent = 'Escribe una URL.'; return; }
        if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      }
      const titleInput = document.getElementById('linkTitle').value.trim();
      const title = titleInput || (isLink ? domainOf(url) : 'Imagen');
      const note = document.getElementById('linkNote').value;
      const tags = document.getElementById('linkTags').value.split(',').map((t) => t.trim()).filter(Boolean);
      const fav = document.getElementById('linkFav').checked;
      if (existing) {
        Object.assign(existing, { title, note, tags, fav, url: isLink ? url : existing.url });
      } else {
        app.state.vault.push({ id: Fmt.uid(), kind: 'link', title, url, note, tags, fav, created: Date.now() });
      }
      await app.save();
      app.closeSheet();
      app.render();
      app.toast('Guardado en la bóveda');
    },
    'vault-delete': async (el, e, app) => {
      if (!confirm('¿Eliminar este elemento de la bóveda?')) return;
      const item = app.state.vault.find((i) => i.id === el.dataset.id);
      if (item && item.kind === 'image' && item.imgKey) {
        if (app.vaultUrls && app.vaultUrls[item.imgKey]) {
          URL.revokeObjectURL(app.vaultUrls[item.imgKey]);
          delete app.vaultUrls[item.imgKey];
        }
        await BolsilloDB.blobDelete(item.imgKey);
      }
      app.state.vault = app.state.vault.filter((i) => i.id !== el.dataset.id);
      await app.save();
      app.closeSheet();
      app.render();
      app.toast('Eliminado');
    },
    'vault-share': async (el, e, app) => {
      const item = app.state.vault.find((i) => i.id === el.dataset.id);
      const blob = await BolsilloDB.blobGet(item.imgKey);
      if (!blob) return;
      const file = new File([blob], `${item.title || 'imagen'}.jpg`, { type: blob.type || 'image/jpeg' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: item.title });
          return;
        } catch (err) { /* el usuario canceló o no se pudo, se ofrece descarga */ }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${item.title || 'imagen'}.jpg`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    'vault-download': async (el, e, app) => {
      const item = app.state.vault.find((i) => i.id === el.dataset.id);
      const blob = await BolsilloDB.blobGet(item.imgKey);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${item.title || 'imagen'}.jpg`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
})();
