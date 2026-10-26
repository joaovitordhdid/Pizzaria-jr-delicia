// Finalização do pedido: dados do cliente, entrega/retirada com localização, pagamento, revisão,
// emissão da nota (JR.nfce) e confirmação. Publica JR.checkout = { open(), close(), pixPayload(), validCPF() }.
(function () {
  const JR = (window.JR = window.JR || {});
  const CUST_KEY = "jr_v1_customer";
  const STEPS = [
    { id: "dados", label: "Seus dados" },
    { id: "entrega", label: "Entrega" },
    { id: "pagamento", label: "Pagamento" },
    { id: "revisao", label: "Revisão" },
  ];

  // ---------------- utilidades ----------------
  const $ = (sel, el) => (el || document).querySelector(sel);
  const digits = (s) => String(s == null ? "" : s).replace(/\D/g, "");
  const money = (n) => (JR.money ? JR.money(n) : "R$ " + (Number(n) || 0).toFixed(2).replace(".", ","));
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function cfg() { return window.JR_CONFIG || {}; }
  function lsGet(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } }

  // ---------------- validação e máscaras ----------------
  function validCPF(v) {
    const c = digits(v);
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    let s = 0;
    for (let i = 0; i < 9; i++) s += Number(c[i]) * (10 - i);
    let d1 = (s * 10) % 11; if (d1 === 10) d1 = 0;
    if (d1 !== Number(c[9])) return false;
    s = 0;
    for (let i = 0; i < 10; i++) s += Number(c[i]) * (11 - i);
    let d2 = (s * 10) % 11; if (d2 === 10) d2 = 0;
    return d2 === Number(c[10]);
  }
  function maskCPF(v) {
    const d = digits(v).slice(0, 11);
    return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }
  function maskPhone(v) {
    let d = digits(v);
    if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
    d = d.slice(0, 11);
    if (d.length <= 2) return d.length ? "(" + d : "";
    if (d.length <= 7) return "(" + d.slice(0, 2) + ") " + d.slice(2);
    return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
  }
  function parseMoney(v) {
    const s = String(v || "").replace(/[^\d,.]/g, "");
    if (!s) return NaN;
    // "1.234,56" ou "100,50" ou "100.50"
    const norm = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
    return round2(parseFloat(norm));
  }
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  // ---------------- Pix (BR Code EMV) ----------------
  function tlv(id, v) { return id + String(v.length).padStart(2, "0") + v; }
  function crc16(s) {
    let crc = 0xffff;
    for (let i = 0; i < s.length; i++) {
      crc ^= s.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
  }
  function ascii(s, max) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 .\-]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  }
  function normalizePixKey(key) {
    const k = String(key || "").trim();
    if (!k) return "";
    if (k.includes("@")) return k.toLowerCase();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k)) return k.toLowerCase(); // chave aleatória
    if (k.startsWith("+")) return "+" + digits(k);
    const d = digits(k);
    if (d.length === 14) return d; // CNPJ
    if (d.length === 11 && validCPF(d)) return d; // CPF
    if (d.length === 10 || d.length === 11) return "+55" + d; // celular sem DDI
    if (d.length === 12 || d.length === 13) return "+" + d;
    return k;
  }
  // Gera o "Pix copia e cola" estático com valor. Retorna "" sem chave.
  function pixPayload(opts) {
    const key = normalizePixKey(opts.key);
    if (!key) return "";
    const name = ascii(opts.name || "PIZZARIA JR DELICIA", 25) || "PIZZARIA";
    const city = ascii(opts.city || "SAO PAULO", 15) || "BRASIL";
    const txid = String(opts.txid || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
    let mai = tlv("00", "br.gov.bcb.pix") + tlv("01", key);
    const desc = ascii(opts.description, Math.max(0, 99 - mai.length - 4));
    if (desc) mai += tlv("02", desc);
    let p = tlv("00", "01") + tlv("26", mai) + tlv("52", "0000") + tlv("53", "986");
    if (opts.amount > 0) p += tlv("54", Number(opts.amount).toFixed(2));
    p += tlv("58", "BR") + tlv("59", name) + tlv("60", city) + tlv("62", tlv("05", txid)) + "6304";
    return p + crc16(p);
  }
  function pixConfig(store) {
    const p = cfg().pix || {};
    return { key: p.key || "", name: p.name || (store && store.name) || "Pizzaria Jr Delicia", city: p.city || (store && store.city) || "Sao Paulo" };
  }

  // ---------------- estado ----------------
  const blankAddr = () => ({ street: "", number: "", complement: "", district: "", city: "", reference: "", lat: null, lng: null, accuracy: null, locationStatus: "", locationDenied: false });
  const state = {
    step: 0,
    isOpen: false,
    loaded: false,
    c: { name: "", cpf: "", phone: "", email: "" },
    f: "entrega",
    a: blankAddr(),
    geo: { status: "idle", geocode: "idle" },
    p: { method: "", card: "credito", changeFor: "", noChange: false },
    errors: {},
    store: null,
    submitting: false,
    submitError: "",
    pending: null, // { code, invoice } para reenvio sem emitir a nota de novo
    result: null,
    lastFocus: null,
  };

  function loadSaved() {
    if (state.loaded) return;
    state.loaded = true;
    const s = lsGet(CUST_KEY);
    if (!s) return;
    Object.assign(state.c, s.c || {});
    if (s.f === "entrega" || s.f === "retirada") state.f = s.f;
    if (s.a) ["street", "number", "complement", "district", "city", "reference"].forEach((k) => { if (s.a[k]) state.a[k] = s.a[k]; });
    if (s.p && s.p.method) { state.p.method = s.p.method; if (s.p.card) state.p.card = s.p.card; }
  }
  function saveCustomer() {
    const a = {};
    ["street", "number", "complement", "district", "city", "reference"].forEach((k) => { a[k] = state.a[k]; });
    lsSet(CUST_KEY, { c: state.c, f: state.f, a, p: { method: state.p.method, card: state.p.card } });
  }

  // ---------------- carrinho / totais ----------------
  function cartItems() { return (JR.cart && Array.isArray(JR.cart.items)) ? JR.cart.items : []; }
  function totals() {
    const items = cartItems();
    let subtotal = JR.cart && typeof JR.cart.subtotal === "function" ? Number(JR.cart.subtotal()) : NaN;
    if (!isFinite(subtotal)) subtotal = items.reduce((s, it) => s + (Number(it.total) || (Number(it.unitPrice) || 0) * (Number(it.qty) || 1)), 0);
    subtotal = round2(subtotal);
    const st = state.store || {};
    const deliveryFee = state.f === "entrega" ? round2(st.deliveryFee || 0) : 0;
    const discount = 0;
    return { subtotal, deliveryFee, discount, total: round2(subtotal + deliveryFee - discount) };
  }
  function minOrder() { return Number((state.store || {}).minOrder) || 0; }

  // ---------------- ícones ----------------
  const I = {
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.6" fill="currentColor"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 00-7.8 13.5L3 21l4.6-1.2A9 9 0 1012 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 8.5c0 3.3 2.9 6.5 6.4 6.6l1-1.4-1.9-.9-.8.8c-1-.4-2.3-1.6-2.8-2.7l.8-.8-.8-1.9-1.4.8z" fill="currentColor"/></svg>',
    pix: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l3.4 3.4-3.4 3.4-3.4-3.4zM12 14.4l3.4 3.4-3.4 3.4-3.4-3.4zM2.8 12l3.4-3.4L9.6 12l-3.4 3.4zM14.4 12l3.4-3.4 3.4 3.4-3.4 3.4z" fill="currentColor"/></svg>',
    card: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18" stroke="currentColor" stroke-width="2"/><path d="M7 15h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    cash: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    moto: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="17" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="17" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 17h6l3-6h3M13 7h3l2 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 016 0v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  };

  // ---------------- componentes ----------------
  function field(o) {
    const err = state.errors[o.key];
    const id = "ck-" + o.key.replace(".", "-");
    const val = o.value != null ? o.value : getVal(o.key);
    const attrs = [
      'id="' + id + '"', 'name="' + o.key + '"', 'data-k="' + o.key + '"', 'type="' + (o.type || "text") + '"',
      'value="' + esc(val) + '"',
      o.inputmode ? 'inputmode="' + o.inputmode + '"' : "", o.autocomplete ? 'autocomplete="' + o.autocomplete + '"' : "",
      o.placeholder ? 'placeholder="' + esc(o.placeholder) + '"' : "", o.maxlength ? 'maxlength="' + o.maxlength + '"' : "",
      o.enterkeyhint ? 'enterkeyhint="' + o.enterkeyhint + '"' : "",
      o.optional ? "" : 'aria-required="true"', err ? 'aria-invalid="true"' : "",
      'aria-describedby="' + id + "-err" + (o.hint ? " " + id + "-hint" : "") + '"',
      o.autocapitalize ? 'autocapitalize="' + o.autocapitalize + '"' : "",
      o.spellcheck === false ? 'spellcheck="false"' : "",
    ].filter(Boolean).join(" ");
    return (
      '<div class="ck-field' + (err ? " is-invalid" : "") + (o.cls ? " " + o.cls : "") + '">' +
      '<label for="' + id + '">' + esc(o.label) + (o.optional ? ' <span class="ck-opt">(opcional)</span>' : "") + "</label>" +
      "<input " + attrs + ">" +
      (o.hint ? '<p class="ck-hint" id="' + id + '-hint">' + esc(o.hint) + "</p>" : "") +
      '<p class="ck-err" id="' + id + '-err">' + (err ? esc(err) : "") + "</p></div>"
    );
  }
  function getVal(key) {
    const [g, k] = key.split(".");
    return state[g] ? state[g][k] : "";
  }

  function progress() {
    const pct = ((state.step + 1) / STEPS.length) * 100;
    return (
      '<nav class="ck-progress" aria-label="Etapas do pedido"><ol>' +
      STEPS.map((s, i) => {
        const cls = i < state.step ? "is-done" : i === state.step ? "is-current" : "";
        const inner = '<span class="ck-dot">' + (i < state.step ? I.check : i + 1) + '</span><span class="ck-plabel">' + esc(s.label) + "</span>";
        return '<li class="' + cls + '"' + (i === state.step ? ' aria-current="step"' : "") + ">" +
          (i < state.step ? '<button type="button" data-ck="goto" data-step="' + i + '">' + inner + "</button>" : '<span class="ck-pitem">' + inner + "</span>") + "</li>";
      }).join("") +
      '</ol><div class="ck-bar" aria-hidden="true"><span style="width:' + pct + '%"></span></div></nav>'
    );
  }

  // ---------------- etapas ----------------
  function stepDados() {
    return (
      '<h3 class="ck-h" tabindex="-1">Quem está pedindo?</h3>' +
      '<p class="ck-lead">Precisamos desses dados para entregar e emitir a nota fiscal.</p>' +
      field({ key: "c.name", label: "Nome completo", autocomplete: "name", placeholder: "Ex.: Maria Souza", autocapitalize: "words", enterkeyhint: "next" }) +
      field({ key: "c.cpf", label: "CPF", inputmode: "numeric", autocomplete: "off", placeholder: "000.000.000-00", maxlength: 14, enterkeyhint: "next", hint: "Vai na sua nota fiscal (CPF na nota)." }) +
      field({ key: "c.phone", label: "Telefone / WhatsApp", type: "tel", inputmode: "tel", autocomplete: "tel-national", placeholder: "(11) 91234-5678", maxlength: 16, enterkeyhint: "next", hint: "Para avisarmos sobre o pedido." }) +
      field({ key: "c.email", label: "E-mail", type: "email", inputmode: "email", autocomplete: "email", placeholder: "voce@email.com", optional: true, autocapitalize: "off", spellcheck: false, enterkeyhint: "done", hint: "Para receber a nota fiscal por e-mail." })
    );
  }

  function geoBlock() {
    const g = state.geo, a = state.a, err = state.errors.geo;
    const mapUrl = a.lat != null ? "https://www.google.com/maps?q=" + a.lat + "," + a.lng : "";
    let body = "";
    if (g.status === "ok") {
      body =
        '<div class="ck-geo-ok"><span class="ck-geo-ic">' + I.check + "</span><div>" +
        "<strong>Localização capturada</strong>" +
        "<span>Precisão de ~" + Math.round(a.accuracy || 0) + " m · " +
        '<a href="' + esc(mapUrl) + '" target="_blank" rel="noopener">ver no mapa</a></span>' +
        (g.geocode === "loading" ? '<span class="ck-muted">Buscando o endereço…</span>' : "") +
        (g.geocode === "ok" ? '<span class="ck-muted">Endereço preenchido — confira abaixo.</span>' : "") +
        (g.geocode === "fail" ? '<span class="ck-muted">Não conseguimos achar o endereço automaticamente. Digite abaixo.</span>' : "") +
        '</div><button type="button" class="ck-link" data-ck="geo">Atualizar</button></div>';
    } else {
      const loading = g.status === "loading";
      body =
        '<button type="button" class="ck-btn ck-btn--geo" data-ck="geo" id="ck-geo-btn"' + (loading ? " disabled" : "") + ' aria-describedby="ck-geo-err">' +
        (loading ? '<span class="ck-spin" aria-hidden="true"></span> Obtendo localização…' : I.pin + " Usar minha localização atual") + "</button>";
      if (g.status === "denied") {
        body +=
          '<div class="ck-note ck-note--warn" role="status"><strong>Você bloqueou a localização.</strong>' +
          "<p>Para liberar: no <b>Android (Chrome)</b>, toque no cadeado ao lado do endereço do site → Permissões → Localização → Permitir. " +
          "No <b>iPhone</b>, abra Ajustes → Privacidade → Serviços de Localização → Safari → “Durante o uso”. Depois toque em “Usar minha localização atual” de novo.</p>" +
          "<p>Se preferir, siga com o endereço digitado: avisaremos a loja que a localização não foi compartilhada.</p></div>";
      } else if (g.status === "unavailable" || g.status === "timeout" || g.status === "unsupported") {
        const why = g.status === "timeout" ? "O GPS demorou demais para responder." :
          g.status === "unsupported" ? "Este navegador não oferece localização." : "Não foi possível obter sua localização agora.";
        body += '<div class="ck-note ck-note--warn" role="status"><strong>' + why + "</strong>" +
          "<p>Ative o GPS/localização do aparelho e tente de novo, ou siga com o endereço digitado.</p></div>";
      } else if (!loading) {
        body += '<p class="ck-hint">Obrigatório para entrega: o motoboy chega direto até você.</p>';
      }
    }
    return '<div class="ck-geo' + (err ? " is-invalid" : "") + '">' + body + '<p class="ck-err" id="ck-geo-err">' + (err ? esc(err) : "") + "</p></div>";
  }

  function stepEntrega() {
    const st = state.store || {};
    const fee = Number(st.deliveryFee) || 0;
    const seg =
      '<fieldset class="ck-seg"><legend class="ck-sr">Como quer receber?</legend>' +
      '<label class="ck-segopt"><input type="radio" name="f" value="entrega" data-ck="f"' + (state.f === "entrega" ? " checked" : "") + ">" +
      '<span>' + I.moto + "<b>Entrega</b><small>" + (fee ? "Taxa " + esc(money(fee)) : "Taxa grátis") + "</small></span></label>" +
      '<label class="ck-segopt"><input type="radio" name="f" value="retirada" data-ck="f"' + (state.f === "retirada" ? " checked" : "") + ">" +
      '<span>' + I.bag + "<b>Retirada</b><small>Sem taxa</small></span></label></fieldset>";
    let body = "";
    if (state.f === "entrega") {
      body =
        geoBlock() +
        '<div class="ck-grid">' +
        field({ key: "a.street", label: "Rua", autocomplete: "address-line1", placeholder: "Rua / Avenida", cls: "ck-span2", enterkeyhint: "next" }) +
        field({ key: "a.number", label: "Número", inputmode: "numeric", autocomplete: "off", placeholder: "123 ou s/n", maxlength: 10, enterkeyhint: "next" }) +
        field({ key: "a.complement", label: "Complemento", optional: true, autocomplete: "address-line2", placeholder: "Apto, bloco…", enterkeyhint: "next" }) +
        field({ key: "a.district", label: "Bairro", autocomplete: "address-level3", placeholder: "Bairro", enterkeyhint: "next" }) +
        field({ key: "a.city", label: "Cidade", autocomplete: "address-level2", placeholder: "Cidade", enterkeyhint: "next" }) +
        field({ key: "a.reference", label: "Ponto de referência", optional: true, autocomplete: "off", placeholder: "Ex.: portão azul, ao lado da padaria", cls: "ck-span2", enterkeyhint: "done" }) +
        "</div>";
    } else {
      body =
        '<div class="ck-note"><strong>Retire no balcão</strong><p>' +
        esc([st.address, st.city].filter(Boolean).join(" — ") || "Endereço da loja informado na confirmação.") +
        "</p>" + (st.etaMin ? "<p>Fica pronto em " + esc(st.etaMin) + ".</p>" : "") + "</div>";
    }
    return '<h3 class="ck-h" tabindex="-1">Como você quer receber?</h3>' + seg + body;
  }

  function changeChips(total) {
    const set = [];
    [Math.ceil(total / 10) * 10, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100].forEach((v) => {
      if (v > total && !set.includes(v)) set.push(v);
    });
    return set.slice(0, 3);
  }

  function stepPagamento() {
    const t = totals();
    const p = state.p;
    const hasKey = !!pixConfig(state.store).key;
    const where = state.f === "entrega" ? "na entrega" : "na retirada";
    const opt = (val, icon, title, sub, extra) =>
      '<div class="ck-pay' + (p.method === val ? " is-on" : "") + '"><label class="ck-payrow">' +
      '<input type="radio" name="pay" value="' + val + '" data-ck="pay"' + (p.method === val ? " checked" : "") + ' aria-describedby="ck-pay-err">' +
      '<span class="ck-payic">' + icon + '</span><span class="ck-paytx"><b>' + title + "</b><small>" + sub + "</small></span>" +
      '<span class="ck-radio" aria-hidden="true"></span></label>' + (p.method === val && extra ? '<div class="ck-payx">' + extra + "</div>" : "") + "</div>";

    const cardExtra =
      '<fieldset class="ck-mini"><legend>Tipo de cartão</legend>' +
      ["credito", "debito"].map((v) =>
        '<label><input type="radio" name="card" value="' + v + '" data-ck="card"' + (p.card === v ? " checked" : "") + "><span>" + (v === "credito" ? "Crédito" : "Débito") + "</span></label>").join("") +
      "</fieldset><p class=\"ck-hint\">O entregador leva a maquininha.</p>";

    const chips = changeChips(t.total).map((v) =>
      '<button type="button" class="ck-chip" data-ck="chip" data-v="' + v + '">' + esc(money(v)) + "</button>").join("");
    const cashExtra =
      (p.noChange ? "" :
        field({ key: "p.changeFor", label: "Troco para quanto?", inputmode: "decimal", autocomplete: "off", placeholder: "Ex.: 100,00", hint: "Total do pedido: " + money(t.total) + ".", enterkeyhint: "done" }) +
        '<div class="ck-chips" aria-label="Valores rápidos">' + chips + "</div>") +
      '<label class="ck-check"><input type="checkbox" data-ck="nochange"' + (p.noChange ? " checked" : "") + "><span>Não preciso de troco (valor exato)</span></label>";

    const pixExtra = hasKey
      ? '<p class="ck-hint">O QR Code e o código “copia e cola” aparecem assim que você enviar o pedido.</p>'
      : '<p class="ck-hint">O atendente envia a chave Pix pelo WhatsApp depois que você enviar o pedido.</p>';

    return (
      '<h3 class="ck-h" tabindex="-1">Como você vai pagar?</h3>' +
      '<fieldset class="ck-pays' + (state.errors.pay ? " is-invalid" : "") + '"><legend class="ck-sr">Forma de pagamento</legend>' +
      opt("pix", I.pix, "Pix", "Aprovação na hora", pixExtra) +
      opt("cartao", I.card, "Cartão " + where, "Crédito ou débito", cardExtra) +
      opt("dinheiro", I.cash, "Dinheiro " + where, "Informe se precisa de troco", cashExtra) +
      '<p class="ck-err" id="ck-pay-err">' + esc(state.errors.pay || "") + "</p></fieldset>"
    );
  }

  function itemLines(it) {
    const opts = [];
    (it.choices || []).forEach((g) => (g.options || []).forEach((o) => opts.push(o.name + (o.price && g.kind === "extra" ? " (+" + money(o.price) + ")" : ""))));
    let s = "";
    if (opts.length) s += '<span class="ck-isub">' + esc(opts.join(" · ")) + "</span>";
    if (it.removed && it.removed.length) s += '<span class="ck-isub ck-isub--rm">Sem: ' + esc(it.removed.join(", ")) + "</span>";
    if (it.note) s += '<span class="ck-isub">Obs.: ' + esc(it.note) + "</span>";
    return s;
  }
  function paymentLabel() {
    const p = state.p;
    if (p.method === "pix") return "Pix";
    if (p.method === "cartao") return "Cartão de " + (p.card === "debito" ? "débito" : "crédito") + (state.f === "entrega" ? " na entrega" : " na retirada");
    if (p.method === "dinheiro") return "Dinheiro" + (p.noChange ? " (sem troco)" : p.changeFor ? " — troco para " + money(parseMoney(p.changeFor)) : "");
    return "—";
  }
  function addressLine(a) {
    return [a.street && a.street + (a.number ? ", " + a.number : ""), a.complement, a.district, a.city].filter(Boolean).join(" — ");
  }

  function stepRevisao() {
    const t = totals(), items = cartItems(), min = minOrder(), c = state.c, a = state.a;
    const below = min > 0 && t.subtotal < min;
    const st = state.store || {};
    const locTxt = a.locationStatus === "ok"
      ? '<a href="https://www.google.com/maps?q=' + a.lat + "," + a.lng + '" target="_blank" rel="noopener">Localização atual enviada (ver no mapa)</a>'
      : '<span class="ck-warn-tx">Localização não compartilhada</span>';
    return (
      '<h3 class="ck-h" tabindex="-1">Confira e envie</h3>' +
      (st.open === false ? '<div class="ck-note ck-note--warn"><strong>A loja está fechada agora.</strong><p>Seu pedido será visto quando abrirmos.</p></div>' :
        (JR.storeStatus && JR.storeStatus(st).state === "scheduled" ? '<div class="ck-note ck-note--warn"><strong>Pedido agendado</strong><p>' + esc(JR.storeStatus(st).note) + '</p></div>' : "")) +
      '<section class="ck-card"><div class="ck-card-h"><h4>Itens</h4></div><ul class="ck-items">' +
      items.map((it) => '<li><span class="ck-iq">' + (Number(it.qty) || 1) + '×</span><span class="ck-in"><b>' + esc(it.name) + "</b>" + itemLines(it) +
        '</span><span class="ck-iv">' + esc(money(it.total)) + "</span></li>").join("") + "</ul></section>" +
      '<section class="ck-card"><div class="ck-card-h"><h4>Seus dados</h4><button type="button" class="ck-link" data-ck="goto" data-step="0">Alterar</button></div>' +
      "<p>" + esc(c.name) + "<br>CPF " + esc(maskCPF(c.cpf)) + " · " + esc(maskPhone(c.phone)) + (c.email ? "<br>" + esc(c.email) : "") + "</p></section>" +
      '<section class="ck-card"><div class="ck-card-h"><h4>' + (state.f === "entrega" ? "Entrega" : "Retirada") + '</h4><button type="button" class="ck-link" data-ck="goto" data-step="1">Alterar</button></div>' +
      (state.f === "entrega"
        ? "<p>" + esc(addressLine(a)) + (a.reference ? "<br>Ref.: " + esc(a.reference) : "") + "<br>" + locTxt + "</p>"
        : "<p>Retirada no balcão" + (st.address ? ": " + esc(st.address) : "") + "</p>") +
      "</section>" +
      '<section class="ck-card"><div class="ck-card-h"><h4>Pagamento</h4><button type="button" class="ck-link" data-ck="goto" data-step="2">Alterar</button></div>' +
      "<p>" + esc(paymentLabel()) + "</p></section>" +
      '<dl class="ck-totals"><dt>Subtotal</dt><dd>' + esc(money(t.subtotal)) + "</dd>" +
      (state.f === "entrega" ? "<dt>Taxa de entrega</dt><dd>" + (t.deliveryFee ? esc(money(t.deliveryFee)) : "Grátis") + "</dd>" : "") +
      (t.discount ? "<dt>Desconto</dt><dd>−" + esc(money(t.discount)) + "</dd>" : "") +
      '<dt class="ck-tbig">Total</dt><dd class="ck-tbig">' + esc(money(t.total)) + "</dd></dl>" +
      (below ? '<div class="ck-note ck-note--warn" role="alert"><strong>Pedido mínimo: ' + esc(money(min)) + "</strong><p>Faltam " + esc(money(min - t.subtotal)) + " em produtos. Volte ao cardápio para adicionar mais itens.</p></div>" : "") +
      (state.submitError ? '<div class="ck-note ck-note--err" role="alert"><strong>Não foi possível enviar.</strong><p>' + esc(state.submitError) + "</p></div>" : "")
    );
  }

  // ---------------- tela de sucesso ----------------
  const TIMELINE = (fulfill) => [
    { id: "novo", label: "Pedido recebido" },
    { id: "preparo", label: "Em preparo" },
    { id: "saiu", label: fulfill === "retirada" ? "Pronto para retirada" : "Saiu para entrega" },
    { id: "entregue", label: fulfill === "retirada" ? "Retirado" : "Entregue" },
  ];
  function whatsappNumber() {
    let n = digits(cfg().whatsapp || (state.store && state.store.whatsapp) || "");
    if (!n) return "";
    if (n.length === 10 || n.length === 11) n = "55" + n;
    return n;
  }
  function whatsappText(o) {
    const L = [];
    L.push("*Novo pedido " + o.code + "* — " + ((state.store && state.store.name) || "Pizzaria Jr Delícia"));
    L.push("");
    (o.items || []).forEach((it) => {
      L.push((it.qty || 1) + "x " + it.name + " — " + money(it.total));
      const opts = [];
      (it.choices || []).forEach((g) => (g.options || []).forEach((x) => opts.push(x.name)));
      if (opts.length) L.push("   " + opts.join(", "));
      if (it.removed && it.removed.length) L.push("   Sem: " + it.removed.join(", "));
      if (it.note) L.push("   Obs.: " + it.note);
    });
    L.push("");
    L.push("Subtotal: " + money(o.totals.subtotal));
    if (o.fulfillment === "entrega") L.push("Entrega: " + (o.totals.deliveryFee ? money(o.totals.deliveryFee) : "grátis"));
    L.push("*Total: " + money(o.totals.total) + "*");
    L.push("Pagamento: " + o._payLabel);
    L.push("");
    L.push("Cliente: " + o.customer.name);
    L.push("Telefone: " + maskPhone(o.customer.phone));
    const a = o.customer.address || {};
    if (o.fulfillment === "entrega") {
      L.push("Endereço: " + addressLine(a));
      if (a.reference) L.push("Referência: " + a.reference);
      L.push(a.lat != null ? "Localização: https://www.google.com/maps?q=" + a.lat + "," + a.lng : "Localização: não compartilhada pelo cliente");
    } else {
      L.push("Retirada no balcão");
    }
    if (o.invoice && o.invoice.key) L.push("NFC-e: " + o.invoice.key);
    return L.join("\n");
  }

  function successView() {
    const o = state.result;
    const status = o.status || "novo";
    const tl = TIMELINE(o.fulfillment);
    const idx = status === "cancelado" ? -1 : Math.max(0, tl.findIndex((s) => s.id === status));
    const time = (() => { try { return new Date(o.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } })();
    const pc = pixConfig(state.store);
    let pix = "";
    if (o.payment.method === "pix") {
      if (o.payment.pixCode) {
        let qr = "";
        try { qr = JR.nfce && JR.nfce.qrSvg ? JR.nfce.qrSvg(o.payment.pixCode, { className: "ck-pixqr", label: "QR Code Pix de " + money(o.totals.total) }) : ""; } catch (e) { qr = ""; }
        pix =
          '<section class="ck-card ck-pixbox"><h4>Pague com Pix</h4><p class="ck-pixval">' + esc(money(o.totals.total)) + "</p>" +
          (qr ? '<div class="ck-qrwrap">' + qr + "</div><p class=\"ck-hint\">Abra o app do seu banco, escolha Pix → Ler QR Code.</p>" : "") +
          '<label class="ck-sm" for="ck-pixcode">Pix copia e cola</label>' +
          '<textarea id="ck-pixcode" class="ck-pixcode" readonly rows="3">' + esc(o.payment.pixCode) + "</textarea>" +
          '<button type="button" class="ck-btn ck-btn--primary ck-btn--block" data-ck="copypix">' + I.copy + ' <span>Copiar código Pix</span></button>' +
          '<p class="ck-hint">Recebedor: ' + esc(ascii(pc.name, 25)) + ". Depois de pagar, envie o comprovante pelo WhatsApp.</p></section>";
      } else {
        pix = '<section class="ck-card ck-pixbox"><h4>Pagamento via Pix</h4><p>O atendente envia a chave Pix pelo WhatsApp. Valor: <b>' + esc(money(o.totals.total)) + "</b>.</p></section>";
      }
    }
    const wa = whatsappNumber();
    const waBtn = wa
      ? '<a class="ck-btn ck-btn--wa ck-btn--block" target="_blank" rel="noopener" href="https://wa.me/' + wa + "?text=" + encodeURIComponent(whatsappText(o)) + '">' + I.wa + " Enviar pedido pelo WhatsApp</a>"
      : "";
    const inv = o.invoice || {};
    return (
      '<div class="ck-success">' +
      '<div class="ck-hero"><span class="ck-hero-ic">' + I.check + '</span><h3 class="ck-h" tabindex="-1">Pedido enviado!</h3>' +
      '<p>Código do pedido</p><p class="ck-code">' + esc(o.code) + "</p>" +
      ((state.store && state.store.etaMin) ? '<p class="ck-muted">Previsão: ' + esc(state.store.etaMin) + "</p>" : "") + "</div>" +
      (status === "cancelado" ? '<div class="ck-note ck-note--err"><strong>Pedido cancelado pela loja.</strong><p>Fale com a gente pelo WhatsApp.</p></div>' :
        '<ol class="ck-timeline" aria-label="Andamento do pedido">' + tl.map((s, i) =>
          '<li class="' + (i < idx ? "is-done" : i === idx ? "is-current" : "") + '"><span class="ck-tdot">' + (i <= idx ? I.check : "") + "</span><span>" + esc(s.label) +
          (i === 0 && time ? ' <small>' + esc(time) + "</small>" : "") + "</span></li>").join("") + "</ol>") +
      pix + waBtn +
      '<section class="ck-card ck-invoice"><div class="ck-card-h"><h4>Nota fiscal (NFC-e)</h4></div>' +
      (inv.status === "autorizada" && o.customer.email ? '<p class="ck-hint">Cópia enviada para ' + esc(o.customer.email) + " pelo emissor.</p>" : "") +
      (JR.nfce && JR.nfce.render ? JR.nfce.render(inv, o) : "<p>" + esc(inv.message || "") + "</p>") + "</section>" +
      '<button type="button" class="ck-btn ck-btn--ghost ck-btn--block" data-ck="close">Voltar ao cardápio</button>' +
      "</div>"
    );
  }

  // ---------------- render ----------------
  let root = null;
  function ensureRoot() {
    root = document.getElementById("checkout-root");
    if (!root) { root = document.createElement("div"); root.id = "checkout-root"; document.body.appendChild(root); }
    if (!root.dataset.ckBound) {
      root.dataset.ckBound = "1";
      root.addEventListener("click", onClick);
      root.addEventListener("input", onInput);
      root.addEventListener("change", onChange);
      root.addEventListener("submit", onSubmit);
      root.addEventListener("focusout", onBlur);
      root.addEventListener("keydown", onKey);
    }
  }

  function render(focus, keepScroll) {
    if (!root) return;
    const prevBody = $(".ck-body", root);
    const prevScroll = keepScroll && prevBody ? prevBody.scrollTop : 0;
    const items = cartItems();
    const done = !!state.result;
    const t = totals();
    let body, foot = "";
    if (done) {
      body = successView();
    } else if (!items.length) {
      body = '<div class="ck-empty"><h3 class="ck-h" tabindex="-1">Sua sacola está vazia</h3><p>Escolha suas pizzas no cardápio e volte aqui para finalizar.</p>' +
        '<button type="button" class="ck-btn ck-btn--primary" data-ck="close">Ver cardápio</button></div>';
    } else {
      body = [stepDados, stepEntrega, stepPagamento, stepRevisao][state.step]();
      const last = state.step === STEPS.length - 1;
      const blocked = last && minOrder() > 0 && t.subtotal < minOrder();
      foot =
        '<footer class="ck-foot"><div class="ck-ftot"><span>Total</span><strong>' + esc(money(t.total)) + "</strong></div>" +
        '<button type="submit" form="ck-form" class="ck-btn ck-btn--primary ck-btn--go"' + (state.submitting || blocked ? " disabled" : "") + ">" +
        (state.submitting ? '<span class="ck-spin" aria-hidden="true"></span> Enviando…' : blocked ? "Pedido mínimo " + esc(money(minOrder())) : last ? "Enviar pedido" : "Continuar") + "</button></footer>";
    }
    const showBack = !done && items.length && state.step > 0;
    root.innerHTML =
      '<div class="ck-backdrop" data-ck="close"></div>' +
      '<section class="ck-sheet' + (state.enter ? " is-enter" : "") + '" role="dialog" aria-modal="true" aria-labelledby="ck-title">' +
      '<header class="ck-top">' +
      (showBack ? '<button type="button" class="ck-icon" data-ck="back" aria-label="Voltar para a etapa anterior">' + I.back + "</button>" : '<span class="ck-icon-sp"></span>') +
      '<div class="ck-ttl"><h2 id="ck-title">' + (done ? "Pedido confirmado" : "Finalizar pedido") + "</h2>" +
      (!done && items.length ? '<span class="ck-stepof">Etapa ' + (state.step + 1) + " de " + STEPS.length + "</span>" : "") + "</div>" +
      '<button type="button" class="ck-icon" data-ck="close" aria-label="Fechar">' + I.close + "</button></header>" +
      (!done && items.length ? progress() : "") +
      '<form id="ck-form" class="ck-body" novalidate autocomplete="on">' + body + "</form>" +
      foot + '<div class="ck-toast" role="status" aria-live="polite"></div></section>';
    root.classList.toggle("is-enter", !!state.enter);
    state.enter = false;
    root.classList.add("is-open");
    const b = $(".ck-body", root);
    if (b) b.scrollTop = prevScroll;
    const target = focus ? document.getElementById(focus) : keepScroll ? null : $(".ck-h", root);
    if (target) { try { target.focus({ preventScroll: !!keepScroll }); } catch (e) { target.focus(); } }
  }

  function toast(msg) {
    const el = root && $(".ck-toast", root);
    if (!el) return;
    el.textContent = msg; el.classList.add("is-on");
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("is-on"), 2200);
  }

  // ---------------- validação por etapa ----------------
  function validateField(key) {
    const c = state.c, a = state.a, p = state.p;
    switch (key) {
      case "c.name": {
        const words = c.name.trim().split(/\s+/).filter((w) => w.length >= 2 && /[A-Za-zÀ-ÿ]/.test(w));
        if (!c.name.trim()) return "Informe seu nome completo.";
        if (words.length < 2) return "Digite nome e sobrenome.";
        return "";
      }
      case "c.cpf":
        if (!digits(c.cpf)) return "Informe seu CPF.";
        if (digits(c.cpf).length < 11) return "O CPF tem 11 números.";
        return validCPF(c.cpf) ? "" : "CPF inválido. Confira os números.";
      case "c.phone": {
        const d = digits(c.phone);
        if (!d) return "Informe seu telefone com DDD.";
        if (d.length !== 11) return "Digite DDD + 9 números. Ex.: (11) 91234-5678.";
        if (Number(d.slice(0, 2)) < 11) return "DDD inválido.";
        if (d[2] !== "9") return "O celular deve começar com 9 depois do DDD.";
        return "";
      }
      case "c.email":
        return !c.email.trim() || EMAIL_RE.test(c.email.trim()) ? "" : "E-mail inválido. Ex.: voce@email.com.";
      case "a.street": return a.street.trim().length >= 3 ? "" : "Informe a rua.";
      case "a.number": return a.number.trim() ? "" : "Informe o número (ou s/n).";
      case "a.district": return a.district.trim().length >= 2 ? "" : "Informe o bairro.";
      case "a.city": return a.city.trim().length >= 2 ? "" : "Informe a cidade.";
      case "p.changeFor": {
        if (p.method !== "dinheiro" || p.noChange) return "";
        const v = parseMoney(p.changeFor), total = totals().total;
        if (!p.changeFor.trim() || !isFinite(v)) return "Diga para quanto é o troco ou marque “Não preciso de troco”.";
        if (v < total) return "O valor precisa ser igual ou maior que o total (" + money(total) + ").";
        return "";
      }
      default: return "";
    }
  }
  function keysForStep(i) {
    if (i === 0) return ["c.name", "c.cpf", "c.phone", "c.email"];
    if (i === 1) return state.f === "entrega" ? ["geo", "a.street", "a.number", "a.district", "a.city"] : [];
    if (i === 2) return ["pay", "p.changeFor"];
    return [];
  }
  function validateStep(i) {
    const errs = {};
    keysForStep(i).forEach((k) => {
      let e = "";
      if (k === "geo") {
        const s = state.geo.status;
        if (s === "idle" || s === "loading") e = s === "loading" ? "Aguarde: estamos obtendo sua localização." : "Toque em “Usar minha localização atual” para continuar.";
      } else if (k === "pay") {
        e = state.p.method ? "" : "Escolha uma forma de pagamento.";
      } else e = validateField(k);
      if (e) errs[k] = e;
    });
    Object.keys(state.errors).forEach((k) => { if (keysForStep(i).includes(k)) delete state.errors[k]; });
    Object.assign(state.errors, errs);
    return Object.keys(errs);
  }
  function focusIdFor(key) {
    if (key === "geo") return "ck-geo-btn";
    if (key === "pay") return null;
    return "ck-" + key.replace(".", "-");
  }

  // ---------------- localização ----------------
  function requestGeo() {
    const a = state.a;
    delete state.errors.geo;
    if (!("geolocation" in navigator)) { state.geo.status = "unsupported"; a.locationStatus = "indisponivel"; a.locationDenied = true; render("ck-a-street", true); return; }
    state.geo.status = "loading"; render(undefined, true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        a.lat = Math.round(pos.coords.latitude * 1e6) / 1e6;
        a.lng = Math.round(pos.coords.longitude * 1e6) / 1e6;
        a.accuracy = Math.round(pos.coords.accuracy || 0);
        a.locationStatus = "ok"; a.locationDenied = false;
        state.geo.status = "ok";
        reverseGeocode(a.lat, a.lng);
        if (state.isOpen && state.step === 1) render(undefined, true);
      },
      (err) => {
        const code = err && err.code;
        state.geo.status = code === 1 ? "denied" : code === 3 ? "timeout" : "unavailable";
        a.lat = a.lng = a.accuracy = null;
        a.locationStatus = code === 1 ? "negada" : "indisponivel";
        a.locationDenied = true;
        if (state.isOpen && state.step === 1) render("ck-geo-btn", true);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }
  async function reverseGeocode(lat, lng) {
    state.geo.geocode = "loading";
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 7000) : null;
    try {
      const url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&accept-language=pt-BR&lat=" + lat + "&lon=" + lng;
      const res = await fetch(url, { signal: ctrl ? ctrl.signal : undefined, headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const ad = (data && data.address) || {};
      const a = state.a;
      const fill = (k, v) => { if (v && !String(a[k] || "").trim()) { a[k] = v; delete state.errors["a." + k]; } };
      fill("street", ad.road || ad.pedestrian || ad.residential);
      fill("number", ad.house_number);
      fill("district", ad.suburb || ad.neighbourhood || ad.quarter || ad.city_district);
      fill("city", ad.city || ad.town || ad.village || ad.municipality);
      state.geo.geocode = ad.road || ad.city || ad.town ? "ok" : "fail";
    } catch (e) {
      state.geo.geocode = "fail";
    } finally {
      if (timer) clearTimeout(timer);
      if (state.isOpen && state.step === 1 && !state.result) {
        const active = document.activeElement && document.activeElement.id;
        render(active && document.getElementById(active) ? active : undefined, true);
      }
    }
  }

  // ---------------- envio ----------------
  function newCode() { return "JR" + Date.now().toString().slice(-6); }

  async function submitOrder() {
    if (state.submitting) return;
    const t = totals();
    if (minOrder() > 0 && t.subtotal < minOrder()) { render(); return; }
    // revalida tudo (o cliente pode ter voltado e mudado algo)
    for (let i = 0; i < 3; i++) {
      const bad = validateStep(i);
      if (bad.length) { state.step = i; render(focusIdFor(bad[0]) || undefined); return; }
    }
    state.submitting = true; state.submitError = ""; render();
    const c = state.c, a = state.a, p = state.p;
    const sig = JSON.stringify([cartItems(), t, c, state.f, a, p]);
    if (!state.pending || state.pending.sig !== sig) state.pending = { sig, code: newCode(), invoice: null };
    const code = state.pending.code;
    const address = state.f === "entrega"
      ? { street: a.street.trim(), number: a.number.trim(), complement: a.complement.trim(), district: a.district.trim(), city: a.city.trim(), reference: a.reference.trim(),
          lat: a.lat, lng: a.lng, accuracy: a.accuracy, locationStatus: a.locationStatus || "negada", locationDenied: a.locationStatus !== "ok",
          mapUrl: a.lat != null ? "https://www.google.com/maps?q=" + a.lat + "," + a.lng : "" }
      : Object.assign(blankAddr(), { locationStatus: "retirada" });
    const pc = pixConfig(state.store);
    const payment = {
      method: p.method,
      card: p.method === "cartao" ? p.card : null,
      changeFor: p.method === "dinheiro" && !p.noChange ? parseMoney(p.changeFor) : null,
      status: "pendente",
      label: paymentLabel(),
      pixCode: p.method === "pix" ? pixPayload({ key: pc.key, name: pc.name, city: pc.city, amount: t.total, txid: code }) : "",
    };
    const order = {
      code,
      customer: { name: c.name.trim().replace(/\s+/g, " "), cpf: digits(c.cpf), phone: digits(c.phone), email: c.email.trim(), fulfillment: state.f, address },
      fulfillment: state.f,
      items: JR.clone ? JR.clone(cartItems()) : JSON.parse(JSON.stringify(cartItems())),
      totals: t,
      payment,
    };
    try {
      if (!state.pending.invoice) {
        let inv = null;
        try { inv = JR.nfce && JR.nfce.emit ? await JR.nfce.emit(order) : null; } catch (e) { inv = null; }
        state.pending.invoice = inv || { status: "pendente", provider: "nenhum", number: null, series: null, key: null, url: null, issued_at: new Date().toISOString(), message: "Nota fiscal será emitida pela loja." };
      }
      if (!JR.db || !JR.db.createOrder) throw new Error("Sistema de pedidos indisponível. Tente novamente em instantes.");
      const saved = await JR.db.createOrder(Object.assign({}, order, { invoice: state.pending.invoice }));
      saveCustomer();
      try { if (JR.cart && JR.cart.clear) JR.cart.clear(); } catch (e) { console.warn(e); }
      saved._payLabel = payment.label;
      state.result = saved;
      state.pending = null;
      state.submitting = false;
      if (JR.emit) JR.emit("checkout:done", saved);
      render();
    } catch (e) {
      state.submitting = false;
      state.submitError = (e && e.message) || "Erro inesperado. Verifique sua internet e tente de novo.";
      render();
    }
  }

  // ---------------- eventos ----------------
  function onSubmit(e) {
    e.preventDefault();
    if (state.result || !cartItems().length) return;
    if (state.step === STEPS.length - 1) { submitOrder(); return; }
    const bad = validateStep(state.step);
    if (bad.length) {
      render(focusIdFor(bad[0]) || undefined, true);
      if (bad[0] === "pay") { const el = $('input[name="pay"]', root); if (el) el.focus(); }
      return;
    }
    if (state.step <= 1) saveCustomer();
    state.step++;
    render();
  }

  function onInput(e) {
    const el = e.target, key = el.dataset && el.dataset.k;
    if (!key) return;
    let v = el.value;
    if (key === "c.cpf") v = maskCPF(v);
    if (key === "c.phone") v = maskPhone(v);
    if (key === "p.changeFor") v = v.replace(/[^\d,.]/g, "");
    if (v !== el.value) {
      const atEnd = el.selectionStart === el.value.length;
      el.value = v;
      if (atEnd) { try { el.setSelectionRange(v.length, v.length); } catch (x) { /* tipo sem seleção */ } }
    }
    const [g, k] = key.split(".");
    state[g][k] = v;
    // tira o erro assim que o campo fica válido
    if (state.errors[key] && !validateField(key)) setFieldError(key, "");
    if (key === "c.cpf" && digits(v).length === 11) setFieldError(key, validateField(key));
  }
  function onBlur(e) {
    const key = e.target.dataset && e.target.dataset.k;
    if (!key || !e.target.value) return;
    setFieldError(key, validateField(key));
  }
  function setFieldError(key, msg) {
    if (msg) state.errors[key] = msg; else delete state.errors[key];
    const id = "ck-" + key.replace(".", "-");
    const input = document.getElementById(id), errEl = document.getElementById(id + "-err");
    if (!input || !errEl) return;
    errEl.textContent = msg || "";
    input.closest(".ck-field").classList.toggle("is-invalid", !!msg);
    if (msg) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
  }
  function onChange(e) {
    const el = e.target, ck = el.dataset && el.dataset.ck;
    if (ck === "f") { state.f = el.value; delete state.errors.geo; render(undefined, true); focusRadio("f", el.value); }
    else if (ck === "pay") { state.p.method = el.value; delete state.errors.pay; delete state.errors["p.changeFor"]; render(undefined, true); focusRadio("pay", el.value); }
    else if (ck === "card") { state.p.card = el.value; }
    else if (ck === "nochange") { state.p.noChange = el.checked; delete state.errors["p.changeFor"]; render(undefined, true); const cb = $('input[data-ck="nochange"]', root); if (cb) cb.focus(); }
  }
  function focusRadio(name, value) {
    const r = root.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (r) r.focus();
  }
  function onClick(e) {
    const btn = e.target.closest("[data-ck]");
    if (!btn || btn.tagName === "INPUT") return;
    const a = btn.dataset.ck;
    if (a === "close") { e.preventDefault(); close(); }
    else if (a === "back") { if (state.step > 0) { state.step--; state.submitError = ""; render(); } }
    else if (a === "goto") { const s = Number(btn.dataset.step); if (s < state.step) { state.step = s; state.submitError = ""; render(); } }
    else if (a === "geo") { requestGeo(); }
    else if (a === "chip") { state.p.changeFor = String(btn.dataset.v).replace(".", ","); delete state.errors["p.changeFor"]; render("ck-p-changeFor", true); }
    else if (a === "copypix") { copyPix(); }
  }
  async function copyPix() {
    const ta = document.getElementById("ck-pixcode");
    if (!ta) return;
    try { await navigator.clipboard.writeText(ta.value); toast("Código Pix copiado!"); }
    catch (e) {
      ta.focus(); ta.select();
      try { document.execCommand("copy"); toast("Código Pix copiado!"); } catch (x) { toast("Selecione o código e copie manualmente."); }
    }
  }
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Tab") return;
    const sheet = $(".ck-sheet", root);
    if (!sheet) return;
    const f = Array.from(sheet.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),textarea,select,[tabindex]:not([tabindex="-1"])')).filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !sheet.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // ---------------- API pública ----------------
  async function open() {
    ensureRoot();
    loadSaved();
    state.lastFocus = document.activeElement;
    state.isOpen = true;
    state.enter = true;
    if (state.result) { state.result = null; state.step = 0; }
    state.submitError = "";
    document.documentElement.classList.add("ck-lock");
    try { if (JR.cart && JR.cart.close) JR.cart.close(); } catch (e) { /* ok */ }
    render();
    try {
      const menu = JR.db && JR.db.getMenu ? await JR.db.getMenu() : null;
      state.store = (menu && menu.store) || (window.JR_SEED && window.JR_SEED.store) || {};
    } catch (e) {
      state.store = (window.JR_SEED && window.JR_SEED.store) || {};
    }
    if (state.isOpen) render();
  }
  function close() {
    if (!root) return;
    state.isOpen = false;
    root.classList.remove("is-open");
    root.innerHTML = "";
    document.documentElement.classList.remove("ck-lock");
    if (state.result) { state.result = null; state.step = 0; state.p.changeFor = ""; state.p.noChange = false; state.geo = { status: "idle", geocode: "idle" }; Object.assign(state.a, { lat: null, lng: null, accuracy: null, locationStatus: "", locationDenied: false }); }
    const lf = state.lastFocus;
    if (lf && document.contains(lf) && lf.focus) { try { lf.focus(); } catch (e) { /* ok */ } }
  }

  // linha do tempo ao vivo (funciona quando a loja atualiza o pedido no mesmo navegador/modo demo)
  if (JR.on) JR.on("orders:changed", async () => {
    if (!state.isOpen || !state.result || !JR.db || !JR.db.listOrders) return;
    try {
      const list = await JR.db.listOrders();
      const o = (list || []).find((x) => x.id === state.result.id);
      if (o && o.status !== state.result.status) { state.result.status = o.status; render(); }
    } catch (e) { /* cliente sem permissão de leitura no modo Supabase */ }
  });

  JR.checkout = { open, close, pixPayload, validCPF, isOpen: () => state.isOpen };
})();
