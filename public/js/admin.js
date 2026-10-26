// Painel do dono: login, pedidos, cardápio, financeiro e estoque. Renderiza em #owner-panel.
// Nada administrativo é carregado nem desenhado antes do login.
(function () {
  var JR = window.JR;
  var root = document.getElementById("owner-panel");
  if (!JR || !root) return;

  // ---------------------------------------------------------------- utilidades
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var money = JR.money;
  function num(v) {
    if (typeof v === "number") return v;
    var s = String(v == null ? "" : v).trim().replace(/\s|R\$/g, "");
    if (!s) return NaN;
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    return Number(s);
  }
  function fmtNum(n, d) {
    n = Number(n) || 0;
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: d == null ? 3 : d });
  }
  function fmtInput(n) { // valor para campo de texto (vírgula decimal)
    if (n === "" || n == null || isNaN(n)) return "";
    return String(Math.round(Number(n) * 1000) / 1000).replace(".", ",");
  }
  function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function pad(n) { return String(n).padStart(2, "0"); }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseYmd(s) { var p = String(s || "").split("-"); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function fmtDateTime(iso) {
    var d = new Date(iso); if (isNaN(d)) return "";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function ago(iso) {
    var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (isNaN(m)) return "";
    if (m < 1) return "agora";
    if (m < 60) return "há " + m + " min";
    if (m < 60 * 24) return "há " + Math.floor(m / 60) + " h";
    return "";
  }
  function getAt(obj, path) {
    if (!path) return obj;
    return path.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, obj);
  }
  function setAt(obj, path, val) {
    var ks = path.split("."); var last = ks.pop();
    var o = ks.length ? getAt(obj, ks.join(".")) : obj;
    if (o != null) o[last] = val;
  }
  function safeImg(url) {
    url = String(url || "");
    return /^(https?:\/\/|data:image\/|img\/|\.\/|\/)/i.test(url) ? url : "";
  }
  function maskCpf(cpf) {
    var d = String(cpf || "").replace(/\D/g, "");
    if (d.length !== 11) return d ? "•••" + d.slice(-2) : "";
    return "•••." + d.slice(3, 6) + "." + d.slice(6, 9) + "-••";
  }
  function onlyDigits(s) { return String(s || "").replace(/\D/g, ""); }
  function token(name) { return getComputedStyle(root).getPropertyValue(name).trim(); }

  var ICON = {
    lock: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
    up: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 15l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    alert: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/></svg>',
    pin: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  };

  // ---------------------------------------------------------------- estado
  var STATUS = {
    novo: "Novo", preparo: "Em preparo", saiu: "Saiu para entrega", entregue: "Entregue", cancelado: "Cancelado",
  };
  var NEXT = { novo: "preparo", preparo: "saiu", saiu: "entregue" };
  var PAY = { pix: "Pix", cartao: "Cartão", dinheiro: "Dinheiro" };
  var EXP_CATS = { insumos: "Insumos", aluguel: "Aluguel", gas: "Gás", funcionarios: "Funcionários", embalagem: "Embalagem", outros: "Outros" };
  var TABS = [
    { id: "pedidos", label: "Pedidos" },
    { id: "cardapio", label: "Cardápio" },
    { id: "financeiro", label: "Financeiro" },
    { id: "estoque", label: "Estoque" },
  ];

  var S = {
    session: null, loginOpen: false, loginError: "", busy: false,
    tab: "pedidos",
    orders: [], ordersSig: "", ordersAt: null, orderFilter: "abertos", orderSearch: "", orderLimit: 30,
    menu: null, draft: null, dirty: false, openProducts: {}, menuMsg: "",
    stock: [], stockEdit: null,
    expenses: [],
    period: "7",
    ask: null,
    hideExamples: false,
    pollTimer: null, charts: [],
    clip: null,
  };
  try { S.tab = localStorage.getItem("jr_adm_tab") || "pedidos"; } catch (e) { }
  try { S.hideExamples = localStorage.getItem("jr_adm_hide_examples") === "1"; } catch (e) { }

  root.innerHTML = '<div class="adm-wrap"></div><div class="adm-toast" role="status" aria-live="polite"></div>';
  var wrap = root.querySelector(".adm-wrap");
  var toastEl = root.querySelector(".adm-toast");
  var toastTimer = null;
  function toast(msg, kind) {
    toastEl.textContent = msg;
    toastEl.className = "adm-toast is-on" + (kind ? " is-" + kind : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = "adm-toast"; }, 3600);
  }

  function visibleOrders() {
    return S.hideExamples ? S.orders.filter(function (o) { return !o.example; }) : S.orders;
  }
  function hasExamples() {
    return visibleOrders().some(function (o) { return o.example; }) ||
      S.expenses.some(function (e) { return e.example; }) || S.stock.some(function (s) { return s.example; });
  }
  function lowStock() { return S.stock.filter(function (s) { return (Number(s.qty) || 0) <= (Number(s.min) || 0); }); }

  // ---------------------------------------------------------------- render raiz
  function render() {
    destroyCharts();
    if (!S.session) { wrap.innerHTML = renderLogin(); return; }
    wrap.innerHTML = renderPanel();
    afterRender();
  }

  function renderLogin() {
    var demo = JR.mode === "demo" && JR.demoUser;
    return '' +
      '<div class="adm-strip">' +
      '<button type="button" class="adm-strip-btn" data-act="login-toggle" aria-expanded="' + (S.loginOpen ? "true" : "false") + '" aria-controls="adm-login">' +
      ICON.lock + '<span>Área do dono</span></button>' +
      '<form id="adm-login" class="adm-login"' + (S.loginOpen ? "" : " hidden") + ' novalidate>' +
      '<p class="adm-login-lead">Acesso restrito a quem tem o e-mail e a senha da conta da pizzaria.</p>' +
      '<div class="adm-login-fields">' +
      '<label class="adm-field"><span>E-mail</span><input type="email" name="email" autocomplete="username" required inputmode="email"></label>' +
      '<label class="adm-field"><span>Senha</span><input type="password" name="password" autocomplete="current-password" required></label>' +
      '<button type="submit" class="adm-btn adm-btn-primary"' + (S.busy ? " disabled" : "") + '>' + (S.busy ? "Entrando…" : "Entrar") + '</button>' +
      '</div>' +
      '<p class="adm-error" role="alert">' + esc(S.loginError) + '</p>' +
      (demo ? '<p class="adm-demo-note"><strong>Modo demonstração</strong> — acesso de teste: <span class="adm-mono">' + esc(JR.demoUser.email) + '</span> / <span class="adm-mono">' + esc(JR.demoUser.password) + '</span>. O login de verdade é ativado quando o Supabase for configurado; aí só a conta do dono entra.</p>' : '') +
      '</form></div>';
  }

  function renderPanel() {
    var novos = visibleOrders().filter(function (o) { return o.status === "novo"; }).length;
    var low = lowStock().length;
    var badges = { pedidos: novos, estoque: low, cardapio: S.dirty ? "•" : 0 };
    var tabs = TABS.map(function (t) {
      var sel = S.tab === t.id;
      var b = badges[t.id];
      return '<button type="button" role="tab" id="adm-tab-' + t.id + '" class="adm-tab" aria-selected="' + sel + '" aria-controls="adm-pane-' + t.id + '" tabindex="' + (sel ? "0" : "-1") + '" data-tab="' + t.id + '">' +
        esc(t.label) + (b ? ' <span class="adm-tab-badge' + (t.id === "estoque" ? " is-warn" : "") + '" aria-label="' + (t.id === "pedidos" ? b + " novos" : t.id === "estoque" ? b + " em alerta" : "alterações não salvas") + '">' + esc(b) + '</span>' : "") + '</button>';
    }).join("");
    var body = S.tab === "pedidos" ? renderOrders() : S.tab === "cardapio" ? renderMenu() : S.tab === "financeiro" ? renderFinance() : renderStock();
    return '' +
      '<div class="adm-panel">' +
      '<header class="adm-head">' +
      '<div><h2 class="adm-title">Painel do dono</h2><p class="adm-sub">Conectado como <span class="adm-mono">' + esc(S.session.email) + '</span>' + (JR.mode === "demo" ? ' · modo demonstração' : '') + '</p></div>' +
      '<button type="button" class="adm-btn" data-act="logout">Sair</button>' +
      '</header>' +
      renderExampleBanner() +
      '<div class="adm-tabs" role="tablist" aria-label="Seções do painel">' + tabs + '</div>' +
      '<div class="adm-pane" role="tabpanel" id="adm-pane-' + S.tab + '" aria-labelledby="adm-tab-' + S.tab + '" tabindex="0">' + body + '</div>' +
      '</div>';
  }

  function renderExampleBanner() {
    if (!hasExamples()) return "";
    var asking = S.ask === "clear-examples";
    return '<div class="adm-example" role="note">' +
      '<p><strong>Dados de exemplo.</strong> Pedidos, despesas e estoque fictícios para você testar o painel. Os números do financeiro não são reais.</p>' +
      (asking ?
        '<div class="adm-confirm"><span>Apagar os pedidos e as despesas de exemplo?</span>' +
        '<label class="adm-check"><input type="checkbox" id="adm-clear-stock"> também apagar os insumos de exemplo</label>' +
        '<button type="button" class="adm-btn adm-btn-danger" data-act="clear-examples">Sim, limpar</button>' +
        '<button type="button" class="adm-btn" data-act="ask-none">Voltar</button></div>'
        : '<button type="button" class="adm-btn adm-btn-sm" data-act="ask" data-ask="clear-examples">Limpar exemplos</button>') +
      '</div>';
  }

  // ---------------------------------------------------------------- PEDIDOS
  var FILTERS = [
    { id: "abertos", label: "Em aberto", test: function (o) { return o.status === "novo" || o.status === "preparo" || o.status === "saiu"; } },
    { id: "novo", label: "Novos", test: function (o) { return o.status === "novo"; } },
    { id: "preparo", label: "Em preparo", test: function (o) { return o.status === "preparo"; } },
    { id: "saiu", label: "Saiu", test: function (o) { return o.status === "saiu"; } },
    { id: "entregue", label: "Entregues", test: function (o) { return o.status === "entregue"; } },
    { id: "cancelado", label: "Cancelados", test: function (o) { return o.status === "cancelado"; } },
    { id: "todos", label: "Todos", test: function () { return true; } },
  ];

  function renderOrders() {
    var all = visibleOrders();
    var f = FILTERS.filter(function (x) { return x.id === S.orderFilter; })[0] || FILTERS[0];
    var q = S.orderSearch.trim().toLowerCase();
    var list = all.filter(f.test).filter(function (o) {
      if (!q) return true;
      var c = o.customer || {};
      return [o.code, c.name, c.phone].join(" ").toLowerCase().indexOf(q) >= 0;
    });
    var chips = FILTERS.map(function (x) {
      var n = all.filter(x.test).length;
      return '<button type="button" class="adm-chip" aria-pressed="' + (x.id === f.id) + '" data-act="order-filter" data-f="' + x.id + '">' + esc(x.label) + ' <span class="adm-mono">' + n + '</span></button>';
    }).join("");
    var shown = list.slice(0, S.orderLimit);
    var at = S.ordersAt ? pad(S.ordersAt.getHours()) + ":" + pad(S.ordersAt.getMinutes()) + ":" + pad(S.ordersAt.getSeconds()) : "—";
    return '' +
      '<div class="adm-toolbar">' +
      '<div class="adm-chips" role="group" aria-label="Filtrar por status">' + chips + '</div>' +
      '<div class="adm-toolbar-row">' +
      '<label class="adm-field adm-field-inline"><span class="adm-sr">Buscar pedido</span><input type="search" placeholder="Buscar por nome, código ou telefone" data-act="order-search" value="' + esc(S.orderSearch) + '"></label>' +
      '<button type="button" class="adm-btn" data-act="orders-refresh">' + ICON.refresh + ' Atualizar</button>' +
      '<span class="adm-muted adm-small">Atualizado às <span class="adm-mono">' + at + '</span> · a cada 20 s</span>' +
      '</div></div>' +
      (shown.length ? '<div class="adm-orders">' + shown.map(renderOrderCard).join("") + '</div>' :
        '<p class="adm-empty">' + (f.id === "abertos" ? "Nenhum pedido em aberto agora. Os pedidos novos aparecem aqui sozinhos." : "Nenhum pedido neste filtro.") + '</p>') +
      (list.length > shown.length ? '<button type="button" class="adm-btn adm-more" data-act="orders-more">Mostrar mais (' + (list.length - shown.length) + ')</button>' : '');
  }

  function renderOrderCard(o) {
    var c = o.customer || {}, a = c.address || null, t = o.totals || {}, p = o.payment || {}, inv = o.invoice || null;
    var retirada = o.fulfillment === "retirada" || (!a && o.fulfillment !== "entrega");
    var phone = onlyDigits(c.phone);
    var wa = phone ? "https://wa.me/" + (phone.length <= 11 ? "55" + phone : phone) : "";
    var addr = "";
    if (a && !retirada) {
      addr = '<div class="adm-o-addr">' + esc([a.street, a.number].filter(Boolean).join(", ")) +
        (a.complement ? " — " + esc(a.complement) : "") + '<br>' + esc([a.district, a.city].filter(Boolean).join(" · ")) +
        (a.reference ? '<br><span class="adm-muted">Ref.: ' + esc(a.reference) + '</span>' : "") +
        (a.lat != null && a.lng != null && !isNaN(Number(a.lat)) ? '<br><a class="adm-link" target="_blank" rel="noopener" href="https://www.google.com/maps?q=' + encodeURIComponent(Number(a.lat) + "," + Number(a.lng)) + '">' + ICON.pin + ' Abrir no mapa' + (a.accuracy ? ' <span class="adm-muted">(±' + Math.round(a.accuracy) + ' m)</span>' : '') + '</a>' : "") +
        '</div>';
    }
    var items = (o.items || []).map(function (it) {
      var ch = (it.choices || []).map(function (g) {
        var names = (g.options || []).map(function (x) { return esc(x.name); }).join(" + ");
        return names ? '<div class="adm-o-choice">' + (g.kind === "flavor" ? "" : esc(g.groupName || "Adicionais") + ": ") + names + '</div>' : "";
      }).join("");
      var rem = (it.removed || []).length ? '<div class="adm-o-removed">Sem: ' + it.removed.map(esc).join(", ") + '</div>' : "";
      var note = it.note ? '<div class="adm-o-note">Obs.: ' + esc(it.note) + '</div>' : "";
      return '<li><span class="adm-o-qty adm-mono">' + esc(it.qty || 1) + '×</span><div class="adm-o-item"><strong>' + esc(it.name) + '</strong>' + ch + rem + note + '</div><span class="adm-mono">' + money(it.total) + '</span></li>';
    }).join("");
    var next = NEXT[o.status];
    var nextLabel = next === "preparo" ? "Começar preparo" : next === "saiu" ? (retirada ? "Pronto para retirada" : "Saiu para entrega") : next === "entregue" ? (retirada ? "Retirado" : "Marcar entregue") : "";
    var askKey = "cancel:" + o.id;
    var actions = "";
    if (next || o.status !== "cancelado" && o.status !== "entregue") {
      actions = S.ask === askKey ?
        '<div class="adm-confirm"><span>Cancelar este pedido?</span><button type="button" class="adm-btn adm-btn-danger" data-act="order-status" data-id="' + esc(o.id) + '" data-st="cancelado">Sim, cancelar</button><button type="button" class="adm-btn" data-act="ask-none">Voltar</button></div>' :
        '<div class="adm-o-actions">' + (next ? '<button type="button" class="adm-btn adm-btn-primary" data-act="order-status" data-id="' + esc(o.id) + '" data-st="' + next + '">' + esc(nextLabel) + '</button>' : '') +
        '<button type="button" class="adm-btn adm-btn-ghost" data-act="ask" data-ask="' + esc(askKey) + '">Cancelar pedido</button></div>';
    }
    var stockApplied = o.stock_applied || (t && t.stock_applied);
    var invTxt = inv ? ({ simulada: "Simulada (teste)", autorizada: "Autorizada", pendente: "Pendente", erro: "Erro" }[inv.status] || esc(inv.status)) + (inv.number ? ' · nº <span class="adm-mono">' + esc(inv.number) + '</span>' + (inv.series ? "/" + esc(inv.series) : "") : "") +
      (inv.url && /^https?:/i.test(inv.url) ? ' · <a class="adm-link" target="_blank" rel="noopener" href="' + esc(inv.url) + '">ver</a>' : "") +
      (inv.status === "erro" && inv.message ? '<br><span class="adm-err-txt">' + esc(inv.message) + '</span>' : "") : "Não emitida";
    return '' +
      '<article class="adm-order adm-st-' + esc(o.status) + '" aria-label="Pedido ' + esc(o.code) + '">' +
      '<header class="adm-o-head">' +
      '<div><span class="adm-o-code adm-mono">#' + esc(o.code) + '</span> <span class="adm-muted adm-small">' + fmtDateTime(o.created_at) + (ago(o.created_at) ? " · " + ago(o.created_at) : "") + '</span></div>' +
      '<div class="adm-o-tags"><span class="adm-pill adm-pill-' + esc(o.status) + '">' + esc(STATUS[o.status] || o.status) + '</span><span class="adm-pill">' + (retirada ? "Retirada" : "Entrega") + '</span>' + (o.example ? '<span class="adm-pill adm-pill-ex">exemplo</span>' : '') + '</div>' +
      '</header>' +
      '<div class="adm-o-grid">' +
      '<section class="adm-o-cust"><h4>Cliente</h4><div><strong>' + esc(c.name || "Sem nome") + '</strong></div>' +
      (c.cpf ? '<div class="adm-small">CPF <span class="adm-mono">' + esc(maskCpf(c.cpf)) + '</span></div>' : '') +
      (phone ? '<div class="adm-small"><a class="adm-link" href="tel:' + esc(phone) + '">' + esc(c.phone) + '</a> · <a class="adm-link" target="_blank" rel="noopener" href="' + esc(wa) + '">WhatsApp</a></div>' : '') +
      addr + '</section>' +
      '<section class="adm-o-items"><h4>Itens</h4><ul>' + items + '</ul>' +
      '<dl class="adm-o-tot">' +
      '<div><dt>Subtotal</dt><dd class="adm-mono">' + money(t.subtotal) + '</dd></div>' +
      (Number(t.deliveryFee) ? '<div><dt>Entrega</dt><dd class="adm-mono">' + money(t.deliveryFee) + '</dd></div>' : '') +
      (Number(t.discount) ? '<div><dt>Desconto</dt><dd class="adm-mono">−' + money(t.discount) + '</dd></div>' : '') +
      '<div class="adm-o-total"><dt>Total</dt><dd class="adm-mono">' + money(t.total) + '</dd></div></dl></section>' +
      '<section class="adm-o-pay"><h4>Pagamento</h4><div>' + esc(PAY[p.method] || p.method || "—") + (p.status ? ' <span class="adm-muted adm-small">(' + esc(p.status) + ')</span>' : '') + '</div>' +
      (p.method === "dinheiro" && p.changeFor ? '<div class="adm-small">Troco para <span class="adm-mono">' + money(p.changeFor) + '</span> → devolver <span class="adm-mono">' + money(Number(p.changeFor) - Number(t.total || 0)) + '</span></div>' : '') +
      '<h4>Nota fiscal</h4><div class="adm-small">' + invTxt + '</div>' +
      (o.status === "entregue" ? '<div class="adm-small adm-muted">' + (stockApplied ? "Estoque já baixado" : "Estoque não baixado") + '</div>' : '') +
      '</section></div>' + actions + '</article>';
  }

  // consumo de insumos de um pedido -> { stockId: quantidade }
  function orderConsumption(order, stock) {
    var out = {};
    (order.items || []).forEach(function (it) {
      var q = Number(it.qty) || 1;
      var chosen = [];
      (it.choices || []).forEach(function (c) {
        var opts = c.options || [];
        var share = c.kind === "flavor" && opts.length ? 1 / opts.length : 1;
        opts.forEach(function (o) { chosen.push({ id: o.id, share: share }); });
      });
      stock.forEach(function (s) {
        (s.uses || []).forEach(function (u) {
          var uq = Number(u.qty) || 0; if (!uq) return;
          if (u.optionId) {
            if (u.productId && u.productId !== it.productId) return;
            chosen.forEach(function (c) { if (c.id === u.optionId) out[s.id] = (out[s.id] || 0) + uq * q * c.share; });
          } else if (u.productId && u.productId === it.productId) {
            out[s.id] = (out[s.id] || 0) + uq * q;
          }
        });
      });
    });
    return out;
  }
  function consumptionCost(cons, stock) {
    var total = 0;
    stock.forEach(function (s) { if (cons[s.id]) total += cons[s.id] * (Number(s.cost) || 0); });
    return total;
  }

  async function setOrderStatus(id, st) {
    var o = S.orders.filter(function (x) { return x.id === id; })[0];
    if (!o) return;
    var already = o.stock_applied || (o.totals && o.totals.stock_applied);
    var applyStock = st === "entregue" && !already;
    try {
      if (applyStock) {
        try { await JR.db.updateOrder(id, { status: st, stock_applied: true }); }
        catch (e) { // banco sem a coluna stock_applied: guarda a marca dentro de totals
          await JR.db.updateOrder(id, { status: st, totals: Object.assign({}, o.totals, { stock_applied: true }) });
        }
        var stock = await JR.db.getStock();
        var cons = orderConsumption(o, stock);
        var touched = 0;
        stock.forEach(function (s) { if (cons[s.id]) { s.qty = Math.round(((Number(s.qty) || 0) - cons[s.id]) * 1000) / 1000; touched++; } });
        if (touched) { await JR.db.saveStock(stock); S.stock = stock; }
        toast("Pedido entregue." + (touched ? " Estoque baixado em " + touched + " insumo(s)." : ""), "ok");
      } else {
        await JR.db.updateOrder(id, { status: st });
        toast("Pedido #" + o.code + ": " + STATUS[st] + ".", "ok");
      }
      S.ask = null;
      await refreshOrders(true);
    } catch (e) {
      toast("Não foi possível atualizar o pedido: " + e.message, "err");
    }
  }

  async function refreshOrders(force) {
    if (!S.session) return;
    try {
      var list = await JR.db.listOrders();
      if (!S.session) return;
      list = Array.isArray(list) ? list : [];
      var sig = list.map(function (o) { return o.id + ":" + o.status + ":" + (o.invoice && o.invoice.status) + ":" + (o.stock_applied ? 1 : 0); }).join("|");
      S.ordersAt = new Date();
      var changed = sig !== S.ordersSig;
      S.orders = list; S.ordersSig = sig;
      if (changed || force) {
        if (S.tab === "pedidos" || S.tab === "financeiro") rerenderKeepFocus();
        else updateTabBadges();
      } else if (S.tab === "pedidos") {
        var span = wrap.querySelector(".adm-toolbar-row .adm-mono"); if (span) span.textContent = pad(S.ordersAt.getHours()) + ":" + pad(S.ordersAt.getMinutes()) + ":" + pad(S.ordersAt.getSeconds());
      }
    } catch (e) {
      toast("Não foi possível carregar os pedidos: " + e.message, "err");
    }
  }
  function updateTabBadges() {
    // re-render leve do cabeçalho de abas sem perder edição em andamento
    var tl = wrap.querySelector(".adm-tabs"); if (!tl) return;
    var tmp = document.createElement("div"); tmp.innerHTML = renderPanel();
    var nt = tmp.querySelector(".adm-tabs"); if (nt) tl.innerHTML = nt.innerHTML;
  }
  function rerenderKeepFocus() {
    var a = document.activeElement, key = a && root.contains(a) ? a.getAttribute("data-act") || a.getAttribute("data-path") : null;
    var y = window.scrollY;
    render();
    if (key) { var el = wrap.querySelector('[data-act="' + key + '"]') || wrap.querySelector('[data-path="' + key + '"]'); if (el) { el.focus({ preventScroll: true }); } }
    window.scrollTo(0, y);
  }

  // ---------------------------------------------------------------- CARDÁPIO
  function F(label, path, val, opts) {
    opts = opts || {};
    var type = opts.type || "text";
    var id = "f_" + path.replace(/\W/g, "_");
    var inputType = type === "num" || type === "int" ? "text" : type === "textarea" ? "" : type;
    var mode = type === "num" ? ' inputmode="decimal"' : type === "int" ? ' inputmode="numeric"' : "";
    var v = type === "num" || type === "int" ? fmtInput(val) : (val == null ? "" : val);
    var ctrl = type === "textarea" ?
      '<textarea id="' + id + '" rows="2" data-path="' + path + '" data-type="text">' + esc(v) + '</textarea>' :
      '<input id="' + id + '" type="' + inputType + '"' + mode + ' data-path="' + path + '" data-type="' + type + '" value="' + esc(v) + '"' + (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') + (opts.cls ? ' class="' + opts.cls + '"' : '') + '>';
    return '<div class="adm-field' + (opts.wide ? " adm-wide" : "") + (opts.small ? " adm-narrow" : "") + '"><label for="' + id + '">' + esc(label) + (opts.prefix ? ' <span class="adm-muted">(' + opts.prefix + ')</span>' : '') + '</label>' + ctrl + '</div>';
  }
  function CK(label, path, val) {
    return '<label class="adm-check"><input type="checkbox" data-path="' + path + '" data-type="bool"' + (val ? " checked" : "") + '> ' + esc(label) + '</label>';
  }

  function renderMenu() {
    var m = S.draft;
    if (!m) return '<p class="adm-empty">Carregando cardápio…</p>';
    var st = m.store || (m.store = {});
    var cats = m.categories || (m.categories = []);
    var prods = m.products || (m.products = []);
    var saveBar = '<div class="adm-savebar' + (S.dirty ? " is-dirty" : "") + '" role="region" aria-label="Salvar cardápio">' +
      '<span>' + (S.dirty ? "Você tem alterações não salvas." : "Tudo salvo. O site mostra este cardápio.") + '</span>' +
      '<div><button type="button" class="adm-btn" data-act="menu-discard"' + (S.dirty ? "" : " disabled") + '>Descartar</button> ' +
      '<button type="button" class="adm-btn adm-btn-primary" data-act="menu-save"' + (S.dirty ? "" : " disabled") + '>Salvar cardápio</button></div></div>';

    var storeSec = '<details class="adm-sec"><summary><h3>Dados da loja</h3><span class="adm-muted adm-small">' + (st.open === false ? "Fechada" : "Aberta") + ' · entrega ' + money(st.deliveryFee) + '</span></summary><div class="adm-sec-body">' +
      '<div class="adm-switchrow">' + CK("Loja aberta (recebendo pedidos)", "store.open", st.open !== false) + '</div>' +
      '<div class="adm-form-grid">' +
      F("Nome da pizzaria", "store.name", st.name, { wide: true }) +
      F("Frase de destaque", "store.slogan", st.slogan, { wide: true }) +
      F("Taxa de entrega", "store.deliveryFee", st.deliveryFee, { type: "num", prefix: "R$" }) +
      F("Pedido mínimo", "store.minOrder", st.minOrder, { type: "num", prefix: "R$" }) +
      F("Tempo de entrega", "store.etaMin", st.etaMin, { placeholder: "40–60 min" }) +
      F("Horário de funcionamento (texto)", "store.hours", st.hours, { placeholder: "Ter a Dom, 18h às 23h30", wide: true }) +
      F("Abre às", "store.openTime", st.openTime, { type: "time" }) +
      F("Fecha às", "store.closeTime", st.closeTime, { type: "time" }) +
      F("Telefone", "store.phone", st.phone, { type: "tel" }) +
      F("WhatsApp", "store.whatsapp", st.whatsapp, { type: "tel", placeholder: "(11) 99999-9999" }) +
      F("Endereço", "store.address", st.address, { wide: true }) +
      F("Cidade", "store.city", st.city) +
      '</div></div></details>';

    var catRows = cats.map(function (c, i) {
      var n = prods.filter(function (p) { return p.categoryId === c.id; }).length;
      var ask = "cat-del:" + c.id;
      return '<li class="adm-cat-row">' +
        '<input aria-label="Nome da categoria" data-path="categories.' + i + '.name" data-type="text" data-rerender-change value="' + esc(c.name) + '">' +
        '<span class="adm-muted adm-small adm-nowrap">' + n + ' produto' + (n === 1 ? "" : "s") + '</span>' +
        '<button type="button" class="adm-icon-btn" data-act="cat-move" data-i="' + i + '" data-d="-1" aria-label="Subir ' + esc(c.name) + '"' + (i === 0 ? " disabled" : "") + '>' + ICON.up + '</button>' +
        '<button type="button" class="adm-icon-btn" data-act="cat-move" data-i="' + i + '" data-d="1" aria-label="Descer ' + esc(c.name) + '"' + (i === cats.length - 1 ? " disabled" : "") + '>' + ICON.down + '</button>' +
        (S.ask === ask ?
          (n ? '<span class="adm-confirm-inline"><span class="adm-small">Mova ou exclua os ' + n + ' produtos antes.</span><button type="button" class="adm-btn adm-btn-sm" data-act="ask-none">Ok</button></span>' :
            '<span class="adm-confirm-inline"><button type="button" class="adm-btn adm-btn-sm adm-btn-danger" data-act="cat-del" data-i="' + i + '">Remover</button><button type="button" class="adm-btn adm-btn-sm" data-act="ask-none">Voltar</button></span>') :
          '<button type="button" class="adm-btn adm-btn-sm adm-btn-ghost" data-act="ask" data-ask="' + esc(ask) + '">Remover</button>') +
        '</li>';
    }).join("");
    var catSec = '<details class="adm-sec"><summary><h3>Categorias</h3><span class="adm-muted adm-small">' + cats.length + ' categorias</span></summary><div class="adm-sec-body">' +
      '<ul class="adm-cat-list">' + catRows + '</ul>' +
      '<form class="adm-inline-form" data-form="cat-add"><label class="adm-field"><span>Nova categoria</span><input name="name" placeholder="Ex.: Lanches" required></label><button type="submit" class="adm-btn">Adicionar categoria</button></form>' +
      '</div></details>';

    var catOpts = function (sel) { return cats.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === sel ? " selected" : "") + '>' + esc(c.name) + '</option>'; }).join(""); };
    var addProd = '<form class="adm-inline-form adm-addprod" data-form="prod-add">' +
      '<label class="adm-field"><span>Nome do novo produto</span><input name="name" placeholder="Ex.: X-Burger" required></label>' +
      '<label class="adm-field"><span>Categoria</span><select name="cat">' + catOpts(cats[0] && cats[0].id) + '</select></label>' +
      '<label class="adm-field adm-narrow"><span>Preço (R$)</span><input name="price" inputmode="decimal" placeholder="0,00" required></label>' +
      '<button type="submit" class="adm-btn adm-btn-primary">Adicionar produto</button></form>';

    var orphan = prods.filter(function (p) { return !cats.some(function (c) { return c.id === p.categoryId; }); });
    var byCat = cats.map(function (c) {
      var list = prods.map(function (p, i) { return { p: p, i: i }; }).filter(function (x) { return x.p.categoryId === c.id; });
      return '<div class="adm-prod-cat"><h4>' + esc(c.name) + '</h4>' + (list.length ? list.map(function (x) { return renderProduct(x.p, x.i, catOpts); }).join("") : '<p class="adm-muted adm-small">Sem produtos.</p>') + '</div>';
    }).join("") + (orphan.length ? '<div class="adm-prod-cat"><h4>Sem categoria</h4>' + orphan.map(function (p) { return renderProduct(p, prods.indexOf(p), catOpts); }).join("") + '</div>' : "");
    var prodSec = '<details class="adm-sec"><summary><h3>Produtos</h3><span class="adm-muted adm-small">' + prods.length + ' produtos</span></summary><div class="adm-sec-body">' + addProd + byCat + '</div></details>';

    var bulkSec = '<details class="adm-sec"><summary><h3>Ajuste rápido de preços</h3><span class="adm-muted adm-small">em massa, por categoria</span></summary><div class="adm-sec-body">' +
      '<form class="adm-inline-form adm-bulk" data-form="bulk">' +
      '<label class="adm-field"><span>Categoria</span><select name="cat"><option value="">Todas</option>' + catOpts("") + '</select></label>' +
      '<label class="adm-field"><span>O que ajustar</span><select name="target"><option value="options">Sabores e opções</option><option value="base">Preço base dos produtos</option><option value="both">Os dois</option></select></label>' +
      '<label class="adm-field adm-narrow"><span>Tipo</span><select name="mode"><option value="abs">R$</option><option value="pct">%</option></select></label>' +
      '<label class="adm-field adm-narrow"><span>Valor</span><input name="value" inputmode="decimal" placeholder="2 ou -1,50" required></label>' +
      '<label class="adm-check"><input type="checkbox" name="r99"> terminar em ,99</label>' +
      '<button type="submit" class="adm-btn">Aplicar</button></form>' +
      '<p class="adm-small adm-muted">Ex.: “+2” em R$ soma R$ 2,00; “5” em % aumenta 5%. Use número negativo para baixar. Preços zerados (grátis) não mudam. Depois confira e clique em <strong>Salvar cardápio</strong>.</p>' +
      (S.menuMsg ? '<p class="adm-ok-txt" role="status">' + esc(S.menuMsg) + '</p>' : '') +
      '</div></details>';

    var resetSec = '<details class="adm-sec"><summary><h3>Restaurar cardápio original</h3></summary><div class="adm-sec-body">' +
      '<p class="adm-small">Volta o cardápio para a versão original do site (preços, sabores, produtos e dados da loja). Pedidos, estoque e despesas não mudam.</p>' +
      (S.ask === "menu-reset" ?
        '<div class="adm-confirm"><span>Tem certeza? Tudo o que você mudou no cardápio será perdido.</span><button type="button" class="adm-btn adm-btn-danger" data-act="menu-reset">Sim, restaurar</button><button type="button" class="adm-btn" data-act="ask-none">Voltar</button></div>' :
        '<button type="button" class="adm-btn adm-btn-ghost" data-act="ask" data-ask="menu-reset">Restaurar cardápio original…</button>') +
      '</div></details>';

    return saveBar + storeSec + renderFlavors() + prodSec + catSec + bulkSec + resetSec;
  }

  function renderProduct(p, i, catOpts) {
    var base = "products." + i;
    var open = S.openProducts[p.id];
    var img = safeImg(p.image);
    var ask = "prod-del:" + p.id;
    var hasFlavor = (p.groups || []).some(function (g) { return g.kind === "flavor"; });
    var groups = (p.groups || []).map(function (g, gi) { return renderGroup(p, i, g, gi); }).join("");
    return '<details class="adm-prod' + (p.active === false ? " is-off" : "") + '" data-pid="' + esc(p.id) + '"' + (open ? " open" : "") + '>' +
      '<summary><span class="adm-prod-thumb">' + (img ? '<img src="' + esc(img) + '" alt="">' : '') + '</span>' +
      '<span class="adm-prod-name">' + esc(p.name || "Sem nome") + '</span>' +
      '<span class="adm-prod-meta">' + (p.active === false ? '<span class="adm-pill">desativado</span>' : '') + (p.featured ? '<span class="adm-pill adm-pill-hl">destaque</span>' : '') +
      '<span class="adm-mono">' + money(p.price) + '</span></span></summary>' +
      '<div class="adm-prod-body">' +
      '<div class="adm-form-grid">' +
      F("Nome", base + ".name", p.name, { wide: true }) +
      F("Descrição", base + ".description", p.description, { type: "textarea", wide: true }) +
      F("Preço", base + ".price", p.price, { type: "num", prefix: p.pricing === "max" ? "“a partir de”, R$" : "R$" }) +
      '<div class="adm-field"><label for="cat_' + i + '">Categoria</label><select id="cat_' + i + '" data-path="' + base + '.categoryId" data-type="text" data-rerender-change>' + catOpts(p.categoryId) + '</select></div>' +
      F("Selo", base + ".badge", p.badge, { placeholder: "Ex.: Mais pedido" }) +
      '<div class="adm-field"><label for="pr_' + i + '">Como cobra</label><select id="pr_' + i + '" data-path="' + base + '.pricing" data-type="text"><option value="max"' + (p.pricing === "max" ? " selected" : "") + '>Preço do sabor mais caro + adicionais</option><option value="sum"' + (p.pricing !== "max" ? " selected" : "") + '>Preço do produto + opções</option></select></div>' +
      '</div>' +
      '<div class="adm-row">' + CK("Ativo (aparece no cardápio)", base + ".active", p.active !== false) + CK("Destaque", base + ".featured", !!p.featured) + '</div>' +
      '<div class="adm-photo">' + (img ? '<img src="' + esc(img) + '" alt="Foto de ' + esc(p.name) + '">' : '<div class="adm-photo-empty">Sem foto</div>') +
      '<div><label class="adm-btn adm-btn-sm adm-file">' + (img ? "Trocar foto" : "Enviar foto") + '<input type="file" accept="image/*" data-act="prod-photo" data-i="' + i + '"></label>' +
      (img ? ' <button type="button" class="adm-btn adm-btn-sm adm-btn-ghost" data-act="prod-photo-del" data-i="' + i + '">Remover foto</button>' : '') + '</div></div>' +
      '<div class="adm-groups">' + groups +
      '<div class="adm-row">' +
      '<button type="button" class="adm-btn adm-btn-sm" data-act="group-add" data-i="' + i + '" data-kind="flavor">+ Grupo de sabores</button>' +
      '<button type="button" class="adm-btn adm-btn-sm" data-act="group-add" data-i="' + i + '" data-kind="extra">+ Grupo de adicionais</button>' +
      (!hasFlavor ? '<button type="button" class="adm-btn adm-btn-sm" data-act="prod-ingredients" data-i="' + i + '">+ Lista de ingredientes (cliente pode retirar)</button>' : '') +
      '</div></div>' +
      '<div class="adm-prod-foot">' +
      '<button type="button" class="adm-btn adm-btn-sm" data-act="prod-dup" data-i="' + i + '">Duplicar</button>' +
      (S.ask === ask ? '<span class="adm-confirm-inline"><span class="adm-small">Excluir “' + esc(p.name) + '”?</span><button type="button" class="adm-btn adm-btn-sm adm-btn-danger" data-act="prod-del" data-i="' + i + '">Sim, excluir</button><button type="button" class="adm-btn adm-btn-sm" data-act="ask-none">Voltar</button></span>' :
        '<button type="button" class="adm-btn adm-btn-sm adm-btn-ghost" data-act="ask" data-ask="' + esc(ask) + '">Excluir produto</button>') +
      '</div></div></details>';
  }

  function renderGroup(p, i, g, gi) {
    var base = "products." + i + ".groups." + gi;
    var isFlavor = g.kind === "flavor";
    var opts = (g.options || []).map(function (o, oi) {
      var ob = base + ".options." + oi;
      var chips = (o.ingredients || []).map(function (ing, ii) {
        return '<span class="adm-ing">' + esc(ing) + '<button type="button" data-act="ing-del" data-path="' + ob + '.ingredients" data-ii="' + ii + '" aria-label="Retirar ' + esc(ing) + ' de ' + esc(o.name) + '">' + ICON.x + '</button></span>';
      }).join("");
      return '<div class="adm-opt' + (o.active === false ? " is-off" : "") + '">' +
        '<div class="adm-opt-top">' +
        '<input class="adm-opt-name" aria-label="Nome" data-path="' + ob + '.name" data-type="text" value="' + esc(o.name) + '">' +
        '<label class="adm-opt-price"><span class="adm-muted">R$</span><input aria-label="Preço de ' + esc(o.name) + '" inputmode="decimal" data-path="' + ob + '.price" data-type="num" value="' + esc(fmtInput(o.price)) + '"></label>' +
        CK("Ativo", ob + ".active", o.active !== false) +
        '<button type="button" class="adm-icon-btn" data-act="opt-del" data-path="' + base + '.options" data-oi="' + oi + '" aria-label="Remover ' + esc(o.name) + '">' + ICON.x + '</button>' +
        '</div>' +
        '<input class="adm-opt-desc" aria-label="Descrição de ' + esc(o.name) + '" placeholder="Descrição (opcional)" data-path="' + ob + '.description" data-type="text" value="' + esc(o.description) + '">' +
        (isFlavor || (o.ingredients && o.ingredients.length) ? '<div class="adm-ings" aria-label="Ingredientes de ' + esc(o.name) + '">' + chips +
          '<span class="adm-ing-add"><input aria-label="Novo ingrediente para ' + esc(o.name) + '" placeholder="+ ingrediente" data-act="ing-input" data-path="' + ob + '.ingredients"><button type="button" class="adm-btn adm-btn-sm" data-act="ing-add" data-path="' + ob + '.ingredients">Adicionar</button></span></div>' : '') +
        '</div>';
    }).join("");
    var ask = "group-del:" + p.id + ":" + gi;
    return '<fieldset class="adm-group"><legend>' + (isFlavor ? "Sabores" : "Adicionais") + '</legend>' +
      '<div class="adm-group-head">' +
      F("Nome do grupo", base + ".name", g.name, { wide: true }) +
      F("Mín.", base + ".min", g.min, { type: "int", small: true }) +
      F("Máx.", base + ".max", g.max, { type: "int", small: true }) +
      '<div class="adm-field adm-narrow"><label for="k_' + i + '_' + gi + '">Tipo</label><select id="k_' + i + '_' + gi + '" data-path="' + base + '.kind" data-type="text" data-rerender-change><option value="flavor"' + (isFlavor ? " selected" : "") + '>Sabores</option><option value="extra"' + (!isFlavor ? " selected" : "") + '>Adicionais</option></select></div>' +
      '</div>' +
      ((g.options || []).length > 6 ?
        '<details class="adm-opts-more"><summary>' + g.options.length + ' ' + (isFlavor ? "sabores" : "opções") + ' só deste produto — abrir para editar aqui' + (isFlavor ? ' <span class="adm-muted">(para mudar em todos os tamanhos, use “Sabores”)</span>' : '') + '</summary><div class="adm-opts">' + opts + '</div></details>' :
        '<div class="adm-opts">' + (opts || '<p class="adm-muted adm-small">Nenhuma opção ainda.</p>') + '</div>') +
      '<div class="adm-row"><button type="button" class="adm-btn adm-btn-sm" data-act="opt-add" data-path="' + base + '.options" data-kind="' + esc(g.kind) + '">+ ' + (isFlavor ? "Sabor" : "Opção") + '</button>' +
      (S.ask === ask ? '<span class="adm-confirm-inline"><span class="adm-small">Remover o grupo inteiro?</span><button type="button" class="adm-btn adm-btn-sm adm-btn-danger" data-act="group-del" data-i="' + i + '" data-gi="' + gi + '">Remover</button><button type="button" class="adm-btn adm-btn-sm" data-act="ask-none">Voltar</button></span>' :
        '<button type="button" class="adm-btn adm-btn-sm adm-btn-ghost" data-act="ask" data-ask="' + esc(ask) + '">Remover grupo</button>') +
      '</div></fieldset>';
  }

  // ---------- sabores em todos os tamanhos (mesmo nome = mesmo sabor) ----------
  function flavorIndex(m) {
    var map = {}, list = [];
    (m.products || []).forEach(function (p, i) {
      (p.groups || []).forEach(function (g, gi) {
        if (g.kind !== "flavor") return;
        (g.options || []).forEach(function (o, oi) {
          var k = String(o.name || "").trim().toLowerCase();
          if (!map[k]) { map[k] = { name: o.name, refs: [] }; list.push(map[k]); }
          map[k].refs.push({ p: p, i: i, g: g, gi: gi, o: o, oi: oi });
        });
      });
    });
    return list;
  }
  function shortName(p) { return String(p.name || "").replace(/^Pizza\s+/i, ""); }
  function renderFlavors() {
    var list = flavorIndex(S.draft);
    if (!list.length) return "";
    var q = (S.flQuery || "").trim().toLowerCase();
    var shown = 0;
    var cards = list.map(function (f, k) {
      var first = f.refs[0].o;
      var ings = first.ingredients || [];
      var differ = f.refs.some(function (r) { return (r.o.ingredients || []).join("|") !== ings.join("|"); });
      var allOn = f.refs.every(function (r) { return r.o.active !== false; }), someOn = f.refs.some(function (r) { return r.o.active !== false; });
      var hay = (f.name + " " + ings.join(" ")).toLowerCase();
      var hide = q && hay.indexOf(q) < 0;
      if (!hide) shown++;
      var ask = "fl-del:" + k;
      var prices = f.refs.map(function (r) {
        var path = "products." + r.i + ".groups." + r.gi + ".options." + r.oi + ".price";
        return '<label class="adm-fl-price"><span>' + esc(shortName(r.p)) + '</span><span class="adm-opt-price"><span class="adm-muted">R$</span><input inputmode="decimal" aria-label="Preço de ' + esc(f.name) + ' — ' + esc(r.p.name) + '" data-path="' + path + '" data-type="num" value="' + esc(fmtInput(r.o.price)) + '"></span></label>';
      }).join("");
      var chips = ings.map(function (ing) {
        return '<span class="adm-ing">' + esc(ing) + '<button type="button" data-act="fl-ing-del" data-fk="' + k + '" data-ing="' + esc(ing) + '" aria-label="Retirar ' + esc(ing) + ' de ' + esc(f.name) + ' em todos os tamanhos">' + ICON.x + '</button></span>';
      }).join("");
      return '<div class="adm-fl' + (allOn ? "" : " is-off") + '" data-search="' + esc(hay) + '"' + (hide ? " hidden" : "") + '>' +
        '<div class="adm-opt-top">' +
        '<input class="adm-opt-name" aria-label="Nome do sabor" data-act="fl-name" data-fk="' + k + '" value="' + esc(f.name) + '">' +
        '<label class="adm-check"><input type="checkbox" data-act="fl-active" data-fk="' + k + '"' + (allOn ? " checked" : "") + '> Ativo' + (someOn && !allOn ? ' <span class="adm-muted adm-small">(em parte)</span>' : '') + '</label>' +
        (S.ask === ask ? '<span class="adm-confirm-inline"><span class="adm-small">Remover de todos os tamanhos?</span><button type="button" class="adm-btn adm-btn-sm adm-btn-danger" data-act="fl-del" data-fk="' + k + '">Remover</button><button type="button" class="adm-btn adm-btn-sm" data-act="ask-none">Voltar</button></span>' :
          '<button type="button" class="adm-icon-btn" data-act="ask" data-ask="' + ask + '" aria-label="Remover ' + esc(f.name) + ' de todos os tamanhos">' + ICON.x + '</button>') +
        '</div>' +
        '<div class="adm-fl-prices">' + prices + '</div>' +
        '<input class="adm-opt-desc" aria-label="Descrição de ' + esc(f.name) + '" placeholder="Descrição (opcional)" data-act="fl-desc" data-fk="' + k + '" value="' + esc(first.description) + '">' +
        '<div class="adm-ings" aria-label="Ingredientes de ' + esc(f.name) + '">' + chips +
        '<span class="adm-ing-add"><input aria-label="Novo ingrediente para ' + esc(f.name) + '" placeholder="+ ingrediente" data-act="fl-ing-input" data-fk="' + k + '"><button type="button" class="adm-btn adm-btn-sm" data-act="fl-ing-add" data-fk="' + k + '">Adicionar</button></span></div>' +
        (differ ? '<p class="adm-small adm-warn-txt">Os ingredientes estão diferentes entre os tamanhos. Mudar aqui iguala todos.</p>' : '') +
        '</div>';
    }).join("");
    var sizes = (S.draft.products || []).filter(function (p) { return (p.groups || []).some(function (g) { return g.kind === "flavor"; }); });
    return '<details class="adm-sec" open><summary><h3>Sabores e ingredientes</h3><span class="adm-muted adm-small">' + list.length + ' sabores · vale para todos os tamanhos</span></summary><div class="adm-sec-body">' +
      '<p class="adm-small adm-muted">Cada sabor aparece uma vez. Preço de cada tamanho lado a lado; ativar, renomear, descrição e ingredientes mudam em ' + sizes.map(function (p) { return esc(shortName(p)); }).join(", ") + ' de uma vez.</p>' +
      '<div class="adm-toolbar-row"><label class="adm-field adm-field-inline"><span class="adm-sr">Buscar sabor</span><input type="search" data-act="fl-search" placeholder="Buscar sabor ou ingrediente (ex.: cebola)" value="' + esc(S.flQuery || "") + '"></label>' +
      '<span class="adm-small adm-muted" data-role="fl-count">' + shown + ' de ' + list.length + '</span></div>' +
      '<div class="adm-fls">' + cards + '</div>' +
      '<form class="adm-inline-form" data-form="fl-add"><label class="adm-field"><span>Novo sabor (em todos os tamanhos)</span><input name="name" placeholder="Ex.: Carne de sol" required></label>' +
      '<label class="adm-field"><span>Ingredientes (separe por vírgula)</span><input name="ings" placeholder="mussarela, carne de sol, cebola"></label>' +
      '<button type="submit" class="adm-btn">Adicionar sabor</button></form>' +
      '</div></details>';
  }
  // a descrição do sabor costuma ser a lista de ingredientes: mantém em sincronia
  function syncDesc(o, removed, added) {
    var d = String(o.description || ""); if (!d.trim()) return;
    var parts = d.split(",").map(function (x) { return x.trim(); }).filter(Boolean);
    var low = parts.map(function (x) { return x.toLowerCase(); });
    if (removed) { var k = low.indexOf(String(removed).toLowerCase()); if (k < 0) return; parts.splice(k, 1); }
    if (added) {
      var ings = (o.ingredients || []).map(function (x) { return String(x).toLowerCase(); });
      if (low.indexOf(added) >= 0 || !low.every(function (x) { return ings.indexOf(x) >= 0; })) return;
      parts.push(added);
    }
    var out = parts.join(", ");
    o.description = out.charAt(0).toUpperCase() + out.slice(1);
  }
  function flRefs(k) { var f = flavorIndex(S.draft)[Number(k)]; return f ? f.refs : []; }
  function addFlIngredient(k) {
    var input = wrap.querySelector('[data-act="fl-ing-input"][data-fk="' + k + '"]');
    var v = input ? input.value.trim() : ""; if (!v) return;
    var add = v.split(",").map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
    flRefs(k).forEach(function (r) { r.o.ingredients = r.o.ingredients || []; add.forEach(function (x) { if (r.o.ingredients.indexOf(x) < 0) { syncDesc(r.o, null, x); r.o.ingredients.push(x); } }); });
    S.dirty = true; renderMenuKeep();
    var ni = wrap.querySelector('[data-act="fl-ing-input"][data-fk="' + k + '"]'); if (ni) ni.focus();
  }

  function markDirty() {
    if (!S.dirty) { S.dirty = true; var bar = wrap.querySelector(".adm-savebar"); if (bar) { bar.classList.add("is-dirty"); bar.querySelector("span").textContent = "Você tem alterações não salvas."; bar.querySelectorAll("button").forEach(function (b) { b.disabled = false; }); } updateTabBadges(); }
  }
  function rememberOpenProducts() {
    wrap.querySelectorAll("details.adm-prod").forEach(function (d) { S.openProducts[d.getAttribute("data-pid")] = d.open; });
    S.openSecs = Array.prototype.map.call(wrap.querySelectorAll("details.adm-sec"), function (d) { return d.open; });
  }
  function renderMenuKeep() {
    rememberOpenProducts();
    rerenderKeepFocus();
    if (S.openSecs) wrap.querySelectorAll("details.adm-sec").forEach(function (d, i) { if (S.openSecs[i] != null) d.open = S.openSecs[i]; });
  }
  function validateMenu(m) {
    var bad = [];
    (m.products || []).forEach(function (p) {
      if (!String(p.name || "").trim()) bad.push("um produto está sem nome");
      if (isNaN(Number(p.price))) bad.push("“" + p.name + "” está com preço inválido");
      (p.groups || []).forEach(function (g) {
        (g.options || []).forEach(function (o) { if (!String(o.name || "").trim()) bad.push("“" + p.name + "” tem sabor/opção sem nome"); });
      });
    });
    (m.categories || []).forEach(function (c) { if (!String(c.name || "").trim()) bad.push("há categoria sem nome"); });
    return bad;
  }
  async function saveMenu() {
    var bad = validateMenu(S.draft);
    if (bad.length) { toast("Corrija antes de salvar: " + bad[0] + ".", "err"); return; }
    try {
      S.saving = true;
      var copy = JR.clone(S.draft);
      S.dirty = false;
      await JR.db.saveMenu(copy);
      S.menu = JR.clone(copy);
      S.menuMsg = "";
      toast("Cardápio salvo. O site já mostra as mudanças.", "ok");
    } catch (e) {
      S.dirty = true;
      toast(e.message || "Não foi possível salvar.", "err");
    } finally { S.saving = false; }
    renderMenuKeep();
  }
  function newIdsFor(p) {
    p.id = JR.uid("prod");
    (p.groups || []).forEach(function (g) { g.id = JR.uid("grp"); (g.options || []).forEach(function (o) { o.id = JR.uid("opt"); }); });
    return p;
  }
  function bulkApply(form) {
    var fd = new FormData(form);
    var v = num(fd.get("value"));
    if (isNaN(v) || !v) { toast("Digite um valor para o ajuste.", "err"); return; }
    var cat = fd.get("cat"), target = fd.get("target"), mode = fd.get("mode"), r99 = !!fd.get("r99");
    var count = 0;
    function adj(x) {
      x = Number(x) || 0; if (x <= 0) return x;
      var n = mode === "pct" ? x * (1 + v / 100) : x + v;
      n = Math.max(0, n);
      if (r99 && n > 0) n = Math.floor(n) + 0.99;
      count++;
      return r2(n);
    }
    S.draft.products.forEach(function (p) {
      if (cat && p.categoryId !== cat) return;
      if (target !== "options") p.price = adj(p.price);
      if (target !== "base") (p.groups || []).forEach(function (g) { (g.options || []).forEach(function (o) { o.price = adj(o.price); }); });
    });
    S.menuMsg = count ? count + " preço(s) ajustado(s). Confira e clique em Salvar cardápio." : "Nenhum preço para ajustar nessa seleção.";
    if (count) S.dirty = true;
    renderMenuKeep();
  }

  // ---------------------------------------------------------------- FINANCEIRO
  var PERIODS = [{ id: "hoje", label: "Hoje" }, { id: "7", label: "7 dias" }, { id: "30", label: "30 dias" }, { id: "mes", label: "Este mês" }];
  function periodRange() {
    var now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (S.period === "7") start.setDate(start.getDate() - 6);
    else if (S.period === "30") start.setDate(start.getDate() - 29);
    else if (S.period === "mes") start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: start, end: now };
  }
  function financeData() {
    var rg = periodRange();
    var orders = visibleOrders().filter(function (o) {
      var d = new Date(o.created_at); return o.status !== "cancelado" && d >= rg.start && d <= rg.end;
    });
    var startKey = ymd(rg.start), endKey = ymd(rg.end);
    var expenses = S.expenses.filter(function (e) { return e.date >= startKey && e.date <= endKey; });
    var revenue = 0, ingCost = 0, byPay = {}, byFlavor = {}, byHour = {}, byDay = {};
    orders.forEach(function (o) {
      var tot = Number(o.totals && o.totals.total) || 0;
      revenue += tot;
      ingCost += consumptionCost(orderConsumption(o, S.stock), S.stock);
      var m = (o.payment && o.payment.method) || "outro"; byPay[m] = (byPay[m] || 0) + tot;
      var d = new Date(o.created_at);
      byHour[d.getHours()] = (byHour[d.getHours()] || 0) + 1;
      var k = S.period === "hoje" ? d.getHours() : ymd(d);
      byDay[k] = (byDay[k] || 0) + tot;
      (o.items || []).forEach(function (it) {
        (it.choices || []).forEach(function (c) {
          if (c.kind !== "flavor") return;
          (c.options || []).forEach(function (op) { var n = String(op.name || "").trim(); if (n) byFlavor[n] = (byFlavor[n] || 0) + (Number(it.qty) || 1); });
        });
      });
    });
    var expTotal = expenses.reduce(function (a, e) { return a + (Number(e.amount) || 0); }, 0);
    var expNoIng = expenses.reduce(function (a, e) { return a + (e.category === "insumos" ? 0 : Number(e.amount) || 0); }, 0);
    // séries
    var days = [];
    if (S.period === "hoje") {
      var hs = Object.keys(byDay).map(Number), h0 = Math.min.apply(null, hs.concat([17])), h1 = Math.max.apply(null, hs.concat([new Date().getHours(), 23]));
      for (var h = h0; h <= h1; h++) days.push({ label: pad(h) + "h", value: r2(byDay[h] || 0) });
    } else {
      for (var d = new Date(rg.start); d <= rg.end; d.setDate(d.getDate() + 1)) {
        var key = ymd(d); days.push({ label: pad(d.getDate()) + "/" + pad(d.getMonth() + 1), value: r2(byDay[key] || 0) });
      }
    }
    var hk = Object.keys(byHour).map(Number), hmin = Math.min.apply(null, hk.concat([17])), hmax = Math.max.apply(null, hk.concat([23]));
    var hours = []; for (var x = hmin; x <= hmax; x++) hours.push({ label: pad(x) + "h", value: byHour[x] || 0 });
    var pays = ["pix", "cartao", "dinheiro"].concat(Object.keys(byPay).filter(function (k) { return !PAY[k]; })).map(function (k) { return { label: PAY[k] || k, value: r2(byPay[k] || 0) }; });
    var flavors = Object.keys(byFlavor).map(function (k) { return { label: k, value: byFlavor[k] }; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 8);
    return {
      range: rg, orders: orders, expenses: expenses, revenue: r2(revenue), ingCost: r2(ingCost), expTotal: r2(expTotal), expNoIng: r2(expNoIng),
      profit: r2(revenue - ingCost - expNoIng), count: orders.length, ticket: orders.length ? r2(revenue / orders.length) : 0,
      days: days, hours: hours, pays: pays, flavors: flavors,
    };
  }

  function renderFinance() {
    var fd = financeData();
    S.fin = fd;
    var periods = PERIODS.map(function (p) { return '<button type="button" class="adm-chip" aria-pressed="' + (S.period === p.id) + '" data-act="period" data-p="' + p.id + '">' + p.label + '</button>'; }).join("");
    function kpi(label, value, note, cls) { return '<div class="adm-kpi' + (cls ? " " + cls : "") + '"><span class="adm-kpi-label">' + label + '</span><span class="adm-kpi-value adm-mono">' + value + '</span>' + (note ? '<span class="adm-kpi-note">' + note + '</span>' : '') + '</div>'; }
    var kpis = '<div class="adm-kpis">' +
      kpi("Faturamento", money(fd.revenue), "pedidos não cancelados") +
      kpi("Pedidos", fd.count, "") +
      kpi("Ticket médio", money(fd.ticket), "") +
      kpi("Despesas", money(fd.expTotal), fd.expenses.length + " lançamento(s)") +
      kpi("Lucro estimado", money(fd.profit), "insumos usados: " + money(fd.ingCost), fd.profit < 0 ? "is-neg" : "is-pos") +
      '</div><p class="adm-small adm-muted">Lucro estimado = faturamento − custo estimado dos insumos usados nos pedidos (pelo vínculo de consumo do estoque) − despesas. Despesas da categoria “Insumos” não entram de novo no lucro, porque já estão no custo dos insumos.</p>';
    var hasData = fd.count > 0;
    function card(id, title, sub) { return '<figure class="adm-chart"><figcaption><strong>' + title + '</strong>' + (sub ? ' <span class="adm-muted adm-small">' + sub + '</span>' : '') + '</figcaption><div class="adm-chart-box" id="' + id + '"></div></figure>'; }
    var charts = hasData ? '<div class="adm-charts">' +
      card("adm-ch-days", S.period === "hoje" ? "Faturamento por hora" : "Faturamento por dia", "R$") +
      card("adm-ch-pay", "Vendas por forma de pagamento", "R$") +
      card("adm-ch-flavor", "Sabores mais vendidos", "nº de vezes escolhido") +
      card("adm-ch-hour", "Pedidos por hora do dia", "nº de pedidos") +
      '</div>' : '<p class="adm-empty">Nenhum pedido neste período.</p>';

    var cats = Object.keys(EXP_CATS).map(function (k) { return '<option value="' + k + '">' + EXP_CATS[k] + '</option>'; }).join("");
    var expRows = fd.expenses.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).map(function (e) {
      var ask = "exp-del:" + e.id;
      var dd = parseYmd(e.date);
      return '<tr><td class="adm-mono">' + pad(dd.getDate()) + "/" + pad(dd.getMonth() + 1) + '</td><td>' + esc(e.description) + (e.example ? ' <span class="adm-pill adm-pill-ex">exemplo</span>' : '') + '</td><td>' + esc(EXP_CATS[e.category] || e.category) + '</td><td class="adm-num adm-mono">' + money(e.amount) + '</td><td class="adm-nowrap">' +
        (S.ask === ask ? '<button type="button" class="adm-btn adm-btn-sm adm-btn-danger" data-act="exp-del" data-id="' + esc(e.id) + '">Remover</button> <button type="button" class="adm-btn adm-btn-sm" data-act="ask-none">Voltar</button>' :
          '<button type="button" class="adm-btn adm-btn-sm adm-btn-ghost" data-act="ask" data-ask="' + esc(ask) + '">Remover</button>') + '</td></tr>';
    }).join("");
    var exp = '<section class="adm-block"><h3>Despesas do período</h3>' +
      '<form class="adm-inline-form" data-form="exp-add">' +
      '<label class="adm-field adm-narrow"><span>Data</span><input type="date" name="date" value="' + ymd(new Date()) + '" required></label>' +
      '<label class="adm-field"><span>Descrição</span><input name="description" placeholder="Ex.: Botijão de gás" required></label>' +
      '<label class="adm-field adm-narrow"><span>Categoria</span><select name="category">' + cats + '</select></label>' +
      '<label class="adm-field adm-narrow"><span>Valor (R$)</span><input name="amount" inputmode="decimal" placeholder="0,00" required></label>' +
      '<button type="submit" class="adm-btn adm-btn-primary">Lançar despesa</button></form>' +
      (expRows ? '<div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="adm-num">Valor</th><th><span class="adm-sr">Ações</span></th></tr></thead><tbody>' + expRows + '</tbody></table></div>' : '<p class="adm-muted adm-small">Nenhuma despesa neste período.</p>') +
      '</section>';
    var csv = '<section class="adm-block"><h3>Exportar</h3><p class="adm-small adm-muted">Copia os dados do período em CSV (separado por ponto e vírgula) para colar numa planilha.</p>' +
      '<div class="adm-row"><button type="button" class="adm-btn" data-act="csv" data-k="orders">Copiar CSV de pedidos</button><button type="button" class="adm-btn" data-act="csv" data-k="expenses">Copiar CSV de despesas</button></div>' +
      (S.clip ? '<label class="adm-field adm-wide"><span>Selecione o texto e copie (Ctrl+C ou segure no celular)</span><textarea class="adm-clip adm-mono" rows="6" readonly>' + esc(S.clip) + '</textarea></label>' : '') +
      '</section>';
    return '<div class="adm-toolbar"><div class="adm-chips" role="group" aria-label="Período">' + periods + '</div><span class="adm-muted adm-small">' +
      fd.range.start.toLocaleDateString("pt-BR") + ' a ' + fd.range.end.toLocaleDateString("pt-BR") + '</span></div>' + kpis + charts + exp + csv;
  }

  function csvOf(rows) {
    return rows.map(function (r) { return r.map(function (v) { v = v == null ? "" : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(";"); }).join("\n");
  }
  function dec(n) { return (Number(n) || 0).toFixed(2).replace(".", ","); }
  async function copyCsv(kind) {
    var fd = S.fin || financeData();
    var text;
    if (kind === "orders") {
      var all = visibleOrders().filter(function (o) { var d = new Date(o.created_at); return d >= fd.range.start && d <= fd.range.end; });
      text = csvOf([["codigo", "data", "hora", "status", "cliente", "telefone", "tipo", "pagamento", "subtotal", "entrega", "desconto", "total", "itens"]].concat(all.map(function (o) {
        var d = new Date(o.created_at), t = o.totals || {}, c = o.customer || {};
        return [o.code, d.toLocaleDateString("pt-BR"), pad(d.getHours()) + ":" + pad(d.getMinutes()), STATUS[o.status] || o.status, c.name, c.phone, o.fulfillment || "", PAY[o.payment && o.payment.method] || "", dec(t.subtotal), dec(t.deliveryFee), dec(t.discount), dec(t.total),
          (o.items || []).map(function (it) { return (it.qty || 1) + "x " + it.name; }).join(", ")];
      })));
    } else {
      text = csvOf([["data", "descricao", "categoria", "valor"]].concat(fd.expenses.map(function (e) { return [e.date, e.description, EXP_CATS[e.category] || e.category, dec(e.amount)]; })));
    }
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error("sem clipboard");
      await navigator.clipboard.writeText(text);
      S.clip = null;
      toast("CSV copiado. Cole numa planilha.", "ok");
      rerenderKeepFocus();
    } catch (e) {
      S.clip = text;
      rerenderKeepFocus();
      var ta = wrap.querySelector(".adm-clip"); if (ta) { ta.focus(); ta.select(); }
      toast("Não deu para copiar sozinho: o texto está selecionado abaixo.", "");
    }
  }

  // gráficos: Chart.js quando disponível; senão, desenho simples em SVG/CSS
  function destroyCharts() { S.charts.forEach(function (c) { try { c.destroy(); } catch (e) { } }); S.charts = []; }
  function drawCharts() {
    var fd = S.fin; if (!fd || !fd.count) return;
    var specs = [
      { id: "adm-ch-days", type: "line", data: fd.days, money: true },
      { id: "adm-ch-pay", type: "bar", data: fd.pays, money: true },
      { id: "adm-ch-flavor", type: "hbar", data: fd.flavors },
      { id: "adm-ch-hour", type: "bar", data: fd.hours },
    ];
    specs.forEach(function (sp) {
      var box = document.getElementById(sp.id); if (!box) return;
      if (window.Chart) {
        try { chartJs(box, sp); return; } catch (e) { console.warn("Chart.js falhou", e); }
      }
      box.innerHTML = sp.type === "line" ? svgLine(sp) : sp.type === "hbar" ? cssHBars(sp) : cssVBars(sp);
    });
  }
  function chartJs(box, sp) {
    var c = document.createElement("canvas");
    c.setAttribute("role", "img");
    c.setAttribute("aria-label", sp.data.map(function (d) { return d.label + ": " + (sp.money ? money(d.value) : d.value); }).join("; "));
    box.innerHTML = ""; box.appendChild(c);
    var ink2 = token("--jr-ink-2"), line = token("--jr-line"), tomato = token("--jr-tomato"), font = token("--jr-font-body");
    var fmt = function (v) { return sp.money ? money(v) : fmtNum(v, 0); };
    var cfg = {
      type: sp.type === "hbar" ? "bar" : sp.type,
      data: {
        labels: sp.data.map(function (d) { return d.label; }),
        datasets: [{
          data: sp.data.map(function (d) { return d.value; }),
          backgroundColor: sp.type === "line" ? "color-mix(in srgb, " + tomato + " 14%, transparent)" : tomato,
          borderColor: tomato, borderWidth: sp.type === "line" ? 2 : 0, borderRadius: 4, borderSkipped: "start",
          fill: sp.type === "line", tension: 0.3, pointRadius: sp.data.length > 14 ? 0 : 3, pointHoverRadius: 5, maxBarThickness: 28,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        indexAxis: sp.type === "hbar" ? "y" : "x",
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (ctx) { return fmt(ctx.parsed[sp.type === "hbar" ? "x" : "y"]); } } } },
        scales: {
          x: { grid: { display: sp.type === "hbar", color: line }, ticks: { color: ink2, font: { family: font, size: 11 }, maxRotation: 0, autoSkip: true }, border: { display: false }, beginAtZero: true },
          y: { grid: { display: sp.type !== "hbar", color: line }, ticks: { color: ink2, font: { family: font, size: 11 }, callback: sp.type === "hbar" ? undefined : function (v) { return sp.money ? "R$ " + fmtNum(v, 0) : v; } }, border: { display: false }, beginAtZero: true },
        },
      },
    };
    S.charts.push(new window.Chart(c, cfg));
  }
  function svgLine(sp) {
    var d = sp.data, n = d.length, W = 600, H = 200, max = Math.max.apply(null, d.map(function (x) { return x.value; }).concat([1]));
    var xs = function (i) { return n === 1 ? W / 2 : (i / (n - 1)) * W; };
    var ys = function (v) { return H - (v / max) * (H - 10); };
    var pts = d.map(function (p, i) { return xs(i).toFixed(1) + "," + ys(p.value).toFixed(1); });
    var area = "M0," + H + " L" + pts.join(" L") + " L" + W + "," + H + " Z";
    var hits = d.map(function (p, i) { var w = W / Math.max(n, 1); return '<rect x="' + (xs(i) - w / 2).toFixed(1) + '" y="0" width="' + w.toFixed(1) + '" height="' + H + '" class="adm-hit"><title>' + esc(p.label) + ": " + esc(money(p.value)) + '</title></rect>'; }).join("");
    var step = Math.ceil(n / 6);
    var labels = d.map(function (p, i) { return i % step === 0 || i === n - 1 ? '<span style="left:' + (n === 1 ? 50 : (i / (n - 1)) * 100) + '%">' + esc(p.label) + '</span>' : ""; }).join("");
    var best = d.reduce(function (a, b) { return b.value > a.value ? b : a; }, d[0]);
    return '<div class="adm-svgline"><span class="adm-axis-max adm-mono">' + esc(money(max)) + '</span>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Faturamento: ' + esc(d.map(function (p) { return p.label + " " + money(p.value); }).join("; ")) + '">' +
      '<path class="adm-area" d="' + area + '"/><polyline class="adm-line" points="' + pts.join(" ") + '" vector-effect="non-scaling-stroke"/>' + hits + '</svg>' +
      '<div class="adm-xlabels">' + labels + '</div>' +
      '<p class="adm-small adm-muted">Melhor: <strong>' + esc(best.label) + '</strong> com <span class="adm-mono">' + money(best.value) + '</span></p></div>';
  }
  function cssVBars(sp) {
    var max = Math.max.apply(null, sp.data.map(function (x) { return x.value; }).concat([1]));
    var fmt = function (v) { return sp.money ? money(v) : fmtNum(v, 0); };
    return '<div class="adm-vbars" role="img" aria-label="' + esc(sp.data.map(function (d) { return d.label + ": " + fmt(d.value); }).join("; ")) + '">' + sp.data.map(function (d) {
      return '<div class="adm-vbar" title="' + esc(d.label + ": " + fmt(d.value)) + '"><span class="adm-vbar-val adm-mono">' + (d.value ? esc(sp.money ? "R$ " + fmtNum(d.value, 0) : d.value) : "") + '</span><span class="adm-vbar-col"><span style="height:' + (d.value / max * 100).toFixed(1) + '%"></span></span><span class="adm-vbar-lbl">' + esc(d.label) + '</span></div>';
    }).join("") + '</div>';
  }
  function cssHBars(sp) {
    if (!sp.data.length) return '<p class="adm-muted adm-small">Sem sabores no período.</p>';
    var max = Math.max.apply(null, sp.data.map(function (x) { return x.value; }).concat([1]));
    return '<div class="adm-hbars">' + sp.data.map(function (d) {
      return '<div class="adm-hbar" title="' + esc(d.label + ": " + d.value) + '"><span class="adm-hbar-lbl">' + esc(d.label) + '</span><span class="adm-hbar-track"><span style="width:' + (d.value / max * 100).toFixed(1) + '%"></span></span><span class="adm-mono adm-hbar-val">' + d.value + '</span></div>';
    }).join("") + '</div>';
  }

  // ---------------------------------------------------------------- ESTOQUE
  function renderStock() {
    var low = lowStock();
    var total = S.stock.reduce(function (a, s) { return a + (Number(s.qty) || 0) * (Number(s.cost) || 0); }, 0);
    var alerts = low.length ? '<div class="adm-alert" role="alert"><div class="adm-alert-title">' + ICON.alert + ' ' + low.length + ' insumo' + (low.length > 1 ? "s" : "") + ' no mínimo ou abaixo — hora de comprar</div><ul>' +
      low.map(function (s) { return '<li><strong>' + esc(s.name) + '</strong>: <span class="adm-mono">' + fmtNum(s.qty) + ' ' + esc(s.unit) + '</span> <span class="adm-muted">(mínimo ' + fmtNum(s.min) + ')</span></li>'; }).join("") + '</ul></div>' :
      '<p class="adm-ok-txt">Nenhum insumo abaixo do mínimo.</p>';
    var rows = S.stock.map(function (s, i) {
      var isLow = (Number(s.qty) || 0) <= (Number(s.min) || 0);
      var ask = "stock-del:" + s.id;
      return '<tr class="' + (isLow ? "is-low" : "") + '">' +
        '<td><strong>' + esc(s.name) + '</strong>' + (isLow ? ' <span class="adm-pill adm-pill-low">baixo</span>' : '') + (s.example ? ' <span class="adm-pill adm-pill-ex">exemplo</span>' : '') + '</td>' +
        '<td class="adm-nowrap"><div class="adm-stepper">' +
        '<button type="button" class="adm-icon-btn" data-act="stock-step" data-i="' + i + '" data-d="-1" aria-label="Saída de 1 ' + esc(s.unit) + ' de ' + esc(s.name) + '">−</button>' +
        '<input aria-label="Quantidade de ' + esc(s.name) + '" inputmode="decimal" class="adm-mono" data-act="stock-qty" data-i="' + i + '" value="' + esc(fmtInput(s.qty)) + '">' +
        '<button type="button" class="adm-icon-btn" data-act="stock-step" data-i="' + i + '" data-d="1" aria-label="Entrada de 1 ' + esc(s.unit) + ' de ' + esc(s.name) + '">+</button>' +
        '<span class="adm-muted adm-small">' + esc(s.unit) + '</span></div></td>' +
        '<td class="adm-num adm-mono">' + fmtNum(s.min) + '</td>' +
        '<td class="adm-num adm-mono">' + money(s.cost) + '</td>' +
        '<td class="adm-num adm-mono">' + money((Number(s.qty) || 0) * (Number(s.cost) || 0)) + '</td>' +
        '<td class="adm-small">' + ((s.uses || []).length ? (s.uses.length + " vínculo" + (s.uses.length > 1 ? "s" : "")) : '<span class="adm-muted">nenhum</span>') + '</td>' +
        '<td class="adm-nowrap"><button type="button" class="adm-btn adm-btn-sm" data-act="stock-edit" data-i="' + i + '">Editar</button> ' +
        (S.ask === ask ? '<button type="button" class="adm-btn adm-btn-sm adm-btn-danger" data-act="stock-del" data-i="' + i + '">Remover</button> <button type="button" class="adm-btn adm-btn-sm" data-act="ask-none">Voltar</button>' :
          '<button type="button" class="adm-btn adm-btn-sm adm-btn-ghost" data-act="ask" data-ask="' + esc(ask) + '">Remover</button>') + '</td></tr>';
    }).join("");
    var table = S.stock.length ? '<div class="adm-table-wrap"><table class="adm-table adm-stock"><thead><tr><th>Insumo</th><th>Quantidade (entrada/saída)</th><th class="adm-num">Mínimo</th><th class="adm-num">Custo/un.</th><th class="adm-num">Valor</th><th>Consumo</th><th><span class="adm-sr">Ações</span></th></tr></thead><tbody>' + rows + '</tbody></table></div>' :
      '<p class="adm-empty">Nenhum insumo cadastrado.</p>';
    return alerts +
      '<div class="adm-toolbar"><div class="adm-toolbar-row"><button type="button" class="adm-btn adm-btn-primary" data-act="stock-new">+ Novo insumo</button><span class="adm-small adm-muted">Valor em estoque: <span class="adm-mono">' + money(total) + '</span> · O estoque baixa sozinho quando um pedido é marcado como entregue.</span></div></div>' +
      (S.stockEdit ? renderStockEdit() : '') + table;
  }

  function renderStockEdit() {
    var e = S.stockEdit, it = e.item;
    var prods = (S.menu && S.menu.products) || [];
    var pOpts = function (sel) { return '<option value="">— escolha —</option>' + prods.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === sel ? " selected" : "") + '>' + esc(p.name) + '</option>'; }).join(""); };
    var oOpts = function (pid, sel) {
      var p = prods.filter(function (x) { return x.id === pid; })[0];
      var list = [];
      (p && p.groups || []).forEach(function (g) { (g.options || []).forEach(function (o) { list.push(o); }); });
      return '<option value="">Cada unidade do produto</option>' + list.map(function (o) { return '<option value="' + esc(o.id) + '"' + (o.id === sel ? " selected" : "") + '>Sabor/opção: ' + esc(o.name) + '</option>'; }).join("");
    };
    var uses = (it.uses || []).map(function (u, ui) {
      var known = !u.productId || prods.some(function (p) { return p.id === u.productId; });
      return '<div class="adm-use">' +
        '<label class="adm-field"><span>Produto</span><select data-act="use-prod" data-ui="' + ui + '">' + pOpts(u.productId) + (known ? "" : '<option selected value="' + esc(u.productId) + '">(produto removido)</option>') + '</select></label>' +
        '<label class="adm-field"><span>Quando</span><select data-act="use-opt" data-ui="' + ui + '">' + oOpts(u.productId, u.optionId) + '</select></label>' +
        '<label class="adm-field adm-narrow"><span>Gasta (' + esc(it.unit) + ')</span><input inputmode="decimal" data-act="use-qty" data-ui="' + ui + '" value="' + esc(fmtInput(u.qty)) + '"></label>' +
        '<button type="button" class="adm-icon-btn" data-act="use-del" data-ui="' + ui + '" aria-label="Remover vínculo">' + ICON.x + '</button></div>';
    }).join("");
    var flavorNames = {};
    prods.forEach(function (p) { (p.groups || []).forEach(function (g) { (g.options || []).forEach(function (o) { if (o.name) flavorNames[o.name] = 1; }); }); });
    return '<form class="adm-stock-edit" data-form="stock-save">' +
      '<h3>' + (e.index < 0 ? "Novo insumo" : "Editar " + esc(it.name)) + '</h3>' +
      '<div class="adm-form-grid">' +
      '<label class="adm-field adm-wide"><span>Nome</span><input name="name" value="' + esc(it.name) + '" required placeholder="Ex.: Mussarela"></label>' +
      '<label class="adm-field adm-narrow"><span>Unidade</span><select name="unit">' + ["kg", "un", "L"].map(function (u) { return '<option' + (it.unit === u ? " selected" : "") + '>' + u + '</option>'; }).join("") + '</select></label>' +
      '<label class="adm-field adm-narrow"><span>Quantidade</span><input name="qty" inputmode="decimal" value="' + esc(fmtInput(it.qty)) + '"></label>' +
      '<label class="adm-field adm-narrow"><span>Mínimo</span><input name="min" inputmode="decimal" value="' + esc(fmtInput(it.min)) + '"></label>' +
      '<label class="adm-field adm-narrow"><span>Custo por unidade (R$)</span><input name="cost" inputmode="decimal" value="' + esc(fmtInput(it.cost)) + '"></label>' +
      '</div>' +
      '<h4>Consumo por produto/sabor</h4><p class="adm-small adm-muted">Diga quanto deste insumo cada produto ou sabor gasta. Em pizza meio a meio, cada sabor conta metade.</p>' +
      '<div class="adm-uses">' + (uses || '<p class="adm-muted adm-small">Nenhum vínculo. Sem vínculo, o insumo não baixa sozinho.</p>') + '</div>' +
      '<div class="adm-row"><button type="button" class="adm-btn adm-btn-sm" data-act="use-add">+ Vínculo com produto</button></div>' +
      '<div class="adm-row adm-use-bulk"><label class="adm-field"><span>Sabor em todos os tamanhos</span><select data-role="bulk-flavor"><option value="">— escolha o sabor —</option>' + Object.keys(flavorNames).sort().map(function (n) { return '<option>' + esc(n) + '</option>'; }).join("") + '</select></label>' +
      '<label class="adm-field adm-narrow"><span>Gasta (' + esc(it.unit) + ')</span><input data-role="bulk-qty" inputmode="decimal" placeholder="0,15"></label>' +
      '<button type="button" class="adm-btn adm-btn-sm" data-act="use-bulk">Vincular em todos</button></div>' +
      '<div class="adm-row adm-form-foot"><button type="submit" class="adm-btn adm-btn-primary">Salvar insumo</button><button type="button" class="adm-btn" data-act="stock-cancel">Cancelar</button></div>' +
      '</form>';
  }
  function readStockForm() {
    var f = wrap.querySelector('[data-form="stock-save"]'); if (!f || !S.stockEdit) return;
    var it = S.stockEdit.item, fd = new FormData(f);
    it.name = String(fd.get("name") || "").trim(); it.unit = fd.get("unit") || "un";
    ["qty", "min", "cost"].forEach(function (k) { var v = num(fd.get(k)); it[k] = isNaN(v) ? 0 : v; });
  }
  async function saveStockList(list, msg) {
    try { await JR.db.saveStock(list); S.stock = list; if (msg) toast(msg, "ok"); }
    catch (e) { toast(e.message || "Não foi possível salvar o estoque.", "err"); }
  }

  // ---------------------------------------------------------------- eventos
  wrap.addEventListener("submit", function (ev) {
    var f = ev.target;
    ev.preventDefault();
    if (f.id === "adm-login") return doLogin(f);
    var kind = f.getAttribute("data-form");
    var fd = new FormData(f);
    if (kind === "cat-add") {
      var name = String(fd.get("name") || "").trim(); if (!name) return;
      var id = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cat";
      if (S.draft.categories.some(function (c) { return c.id === id; })) id = id + "-" + JR.uid("c").slice(-4);
      S.draft.categories.push({ id: id, name: name });
      S.dirty = true; renderMenuKeep(); toast("Categoria adicionada. Clique em Salvar cardápio.", "");
    } else if (kind === "prod-add") {
      var pname = String(fd.get("name") || "").trim(), price = num(fd.get("price"));
      if (!pname) return toast("Dê um nome ao produto.", "err");
      if (isNaN(price) || price < 0) return toast("Preço inválido. Use, por exemplo, 24,90.", "err");
      if (!S.draft.categories.length) return toast("Crie uma categoria primeiro.", "err");
      var p = { id: JR.uid("prod"), categoryId: fd.get("cat"), name: pname, description: "", price: r2(price), image: "", active: true, featured: false, badge: "", pricing: "sum", groups: [] };
      S.draft.products.push(p);
      S.openProducts[p.id] = true; S.dirty = true;
      renderMenuKeep();
      var el = wrap.querySelector('details.adm-prod[data-pid="' + p.id + '"]');
      if (el) { el.scrollIntoView({ block: "center" }); var inp = el.querySelector("input"); if (inp) inp.focus({ preventScroll: true }); }
      toast("“" + pname + "” adicionado. Complete os dados e clique em Salvar cardápio.", "");
    } else if (kind === "fl-add") {
      var fname = String(fd.get("name") || "").trim(); if (!fname) return;
      var fings = String(fd.get("ings") || "").split(",").map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
      if (flavorIndex(S.draft).some(function (f) { return f.name.trim().toLowerCase() === fname.toLowerCase(); })) return toast("Já existe um sabor com esse nome.", "err");
      var nAdded = 0;
      S.draft.products.forEach(function (p) {
        (p.groups || []).forEach(function (g) {
          if (g.kind !== "flavor" || (g.options || []).length < 2) return; // ignora listas de ingredientes de um produto só (ex.: lanche)
          var last = g.options[g.options.length - 1];
          g.options.push({ id: (last && last.id ? last.id.split("-")[0] + "-" : "") + JR.uid("sabor"), name: fname, description: fings.join(", "), ingredients: fings.slice(), price: last ? last.price : p.price, active: true });
          nAdded++;
        });
      });
      S.flQuery = fname; S.dirty = true; renderMenuKeep();
      toast("“" + fname + "” adicionado em " + nAdded + " tamanho(s). Confira os preços e clique em Salvar cardápio.", "");
    } else if (kind === "bulk") {
      bulkApply(f);
    } else if (kind === "exp-add") {
      var amount = num(fd.get("amount")), desc = String(fd.get("description") || "").trim(), date = fd.get("date");
      if (!desc || !date) return toast("Preencha data e descrição.", "err");
      if (isNaN(amount) || amount <= 0) return toast("Valor inválido.", "err");
      var list = S.expenses.concat([{ id: JR.uid("desp"), date: date, description: desc, category: fd.get("category") || "outros", amount: r2(amount) }]);
      JR.db.saveExpenses(list).then(function () { S.expenses = list; toast("Despesa lançada.", "ok"); rerenderKeepFocus(); })
        .catch(function (e) { toast(e.message, "err"); });
    } else if (kind === "stock-save") {
      readStockForm();
      var it = S.stockEdit.item;
      if (!it.name) return toast("Dê um nome ao insumo.", "err");
      it.uses = (it.uses || []).filter(function (u) { return u.productId && Number(u.qty) > 0; });
      var stock = S.stock.slice();
      if (S.stockEdit.index < 0) stock.push(it); else stock[S.stockEdit.index] = it;
      S.stockEdit = null;
      saveStockList(stock, "Insumo salvo.").then(rerenderKeepFocus);
    }
  });

  wrap.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-act], [data-tab]");
    if (!b || !wrap.contains(b)) return;
    if (b.hasAttribute("data-tab")) return selectTab(b.getAttribute("data-tab"), false);
    var act = b.getAttribute("data-act");
    var i = Number(b.getAttribute("data-i"));
    switch (act) {
      case "login-toggle":
        S.loginOpen = !S.loginOpen; render();
        if (S.loginOpen) { var em = wrap.querySelector('input[name="email"]'); if (em) em.focus(); }
        break;
      case "logout": doLogout(); break;
      case "ask": S.ask = b.getAttribute("data-ask"); S.tab === "cardapio" ? renderMenuKeep() : rerenderKeepFocus(); focusConfirm(); break;
      case "ask-none": S.ask = null; S.tab === "cardapio" ? renderMenuKeep() : rerenderKeepFocus(); break;
      case "clear-examples": clearExamples(); break;
      // pedidos
      case "order-filter": S.orderFilter = b.getAttribute("data-f"); S.orderLimit = 30; rerenderKeepFocus(); break;
      case "orders-refresh": refreshOrders(true).then(function () { toast("Pedidos atualizados.", ""); }); break;
      case "orders-more": S.orderLimit += 30; rerenderKeepFocus(); break;
      case "order-status": b.disabled = true; setOrderStatus(b.getAttribute("data-id"), b.getAttribute("data-st")); break;
      // cardápio
      case "menu-save": saveMenu(); break;
      case "menu-discard": S.draft = JR.clone(S.menu); S.dirty = false; S.menuMsg = ""; renderMenuKeep(); toast("Alterações descartadas.", ""); break;
      case "menu-reset":
        JR.db.resetMenu().then(function (m) { S.menu = JR.clone(m); S.draft = JR.clone(m); S.dirty = false; S.ask = null; renderMenuKeep(); toast("Cardápio original restaurado.", "ok"); })
          .catch(function (e) { toast(e.message, "err"); });
        break;
      case "cat-move": {
        var d = Number(b.getAttribute("data-d")), c = S.draft.categories, j = i + d;
        if (j < 0 || j >= c.length) break;
        var tmp = c[i]; c[i] = c[j]; c[j] = tmp; S.dirty = true; renderMenuKeep();
        var nb = wrap.querySelector('[data-act="cat-move"][data-i="' + j + '"][data-d="' + d + '"]'); if (nb && !nb.disabled) nb.focus();
        break;
      }
      case "cat-del": S.draft.categories.splice(i, 1); S.ask = null; S.dirty = true; renderMenuKeep(); break;
      case "prod-dup": {
        var copy = newIdsFor(JR.clone(S.draft.products[i]));
        copy.name = copy.name + " (cópia)";
        S.draft.products.splice(i + 1, 0, copy); S.openProducts[copy.id] = true; S.dirty = true; renderMenuKeep();
        toast("Produto duplicado.", ""); break;
      }
      case "prod-del": { var pn = S.draft.products[i].name; S.draft.products.splice(i, 1); S.ask = null; S.dirty = true; renderMenuKeep(); toast("“" + pn + "” excluído. Clique em Salvar cardápio.", ""); break; }
      case "prod-photo-del": S.draft.products[i].image = ""; S.dirty = true; renderMenuKeep(); break;
      case "prod-ingredients": {
        var pr = S.draft.products[i];
        pr.groups = pr.groups || [];
        pr.groups.unshift({ id: JR.uid("grp"), name: pr.name, min: 1, max: 1, kind: "flavor", options: [{ id: JR.uid("opt"), name: pr.name, description: "", ingredients: [], price: Number(pr.price) || 0, active: true }] });
        pr.pricing = "max"; S.dirty = true; renderMenuKeep();
        var inp = wrap.querySelector('details.adm-prod[data-pid="' + pr.id + '"] [data-act="ing-input"]'); if (inp) inp.focus();
        break;
      }
      case "group-add": {
        var kind = b.getAttribute("data-kind"), prd = S.draft.products[i];
        prd.groups = prd.groups || [];
        prd.groups.push({ id: JR.uid("grp"), name: kind === "flavor" ? "Escolha o sabor" : "Adicionais", min: kind === "flavor" ? 1 : 0, max: kind === "flavor" ? 1 : 3, kind: kind, options: [] });
        S.dirty = true; renderMenuKeep(); break;
      }
      case "group-del": S.draft.products[i].groups.splice(Number(b.getAttribute("data-gi")), 1); S.ask = null; S.dirty = true; renderMenuKeep(); break;
      case "opt-add": {
        var arr = getAt(S.draft, b.getAttribute("data-path"));
        var fl = b.getAttribute("data-kind") === "flavor";
        var ref = arr[arr.length - 1];
        arr.push({ id: JR.uid("opt"), name: fl ? "Novo sabor" : "Nova opção", description: "", ingredients: [], price: fl && ref ? ref.price : 0, active: true });
        S.dirty = true; renderMenuKeep();
        var names = wrap.querySelectorAll('[data-path^="' + b.getAttribute("data-path") + '."].adm-opt-name');
        if (names.length) { names[names.length - 1].focus(); names[names.length - 1].select(); }
        break;
      }
      case "opt-del": getAt(S.draft, b.getAttribute("data-path")).splice(Number(b.getAttribute("data-oi")), 1); S.dirty = true; renderMenuKeep(); break;
      case "ing-del": {
        var path = b.getAttribute("data-path"), list = getAt(S.draft, path), ii = Number(b.getAttribute("data-ii"));
        var removed = list.splice(ii, 1)[0];
        var ownerOpt = getAt(S.draft, path.replace(/\.ingredients$/, "")); if (ownerOpt) syncDesc(ownerOpt, removed);
        S.dirty = true; renderMenuKeep();
        var ni = wrap.querySelector('[data-act="ing-input"][data-path="' + path + '"]'); if (ni) ni.focus();
        toast("“" + removed + "” retirado. Clique em Salvar cardápio.", "");
        break;
      }
      case "ing-add": addIngredient(b.getAttribute("data-path")); break;
      case "fl-ing-add": addFlIngredient(b.getAttribute("data-fk")); break;
      case "fl-ing-del": {
        var fk = b.getAttribute("data-fk"), ing = b.getAttribute("data-ing"), fr = flRefs(fk);
        fr.forEach(function (r) { r.o.ingredients = (r.o.ingredients || []).filter(function (x) { return x !== ing; }); syncDesc(r.o, ing); });
        S.dirty = true; renderMenuKeep();
        var fi = wrap.querySelector('[data-act="fl-ing-input"][data-fk="' + fk + '"]'); if (fi) fi.focus({ preventScroll: true });
        toast("“" + ing + "” retirado de " + (fr[0] ? fr[0].o.name : "") + " em " + fr.length + " tamanho(s). Clique em Salvar cardápio.", "");
        break;
      }
      case "fl-del": {
        var refs = flRefs(b.getAttribute("data-fk"));
        refs.slice().sort(function (a, c) { return c.oi - a.oi; }).forEach(function (r) { r.g.options.splice(r.g.options.indexOf(r.o), 1); });
        S.ask = null; S.dirty = true; renderMenuKeep(); toast("Sabor removido de todos os tamanhos. Clique em Salvar cardápio.", "");
        break;
      }
      // financeiro
      case "period": S.period = b.getAttribute("data-p"); S.clip = null; rerenderKeepFocus(); break;
      case "csv": copyCsv(b.getAttribute("data-k")); break;
      case "exp-del": {
        var id = b.getAttribute("data-id"), lst = S.expenses.filter(function (e) { return e.id !== id; });
        JR.db.saveExpenses(lst).then(function () { S.expenses = lst; S.ask = null; rerenderKeepFocus(); toast("Despesa removida.", ""); }).catch(function (e) { toast(e.message, "err"); });
        break;
      }
      // estoque
      case "stock-step": {
        var st = S.stock.map(function (x) { return Object.assign({}, x); });
        st[i].qty = Math.max(0, Math.round(((Number(st[i].qty) || 0) + Number(b.getAttribute("data-d"))) * 1000) / 1000);
        saveStockList(st).then(function () { rerenderKeepFocus(); var nb2 = wrap.querySelector('[data-act="stock-step"][data-i="' + i + '"][data-d="' + b.getAttribute("data-d") + '"]'); if (nb2) nb2.focus({ preventScroll: true }); });
        break;
      }
      case "stock-new": S.stockEdit = { index: -1, item: { id: JR.uid("ins"), name: "", unit: "kg", qty: 0, min: 0, cost: 0, uses: [] } }; rerenderKeepFocus(); focusFirst(".adm-stock-edit input"); break;
      case "stock-edit": S.stockEdit = { index: i, item: JR.clone(S.stock[i]) }; rerenderKeepFocus(); var se = wrap.querySelector(".adm-stock-edit"); if (se) { se.scrollIntoView({ block: "start" }); focusFirst(".adm-stock-edit input"); } break;
      case "stock-cancel": S.stockEdit = null; rerenderKeepFocus(); break;
      case "stock-del": { var sl = S.stock.slice(); var nm = sl.splice(i, 1)[0].name; S.ask = null; saveStockList(sl, "“" + nm + "” removido.").then(rerenderKeepFocus); break; }
      case "use-add": readStockForm(); S.stockEdit.item.uses = (S.stockEdit.item.uses || []).concat([{ productId: "", qty: 0 }]); rerenderKeepFocus(); break;
      case "use-del": readStockForm(); S.stockEdit.item.uses.splice(Number(b.getAttribute("data-ui")), 1); rerenderKeepFocus(); break;
      case "use-bulk": {
        readStockForm();
        var fname = wrap.querySelector('[data-role="bulk-flavor"]').value, q = num(wrap.querySelector('[data-role="bulk-qty"]').value);
        if (!fname || isNaN(q) || q <= 0) { toast("Escolha o sabor e quanto ele gasta.", "err"); break; }
        var added = 0, uses = S.stockEdit.item.uses = S.stockEdit.item.uses || [];
        ((S.menu && S.menu.products) || []).forEach(function (p) {
          (p.groups || []).forEach(function (g) { (g.options || []).forEach(function (o) {
            if (o.name !== fname) return;
            var ex = uses.filter(function (u) { return u.productId === p.id && u.optionId === o.id; })[0];
            if (ex) ex.qty = q; else uses.push({ productId: p.id, optionId: o.id, qty: q });
            added++;
          }); });
        });
        rerenderKeepFocus(); toast(added + " vínculo(s) com “" + fname + "”. Clique em Salvar insumo.", "");
        break;
      }
    }
  });

  function focusFirst(sel) { var el = wrap.querySelector(sel); if (el) el.focus(); }
  function focusConfirm() { var el = wrap.querySelector(".adm-confirm .adm-btn-danger, .adm-confirm-inline .adm-btn-danger, .adm-btn-danger"); if (el) el.focus({ preventScroll: true }); }

  function addIngredient(path) {
    var input = wrap.querySelector('[data-act="ing-input"][data-path="' + path + '"]');
    var v = input ? input.value.trim() : "";
    if (!v) return;
    var list = getAt(S.draft, path);
    if (!Array.isArray(list)) { setAt(S.draft, path, []); list = getAt(S.draft, path); }
    var ownerO = getAt(S.draft, path.replace(/\.ingredients$/, ""));
    v.split(",").map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean).forEach(function (x) { if (list.indexOf(x) < 0) { if (ownerO) syncDesc(ownerO, null, x); list.push(x); } });
    S.dirty = true; renderMenuKeep();
    var ni = wrap.querySelector('[data-act="ing-input"][data-path="' + path + '"]'); if (ni) ni.focus();
  }

  wrap.addEventListener("keydown", function (ev) {
    var t = ev.target;
    if (t.getAttribute("role") === "tab") {
      var idx = TABS.findIndex(function (x) { return x.id === t.getAttribute("data-tab"); }), n = null;
      if (ev.key === "ArrowRight") n = (idx + 1) % TABS.length;
      else if (ev.key === "ArrowLeft") n = (idx - 1 + TABS.length) % TABS.length;
      else if (ev.key === "Home") n = 0; else if (ev.key === "End") n = TABS.length - 1;
      if (n != null) { ev.preventDefault(); selectTab(TABS[n].id, true); }
      return;
    }
    if (t.getAttribute("data-act") === "fl-ing-input" && ev.key === "Enter") { ev.preventDefault(); addFlIngredient(t.getAttribute("data-fk")); }
    if (t.getAttribute("data-act") === "fl-search" && ev.key === "Enter") ev.preventDefault();
    if (t.getAttribute("data-act") === "ing-input" && ev.key === "Enter") { ev.preventDefault(); addIngredient(t.getAttribute("data-path")); }
    if (ev.key === "Enter" && t.matches && t.matches('[data-act="stock-qty"]')) { ev.preventDefault(); t.blur(); }
    if ((ev.ctrlKey || ev.metaKey) && ev.key === "s" && S.tab === "cardapio" && S.dirty) { ev.preventDefault(); saveMenu(); }
  });

  wrap.addEventListener("input", function (ev) {
    var t = ev.target;
    if (t.getAttribute("data-act") === "order-search") {
      S.orderSearch = t.value;
      clearTimeout(S.searchT); S.searchT = setTimeout(rerenderKeepFocus, 250);
      return;
    }
    if (t.getAttribute("data-act") === "fl-search") {
      S.flQuery = t.value; var q = t.value.trim().toLowerCase(), n = 0, all = wrap.querySelectorAll(".adm-fl");
      all.forEach(function (el) { var hide = q && el.getAttribute("data-search").indexOf(q) < 0; el.hidden = !!hide; if (!hide) n++; });
      var c = wrap.querySelector('[data-role="fl-count"]'); if (c) c.textContent = n + " de " + all.length;
      return;
    }
    if (t.getAttribute("data-act") === "fl-desc") { flRefs(t.getAttribute("data-fk")).forEach(function (r) { r.o.description = t.value; }); markDirty(); return; }
    var path = t.getAttribute("data-path"), type = t.getAttribute("data-type");
    if (!path || !type || type === "bool" || !S.draft) return;
    if (type === "num" || type === "int") {
      var v = num(t.value);
      if (t.value.trim() === "") v = 0;
      if (isNaN(v) || v < 0) { t.setAttribute("aria-invalid", "true"); return; }
      t.removeAttribute("aria-invalid");
      setAt(S.draft, path, type === "int" ? Math.round(v) : r2(v));
    } else setAt(S.draft, path, t.value);
    markDirty();
  });

  wrap.addEventListener("change", function (ev) {
    var t = ev.target;
    var act = t.getAttribute("data-act");
    if (act === "prod-photo") return uploadPhoto(t);
    if (act === "stock-qty") {
      var v = num(t.value), i = Number(t.getAttribute("data-i"));
      if (isNaN(v) || v < 0) { toast("Quantidade inválida.", "err"); t.value = fmtInput(S.stock[i].qty); return; }
      var st = S.stock.map(function (x) { return Object.assign({}, x); }); st[i].qty = v;
      saveStockList(st, "Quantidade de " + st[i].name + " atualizada.").then(rerenderKeepFocus);
      return;
    }
    if (act === "use-prod" || act === "use-opt" || act === "use-qty") {
      readStockForm();
      var u = S.stockEdit.item.uses[Number(t.getAttribute("data-ui"))];
      if (act === "use-prod") { u.productId = t.value; delete u.optionId; rerenderKeepFocus(); }
      else if (act === "use-opt") { if (t.value) u.optionId = t.value; else delete u.optionId; }
      else { var q = num(t.value); u.qty = isNaN(q) ? 0 : q; }
      return;
    }
    if (act === "fl-name") {
      var nv = t.value.trim(); if (!nv) { toast("O sabor precisa de um nome.", "err"); renderMenuKeep(); return; }
      flRefs(t.getAttribute("data-fk")).forEach(function (r) { r.o.name = nv; }); S.dirty = true; renderMenuKeep(); return;
    }
    if (act === "fl-active") { flRefs(t.getAttribute("data-fk")).forEach(function (r) { r.o.active = t.checked; }); S.dirty = true; renderMenuKeep(); return; }
    var path = t.getAttribute("data-path");
    if (!path || !S.draft) return;
    if (t.getAttribute("data-type") === "bool") { setAt(S.draft, path, t.checked); markDirty(); if (/products\.\d+\.(active|featured)$/.test(path) || /\.active$/.test(path)) renderMenuKeep(); return; }
    if (t.hasAttribute("data-rerender-change")) renderMenuKeep();
  });

  async function uploadPhoto(input) {
    var f = input.files && input.files[0]; if (!f) return;
    var i = Number(input.getAttribute("data-i"));
    if (!/^image\//.test(f.type)) return toast("Escolha um arquivo de imagem.", "err");
    toast("Enviando foto…", "");
    try {
      var url = await JR.db.uploadImage(f);
      S.draft.products[i].image = url; S.dirty = true;
      renderMenuKeep(); toast("Foto pronta. Clique em Salvar cardápio.", "ok");
    } catch (e) { toast(e.message || "Falha ao enviar a foto.", "err"); }
  }

  function selectTab(id, focus) {
    if (S.tab === "cardapio") rememberOpenProducts();
    S.tab = id; S.ask = null;
    try { localStorage.setItem("jr_adm_tab", id); } catch (e) { }
    render();
    if (focus) { var t = wrap.querySelector('[data-tab="' + id + '"]'); if (t) t.focus(); }
  }

  function afterRender() {
    if (S.tab === "financeiro") drawCharts();
    if (S.tab === "cardapio" && S.openSecs) wrap.querySelectorAll("details.adm-sec").forEach(function (d, i) { if (S.openSecs[i] != null) d.open = S.openSecs[i]; });
  }

  async function clearExamples() {
    var alsoStock = !!(wrap.querySelector("#adm-clear-stock") || {}).checked;
    try {
      // pedidos de exemplo só existem no modo demonstração (navegador)
      if (JR.mode === "demo") {
        var kept = S.orders.filter(function (o) { return !o.example; });
        try { localStorage.setItem("jr_v1_orders", JSON.stringify(kept)); } catch (e) { }
      }
      S.hideExamples = true;
      try { localStorage.setItem("jr_adm_hide_examples", "1"); } catch (e) { }
      var exp = S.expenses.filter(function (e) { return !e.example; });
      await JR.db.saveExpenses(exp); S.expenses = exp;
      var st = alsoStock ? S.stock.filter(function (s) { return !s.example; }) : S.stock.map(function (s) { var c = Object.assign({}, s); delete c.example; return c; });
      await JR.db.saveStock(st); S.stock = st;
      S.ask = null;
      toast("Dados de exemplo removidos." + (alsoStock ? "" : " A lista de insumos ficou para você ajustar."), "ok");
      await refreshOrders(true);
      render();
    } catch (e) { toast(e.message, "err"); }
  }

  // ---------------------------------------------------------------- sessão
  async function doLogin(form) {
    var fd = new FormData(form);
    var email = String(fd.get("email") || "").trim(), pass = String(fd.get("password") || "");
    if (!email || !pass) { S.loginError = "Informe o e-mail e a senha."; render(); focusFirst(email ? 'input[name="password"]' : 'input[name="email"]'); return; }
    S.busy = true; S.loginError = ""; render();
    var em = wrap.querySelector('input[name="email"]'); if (em) em.value = email;
    try {
      await JR.auth.signIn(email, pass);
      S.busy = false;
      // auth:changed cuida do resto
      if (!S.session) await onSession(await JR.auth.getSession());
    } catch (e) {
      S.busy = false;
      S.loginError = (e && e.message) || "Não foi possível entrar. Tente de novo.";
      render();
      var e2 = wrap.querySelector('input[name="email"]'); if (e2) e2.value = email;
      focusFirst('input[name="password"]');
    }
  }
  async function doLogout() {
    try { await JR.auth.signOut(); } catch (e) { }
    onSession(null);
  }
  var loadingSession = false;
  async function onSession(sess) {
    if (!sess) {
      S.session = null; S.orders = []; S.menu = null; S.draft = null; S.stock = []; S.expenses = []; S.dirty = false; S.stockEdit = null; S.ask = null; S.clip = null; S.ordersSig = "";
      clearInterval(S.pollTimer); S.pollTimer = null;
      S.loginOpen = false; render();
      return;
    }
    if (S.session || loadingSession) return;
    loadingSession = true;
    try {
      var r = await Promise.all([JR.db.listOrders(), JR.db.getMenu(), JR.db.getStock(), JR.db.getExpenses()]);
      S.session = sess;
      S.orders = Array.isArray(r[0]) ? r[0] : [];
      S.menu = r[1]; S.draft = JR.clone(r[1]); S.dirty = false;
      S.stock = Array.isArray(r[2]) ? r[2] : []; S.expenses = Array.isArray(r[3]) ? r[3] : [];
      S.ordersAt = new Date();
      S.loginError = "";
      render();
      clearInterval(S.pollTimer);
      S.pollTimer = setInterval(function () { if (!document.hidden) refreshOrders(false); }, 20000);
    } catch (e) {
      S.session = null; S.loginError = "Entrou, mas não foi possível carregar os dados: " + e.message; S.loginOpen = true; render();
    } finally { loadingSession = false; }
  }

  JR.on("auth:changed", function (sess) { if (sess) onSession(sess); else if (S.session) onSession(null); });
  JR.on("orders:changed", function () { if (S.session) refreshOrders(false); });
  JR.on("menu:changed", function (m) {
    if (!S.session || !m) return;
    S.menu = JR.clone(m);
    if (!S.dirty) { S.draft = JR.clone(m); if (S.tab === "cardapio" && !S.saving) renderMenuKeep(); }
  });
  JR.on("stock:changed", function (v) { if (S.session && Array.isArray(v)) { S.stock = v; } });
  JR.on("expenses:changed", function (v) { if (S.session && Array.isArray(v)) { S.expenses = v; } });
  window.addEventListener("beforeunload", function (e) { if (S.session && S.dirty) { e.preventDefault(); e.returnValue = ""; } });

  render();
  JR.auth.getSession().then(function (sess) { if (sess) onSession(sess); }).catch(function () { });
})();
