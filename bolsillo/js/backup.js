// Respaldo: exportar/importar JSON (con imágenes en base64) y exportar CSV.
(function () {
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  function base64ToBlob(dataUrl) {
    const [meta, data] = dataUrl.split(',');
    const mime = /data:(.*?);base64/.exec(meta)?.[1] || 'image/jpeg';
    const bin = atob(data);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  async function exportBackup(state) {
    const vault = [];
    for (const item of state.vault) {
      const copy = { ...item };
      if (item.kind === 'image' && item.imgKey) {
        const blob = await window.BolsilloDB.blobGet(item.imgKey);
        if (blob) copy.imgData = await blobToBase64(blob);
      }
      vault.push(copy);
    }
    const payload = { ...state, vault, exportedAt: new Date().toISOString() };
    return JSON.stringify(payload, null, 2);
  }

  async function importBackup(jsonText) {
    const raw = JSON.parse(jsonText);
    const state = window.BolsilloState.migrateState(raw);
    const vault = [];
    for (const item of raw.vault || []) {
      const copy = { ...item };
      if (item.kind === 'image' && item.imgData) {
        const blob = base64ToBlob(item.imgData);
        const key = item.imgKey || Fmt.uid();
        await window.BolsilloDB.blobSet(key, blob);
        copy.imgKey = key;
        delete copy.imgData;
      }
      vault.push(copy);
    }
    state.vault = vault;
    return state;
  }

  function csvEscape(v) {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function exportCSV(txList, state) {
    const header = ['Fecha', 'Tipo', 'Monto', 'Categoría', 'Cuenta', 'Cuenta destino', 'Nota'];
    const rows = txList.map((t) => {
      const cat = window.BolsilloState.catById(state, t.cat);
      const acc = window.BolsilloState.accById(state, t.acc);
      const toAcc = window.BolsilloState.accById(state, t.toAcc);
      return [
        t.date, t.type, t.amount.toFixed(2), cat ? cat.name : '', acc ? acc.name : '',
        toAcc ? toAcc.name : '', t.note || '',
      ].map(csvEscape).join(',');
    });
    return '﻿' + [header.join(','), ...rows].join('\n');
  }

  function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.BolsilloBackup = { exportBackup, importBackup, exportCSV, downloadText, blobToBase64, base64ToBlob };
})();
