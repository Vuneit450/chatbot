// Utilidades de formato: montos, fechas, moneda y escape de texto.

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function parseAmount(input) {
  if (typeof input === 'number') return round2(input);
  let s = String(input ?? '').trim();
  if (!s) return 0;
  s = s.replace(/[^0-9.,-]/g, '');
  const neg = s.startsWith('-');
  s = s.replace(/-/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized;
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      normalized = s.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = s.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    const decimals = s.length - lastComma - 1;
    if (decimals === 3) {
      normalized = s.replace(/,/g, '');
    } else {
      normalized = s.replace(',', '.');
    }
  } else if (lastDot > -1) {
    const decimals = s.length - lastDot - 1;
    if (decimals === 3) {
      normalized = s.replace(/\./g, '');
    } else {
      normalized = s;
    }
  } else {
    normalized = s;
  }
  const n = parseFloat(normalized);
  const val = isNaN(n) ? 0 : n;
  return neg ? -round2(val) : round2(val);
}

function todayLocal() {
  return dateToLocalStr(new Date());
}

function dateToLocalStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLocalDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function currentMonthKey() {
  return todayLocal().slice(0, 7);
}

function monthKeyOf(dateStr) {
  return dateStr.slice(0, 7);
}

function addMonthsToKey(yyyymm, delta) {
  const [y, m] = yyyymm.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function daysInMonthKey(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function monthLabel(yyyymm, locale) {
  const [y, m] = yyyymm.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  const label = new Intl.DateTimeFormat(locale || 'es-MX', { month: 'long', year: 'numeric' }).format(d);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatDateHuman(dateStr, locale) {
  const d = parseLocalDate(dateStr);
  return new Intl.DateTimeFormat(locale || 'es-MX', { day: 'numeric', month: 'short' }).format(d);
}

function formatDateLong(dateStr, locale) {
  const d = parseLocalDate(dateStr);
  const label = new Intl.DateTimeFormat(locale || 'es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const REGION_CURRENCY = {
  MX: 'MXN', CO: 'COP', AR: 'ARS', CL: 'CLP', PE: 'PEN', ES: 'EUR',
  EC: 'USD', SV: 'USD', PA: 'USD', US: 'USD',
};

const CURRENCY_LOCALE = {
  MXN: 'es-MX', COP: 'es-CO', ARS: 'es-AR', CLP: 'es-CL', PEN: 'es-PE', EUR: 'es-ES', USD: 'en-US',
};

function detectDefaultCurrency() {
  const lang = (navigator.language || 'es-MX');
  const region = (lang.split('-')[1] || 'MX').toUpperCase();
  return REGION_CURRENCY[region] || 'MXN';
}

function localeForCurrency(currency) {
  return CURRENCY_LOCALE[currency] || 'es-MX';
}

function formatCurrency(amount, currency) {
  const locale = localeForCurrency(currency);
  const value = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  } catch (e) {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatNumber(amount, currency) {
  const locale = localeForCurrency(currency);
  const value = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}

function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

window.Fmt = {
  round2, parseAmount, todayLocal, dateToLocalStr, parseLocalDate,
  currentMonthKey, monthKeyOf, addMonthsToKey, daysInMonthKey, monthLabel,
  formatDateHuman, formatDateLong, detectDefaultCurrency, localeForCurrency,
  formatCurrency, formatNumber, esc, uid,
};
