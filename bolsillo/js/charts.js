// Gráficas SVG hechas a mano: dona de categorías y barras de 6 meses.
(function () {
  const PALETTE = ['pine', 'gold', 'in', 'out', 'warn', 'muted'];

  function donutChart(slices, opts) {
    const size = (opts && opts.size) || 176;
    const strokeWidth = (opts && opts.strokeWidth) || 26;
    const r = (size - strokeWidth) / 2;
    const cx = size / 2;
    const cy = size / 2;
    const C = 2 * Math.PI * r;
    const total = slices.reduce((s, x) => s + x.value, 0);
    if (!total) {
      return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Sin gastos este mes">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" style="stroke:var(--line)" stroke-width="${strokeWidth}"></circle>
      </svg>`;
    }
    let offset = 0;
    const paths = slices.map((sl, i) => {
      const frac = sl.value / total;
      const len = frac * C;
      const dasharray = `${len.toFixed(2)} ${(C - len).toFixed(2)}`;
      const dashoffset = (-offset).toFixed(2);
      offset += len;
      const color = sl.color || PALETTE[i % PALETTE.length];
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" style="stroke:var(--${color})" stroke-width="${strokeWidth}" stroke-dasharray="${dasharray}" stroke-dashoffset="${dashoffset}" transform="rotate(-90 ${cx} ${cy})"><title>${Fmt.esc(sl.label)}</title></circle>`;
    }).join('');
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Gastos por categoría">${paths}</svg>`;
  }

  function donutLegend(slices, currency) {
    const total = slices.reduce((s, x) => s + x.value, 0) || 1;
    return slices.map((sl, i) => {
      const color = sl.color || PALETTE[i % PALETTE.length];
      const pct = Math.round((sl.value / total) * 100);
      return `<li class="legend-item">
        <span class="legend-dot" style="background:var(--${color})"></span>
        <span class="legend-label">${Fmt.esc(sl.label)}</span>
        <span class="legend-value">${Fmt.formatCurrency(sl.value, currency)} · ${pct}%</span>
      </li>`;
    }).join('');
  }

  function monthShort(yyyymm) {
    const [y, m] = yyyymm.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return new Intl.DateTimeFormat('es-MX', { month: 'short' }).format(d).replace('.', '');
  }

  function barChart6m(data, opts) {
    const width = (opts && opts.width) || 320;
    const height = (opts && opts.height) || 168;
    const padTop = 12;
    const padBottom = 24;
    const padSide = 8;
    const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
    const groupWidth = (width - padSide * 2) / data.length;
    const barWidth = Math.max(6, groupWidth / 2 - 5);
    const usableH = height - padTop - padBottom;
    const bars = data.map((d, i) => {
      const x0 = padSide + i * groupWidth + (groupWidth - (barWidth * 2 + 4)) / 2;
      const incH = (d.income / max) * usableH;
      const expH = (d.expense / max) * usableH;
      const baseY = height - padBottom;
      return `
        <rect x="${x0.toFixed(1)}" y="${(baseY - incH).toFixed(1)}" width="${barWidth}" height="${Math.max(incH, 0).toFixed(1)}" rx="3" style="fill:var(--in)"><title>Ingresos ${monthShort(d.month)}</title></rect>
        <rect x="${(x0 + barWidth + 4).toFixed(1)}" y="${(baseY - expH).toFixed(1)}" width="${barWidth}" height="${Math.max(expH, 0).toFixed(1)}" rx="3" style="fill:var(--out)"><title>Gastos ${monthShort(d.month)}</title></rect>
        <text x="${(x0 + barWidth + 2).toFixed(1)}" y="${height - 8}" text-anchor="middle" font-size="10" style="fill:var(--muted)">${Fmt.esc(monthShort(d.month))}</text>
      `;
    }).join('');
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Ingresos y gastos de los últimos 6 meses" preserveAspectRatio="xMidYMid meet">${bars}</svg>`;
  }

  window.BolsilloCharts = { donutChart, donutLegend, barChart6m, PALETTE };
})();
