// Nota fiscal do consumidor (NFC-e) + gerador de QR Code próprio (sem CDN).
// Publica JR.nfce = { emit(order), render(invoice, order), qrSvg(text, opts), formatKey(key) }.
// Provider "simulado" (padrão): cupom de teste, sem valor fiscal.
// Provider "focusnfe": envia para JR_CONFIG.nfce.endpoint (/api/nfce), que fala com o provedor fiscal.
(function () {
  const JR = (window.JR = window.JR || {});
  const LS = "jr_v1_";

  function cfg() { return (window.JR_CONFIG && window.JR_CONFIG.nfce) || {}; }
  function lsGet(k, f) { try { const v = localStorage.getItem(LS + k); return v ? JSON.parse(v) : f; } catch (e) { return f; } }
  function lsSet(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function money(n) { return JR.money ? JR.money(n) : "R$ " + (Number(n) || 0).toFixed(2).replace(".", ","); }
  function digits(s) { return String(s || "").replace(/\D/g, ""); }
  function pad(n, len) { return String(n).padStart(len, "0"); }

  // ------------------------------------------------------------------
  // QR Code (modo byte, correção M). Implementação compacta baseada no
  // algoritmo de referência de Project Nayuki (MIT). Versões 1–40.
  // ------------------------------------------------------------------
  const QR = (function () {
    const ECC_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
    const BLK_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
    const bit = (x, i) => ((x >>> i) & 1) !== 0;

    function rawModules(v) {
      let r = (16 * v + 128) * v + 64;
      if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
      return r;
    }
    const dataCodewords = (v) => Math.floor(rawModules(v) / 8) - ECC_M[v] * BLK_M[v];

    function gfMul(x, y) {
      let z = 0;
      for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
      return z & 0xff;
    }
    function rsDivisor(deg) {
      const r = new Array(deg).fill(0); r[deg - 1] = 1;
      let root = 1;
      for (let i = 0; i < deg; i++) {
        for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
        root = gfMul(root, 0x02);
      }
      return r;
    }
    function rsRemainder(data, div) {
      const r = div.map(() => 0);
      for (const b of data) {
        const f = b ^ r.shift(); r.push(0);
        div.forEach((c, i) => { r[i] ^= gfMul(c, f); });
      }
      return r;
    }

    function encode(text) {
      const bytes = Array.from(new TextEncoder().encode(String(text)));
      let ver = 1;
      for (; ver <= 40; ver++) {
        const need = 4 + (ver <= 9 ? 8 : 16) + bytes.length * 8;
        if (need <= dataCodewords(ver) * 8) break;
      }
      if (ver > 40) throw new Error("Texto grande demais para QR Code");
      const cap = dataCodewords(ver) * 8;
      const bb = [];
      const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1); };
      put(4, 4); put(bytes.length, ver <= 9 ? 8 : 16); bytes.forEach((b) => put(b, 8));
      put(0, Math.min(4, cap - bb.length));
      put(0, (8 - (bb.length % 8)) % 8);
      for (let p = 0xec; bb.length < cap; p ^= 0xec ^ 0x11) put(p, 8);
      const data = [];
      for (let i = 0; i < bb.length; i += 8) { let v = 0; for (let j = 0; j < 8; j++) v = (v << 1) | bb[i + j]; data.push(v); }

      // blocos + correção de erros, intercalados
      const nb = BLK_M[ver], eccLen = ECC_M[ver], raw = Math.floor(rawModules(ver) / 8);
      const nShort = nb - (raw % nb), shortLen = Math.floor(raw / nb), div = rsDivisor(eccLen);
      const blocks = [];
      for (let i = 0, k = 0; i < nb; i++) {
        const dat = data.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1)); k += dat.length;
        const ecc = rsRemainder(dat, div);
        if (i < nShort) dat.push(0);
        blocks.push(dat.concat(ecc));
      }
      const all = [];
      for (let i = 0; i < blocks[0].length; i++) {
        blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= nShort) all.push(b[i]); });
      }

      const size = ver * 4 + 17;
      const mod = Array.from({ length: size }, () => new Array(size).fill(false));
      const fn = Array.from({ length: size }, () => new Array(size).fill(false));
      const setF = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };

      for (let i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
      [[3, 3], [size - 4, 3], [3, size - 4]].forEach(([x, y]) => {
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy;
          if (xx >= 0 && xx < size && yy >= 0 && yy < size) setF(xx, yy, d !== 2 && d !== 4);
        }
      });
      const align = [];
      if (ver > 1) {
        const n = Math.floor(ver / 7) + 2;
        const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
        align.push(6);
        for (let p = size - 7; align.length < n; p -= step) align.splice(1, 0, p);
      }
      align.forEach((ay, i) => align.forEach((ax, j) => {
        const n = align.length;
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setF(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }));
      function drawFormat(mask) {
        const d = (0 << 3) | mask; // nível M = 00
        let rem = d; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        const bits = ((d << 10) | rem) ^ 0x5412;
        for (let i = 0; i <= 5; i++) setF(8, i, bit(bits, i));
        setF(8, 7, bit(bits, 6)); setF(8, 8, bit(bits, 7)); setF(7, 8, bit(bits, 8));
        for (let i = 9; i < 15; i++) setF(14 - i, 8, bit(bits, i));
        for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(bits, i));
        for (let i = 8; i < 15; i++) setF(8, size - 15 + i, bit(bits, i));
        setF(8, size - 8, true);
      }
      drawFormat(0);
      if (ver >= 7) {
        let rem = ver; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
        const bits = (ver << 12) | rem;
        for (let i = 0; i < 18; i++) { const b = bit(bits, i), a = size - 11 + (i % 3), c = Math.floor(i / 3); setF(a, c, b); setF(c, a, b); }
      }
      // dados em zigue-zague
      let i = 0;
      for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
          const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v;
          if (!fn[y][x] && i < all.length * 8) { mod[y][x] = bit(all[i >>> 3], 7 - (i & 7)); i++; }
        }
      }
      const maskFn = [
        (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
        (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
        (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
      ];
      const applyMask = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && maskFn[m](x, y)) mod[y][x] = !mod[y][x]; };
      function penalty() {
        let p = 0, dark = 0;
        for (let y = 0; y < size; y++) {
          for (let pass = 0; pass < 2; pass++) {
            let run = 1;
            for (let x = 1; x < size; x++) {
              const a = pass ? mod[x][y] : mod[y][x], b = pass ? mod[x - 1][y] : mod[y][x - 1];
              if (a === b) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1;
            }
          }
          for (let x = 0; x < size; x++) {
            if (mod[y][x]) dark++;
            if (x < size - 1 && y < size - 1) { const c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3; }
          }
        }
        const total = size * size;
        p += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
        return p;
      }
      let best = 0, bestP = Infinity;
      for (let m = 0; m < 8; m++) { applyMask(m); drawFormat(m); const pp = penalty(); if (pp < bestP) { bestP = pp; best = m; } applyMask(m); }
      applyMask(best); drawFormat(best);
      return mod;
    }

    function svg(text, opts) {
      opts = opts || {};
      const m = encode(text), n = m.length, q = opts.quiet == null ? 4 : opts.quiet, s = n + q * 2;
      let path = "";
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) path += "M" + (x + q) + "," + (y + q) + "h1v1h-1z";
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + s + " " + s + '" shape-rendering="crispEdges" role="img" aria-label="' +
        esc(opts.label || "QR Code") + '" class="' + esc(opts.className || "") + '"><rect width="100%" height="100%" fill="#fff"/><path fill="#000" d="' + path + '"/></svg>';
    }
    return { encode, svg };
  })();

  // ------------------------------------------------------------------
  // Chave de acesso NFC-e (44 dígitos) e DV módulo 11
  // ------------------------------------------------------------------
  function mod11(base) {
    let sum = 0, w = 2;
    for (let i = base.length - 1; i >= 0; i--) { sum += Number(base[i]) * w; w = w === 9 ? 2 : w + 1; }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  }
  function buildKey({ cUF, date, cnpj, mod, serie, numero, tpEmis, cNF }) {
    const aamm = pad(date.getFullYear() % 100, 2) + pad(date.getMonth() + 1, 2);
    const base = pad(cUF, 2) + aamm + pad(digits(cnpj), 14) + pad(mod, 2) + pad(serie, 3) + pad(numero, 9) + String(tpEmis) + pad(cNF, 8);
    return base + mod11(base);
  }
  function formatKey(key) { return digits(key).replace(/(\d{4})(?=\d)/g, "$1 "); }

  // categoria do produto (para NCM no servidor)
  let menuCache = null;
  async function loadMenu() {
    if (menuCache) return menuCache;
    try { menuCache = JR.db && JR.db.getMenu ? await JR.db.getMenu() : null; } catch (e) { menuCache = null; }
    return menuCache;
  }
  if (JR.on) JR.on("menu:changed", (m) => { menuCache = m; });
  function storeInfo() {
    return (menuCache && menuCache.store) || (window.JR_SEED && window.JR_SEED.store) || { name: "Pizzaria Jr Delícia" };
  }

  // ------------------------------------------------------------------
  // emit
  // ------------------------------------------------------------------
  async function emitSimulado(order) {
    const seq = lsGet("nfce_seq", 0) + 1;
    lsSet("nfce_seq", seq);
    const now = new Date();
    const serie = 1;
    const key = buildKey({ cUF: 35, date: now, cnpj: "00000000000000", mod: 65, serie, numero: seq, tpEmis: 1, cNF: Math.floor(Math.random() * 1e8) });
    return {
      status: "simulada", provider: "simulado", number: seq, series: serie, key, url: null,
      issued_at: now.toISOString(), message: "Documento sem valor fiscal — emissão de teste",
    };
  }

  async function emitRemote(order, provider) {
    const endpoint = cfg().endpoint || "/api/nfce";
    const menu = await loadMenu();
    const prodCat = {};
    ((menu && menu.products) || []).forEach((p) => { prodCat[p.id] = p.categoryId; });
    const body = JR.clone ? JR.clone(order) : JSON.parse(JSON.stringify(order));
    body.items = (body.items || []).map((it) => Object.assign({ categoryId: prodCat[it.productId] || "" }, it));
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 25000) : null;
    const base = { provider, number: null, series: null, key: null, url: null, issued_at: new Date().toISOString() };
    try {
      const res = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: body }), signal: ctrl ? ctrl.signal : undefined,
      });
      let data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      if (!res.ok || !data || !data.invoice) {
        const msg = (data && (data.message || data.error)) || "Servidor de nota fiscal respondeu " + res.status + ".";
        return Object.assign(base, { status: "pendente", message: "Nota fiscal não emitida agora: " + msg + " A loja emite depois." });
      }
      return Object.assign(base, data.invoice, { provider: data.invoice.provider || provider });
    } catch (e) {
      const msg = e && e.name === "AbortError" ? "tempo esgotado" : "sem conexão com o servidor";
      return Object.assign(base, { status: "pendente", message: "Nota fiscal não emitida agora (" + msg + "). A loja emite depois." });
    } finally { if (timer) clearTimeout(timer); }
  }

  async function emit(order) {
    loadMenu();
    const provider = String(cfg().provider || "simulado").toLowerCase();
    try {
      if (provider === "simulado" || !provider) return await emitSimulado(order);
      return await emitRemote(order, provider);
    } catch (e) {
      console.error("nfce", e);
      return { status: "pendente", provider, number: null, series: null, key: null, url: null, issued_at: new Date().toISOString(), message: "Nota fiscal não emitida agora. A loja emite depois." };
    }
  }

  // ------------------------------------------------------------------
  // render (DANFE NFC-e simplificado)
  // ------------------------------------------------------------------
  const PAY = { pix: "Pix", cartao: "Cartão", dinheiro: "Dinheiro" };
  const STATUS = {
    simulada: "Emissão de teste", autorizada: "Autorizada pela SEFAZ", pendente: "Emissão pendente", erro: "Erro na emissão",
  };
  function fmtCpf(c) { c = digits(c); return c.length === 11 ? c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : c; }
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" }); } catch (e) { return ""; }
  }
  function itemDesc(it) {
    const opts = [];
    (it.choices || []).forEach((g) => (g.options || []).forEach((o) => opts.push(o.name)));
    return it.name + (opts.length ? " (" + opts.join(", ") + ")" : "");
  }

  function render(invoice, order) {
    invoice = invoice || {}; order = order || {};
    const st = storeInfo();
    const em = invoice.emitter || {};
    const items = order.items || [];
    const t = order.totals || {};
    const pay = order.payment || {};
    const cpf = order.customer && order.customer.cpf;
    const status = invoice.status || "pendente";
    let rows = "";
    items.forEach((it, i) => {
      const qty = Number(it.qty) || 1;
      rows += '<tr><td class="ck-nfce-n">' + pad(i + 1, 3) + '</td><td class="ck-nfce-d">' + esc(itemDesc(it)) +
        '<span class="ck-nfce-q">' + qty + " UN × " + esc(money(it.unitPrice)) + "</span></td>" +
        '<td class="ck-nfce-v">' + esc(money(it.total != null ? it.total : qty * (it.unitPrice || 0))) + "</td></tr>";
    });
    let qr = "";
    if (invoice.url) {
      try { qr = QR.svg(invoice.url, { className: "ck-nfce-qr", label: "QR Code de consulta da NFC-e" }); } catch (e) { qr = ""; }
    }
    const payLabel = PAY[pay.method] || pay.method || "—";
    const banner = status === "autorizada" ? "" :
      '<p class="ck-nfce-banner ck-nfce-banner--' + esc(status) + '">' + esc(invoice.message || STATUS[status] || "") + "</p>";
    return (
      '<article class="ck-nfce" aria-label="Cupom da nota fiscal">' +
      banner +
      '<header class="ck-nfce-head"><strong>' + esc(em.name || st.name || "Pizzaria Jr Delícia") + "</strong>" +
      "<span>CNPJ: " + esc(em.cnpj ? em.cnpj : "00.000.000/0000-00") + (em.ie ? " · IE: " + esc(em.ie) : "") + "</span>" +
      (em.address || st.address ? "<span>" + esc(em.address || [st.address, st.city].filter(Boolean).join(" — ")) + "</span>" : "") +
      '<span class="ck-nfce-title">Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica</span></header>' +
      '<table class="ck-nfce-items"><thead><tr><th>#</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>' + rows + "</tbody></table>" +
      '<dl class="ck-nfce-tot">' +
      "<dt>Qtd. total de itens</dt><dd>" + items.reduce((a, it) => a + (Number(it.qty) || 1), 0) + "</dd>" +
      "<dt>Subtotal</dt><dd>" + esc(money(t.subtotal)) + "</dd>" +
      (t.deliveryFee ? "<dt>Taxa de entrega</dt><dd>" + esc(money(t.deliveryFee)) + "</dd>" : "") +
      (t.discount ? "<dt>Desconto</dt><dd>−" + esc(money(t.discount)) + "</dd>" : "") +
      '<dt class="ck-nfce-big">Valor a pagar</dt><dd class="ck-nfce-big">' + esc(money(t.total)) + "</dd>" +
      "<dt>Forma de pagamento</dt><dd>" + esc(payLabel) + "</dd>" +
      (pay.method === "dinheiro" && pay.changeFor ? "<dt>Troco para</dt><dd>" + esc(money(pay.changeFor)) + "</dd>" : "") +
      "</dl>" +
      '<div class="ck-nfce-meta">' +
      "<p><strong>NFC-e nº " + esc(invoice.number != null ? pad(invoice.number, 9).replace(/(\d{3})(?=\d)/g, "$1.") : "—") +
      " · Série " + esc(invoice.series != null ? pad(invoice.series, 3) : "—") + "</strong></p>" +
      (invoice.issued_at ? "<p>Emissão: " + esc(fmtDate(invoice.issued_at)) + "</p>" : "") +
      "<p>" + (cpf ? "Consumidor CPF: " + esc(fmtCpf(cpf)) : "Consumidor não identificado") + "</p>" +
      (invoice.key ? '<p class="ck-nfce-klabel">Chave de acesso</p><p class="ck-nfce-key">' + esc(formatKey(invoice.key)) + "</p>" : "") +
      (invoice.protocol ? "<p>Protocolo de autorização: " + esc(invoice.protocol) + "</p>" : "") +
      "<p>Situação: " + esc(STATUS[status] || status) + "</p>" +
      "</div>" +
      (qr ? '<div class="ck-nfce-qrwrap">' + qr + '<p>Consulte pela chave de acesso ou leia o QR Code</p>' +
        '<a href="' + esc(invoice.url) + '" target="_blank" rel="noopener">Abrir consulta</a></div>' : "") +
      (invoice.danfe_url ? '<p class="ck-nfce-link"><a href="' + esc(invoice.danfe_url) + '" target="_blank" rel="noopener">Baixar DANFE oficial (PDF/HTML)</a></p>' : "") +
      "</article>"
    );
  }

  JR.nfce = { emit, render, qrSvg: QR.svg, qrMatrix: QR.encode, formatKey, _mod11: mod11, _buildKey: buildKey };
})();
