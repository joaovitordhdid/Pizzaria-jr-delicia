// Cardápio do cliente: cabeçalho, vitrine, categorias, folha do produto, montador visual da pizza e sacola.
// Publica window.JR.cart (ver CONTRACT.md). JS puro, sem módulos.
(function () {
  "use strict";
  var JR = (window.JR = window.JR || {});
  var doc = document;
  var LS_CART = "jr_v1_cart";
  var reduceMotion = false;
  try { reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { }

  // ---------------------------------------------------------------- util
  function money(n) {
    if (JR.money) return JR.money(n);
    return "R$ " + (Number(n) || 0).toFixed(2).replace(".", ",");
  }
  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  function hash(str) {
    var h = 2166136261;
    str = String(str);
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function qs(sel, root) { return (root || doc).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }
  function fracLabel(n) {
    return n <= 1 ? "inteira" : "1/" + n;
  }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  // ---------------------------------------------------------------- ícones
  var P = {
    bag: '<path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8Z"/><path d="M9 10.5V6.5a3 3 0 0 1 6 0v4"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    moto: '<circle cx="6" cy="17" r="2.6"/><circle cx="18" cy="17" r="2.6"/><path d="M8.6 17h6.8M15 8h2.5l2.2 6.5M3.5 12.5h6l2.2 4.5M11 9h-3"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z"/><circle cx="12" cy="10" r="2.3"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    phone: '<path d="M6.5 3.5h3l1.5 4-2 1.3a10 10 0 0 0 6.2 6.2l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2Z"/>',
    receipt: '<path d="M6 3.5h12v17l-3-1.8-3 1.8-3-1.8-3 1.8v-17Z"/><path d="M9 8.5h6M9 12h6"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    scissors: '<circle cx="6.5" cy="7" r="2.5"/><circle cx="6.5" cy="17" r="2.5"/><path d="M8.6 8.4 19 16M8.6 15.6 19 8"/>',
  };
  function icon(name, cls) {
    return '<svg class="mn-ic ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + P[name] + "</svg>";
  }

  // ---------------------------------------------------------------- ilustração de pizza (SVG gerado a partir dos ingredientes)
  // Cada sabor vira uma fatia do disco; os ingredientes viram coberturas desenhadas.
  var TOPPINGS = [
    { re: /molho|sugo|pelado/, t: "skip" },
    { re: /mu[cç]arela|mussarela|mozzarel|queijo$|^queijo/, t: "skip" },
    { re: /chocolate|brigadeiro|nutella|avela|ovomaltine|prestigio/, t: "skip" },
    { re: /calabres|pepperon|salame|linguic/, t: "pep", n: 10 },
    { re: /cebola/, t: "onion", n: 8 },
    { re: /tomate|tomatinho|cereja/, t: "tom", n: 7 },
    { re: /frango|peru/, t: "chick", n: 16 },
    { re: /catupiry|requeij|cream cheese|cheddar cremoso/, t: "cream", n: 7 },
    { re: /oregano/, t: "herb", n: 26 },
    { re: /manjeric|rucula|espinafre|brocol|pimentao|alface|couve/, t: "leaf", n: 9 },
    { re: /azeitona/, t: "olive", n: 9 },
    { re: /presunto|bacon|lombo|copa|parma/, t: "ham", n: 9 },
    { re: /carne|bife|costela|picanha|mignon|charque|seca|moida|alcatra/, t: "meat", n: 14 },
    { re: /milho|ervilha/, t: "corn", n: 22 },
    { re: /ovo|palmito/, t: "egg", n: 5 },
    { re: /morango|uva|amora/, t: "berry", n: 9 },
    { re: /banana|abacaxi|coco|doce de leite|leite condensado|canela|confeito/, t: "banana", n: 8 },
    { re: /atum|sardinha|anchova|camar|bacalhau/, t: "fish", n: 10 },
    { re: /champig|cogumel|shimeji|shitake/, t: "mush", n: 9 },
    { re: /parmes|provolone|gorgonzola|cheddar|gouda|brie|queijo/, t: "cheese2", n: 8 },
    { re: /alho|batata/, t: "garlic", n: 10 },
  ];
  function toppingOf(ing) {
    var s = norm(ing);
    for (var i = 0; i < TOPPINGS.length; i++) if (TOPPINGS[i].re.test(s)) return TOPPINGS[i];
    return { t: "x" + (hash(s) % 4), n: 8 };
  }
  function baseOf(ings) {
    var n = ings.map(norm).join("|");
    return {
      choco: /chocolate|brigadeiro|nutella|avela|ovomaltine|prestigio/.test(n),
      cheese: /mu[cç]arela|mussarela|mozzarel|queijo|catupiry/.test(n),
      sauce: /molho|sugo|pelado|tomate/.test(n),
    };
  }
  function pt(r, deg) {
    var a = (deg * Math.PI) / 180;
    return [r * Math.cos(a), r * Math.sin(a)];
  }
  function f1(n) { return Math.round(n * 10) / 10; }
  function wedge(r, a0, a1) {
    var p0 = pt(r, a0), p1 = pt(r, a1);
    var large = a1 - a0 > 180 ? 1 : 0;
    return "M0 0L" + f1(p0[0]) + " " + f1(p0[1]) + "A" + r + " " + r + " 0 " + large + " 1 " + f1(p1[0]) + " " + f1(p1[1]) + "Z";
  }
  function blob(r, amp, seed, pts) {
    var rand = rng(seed), k = 3 + Math.floor(rand() * 4), ph = rand() * 6.28, d = "";
    pts = pts || 56;
    for (var i = 0; i <= pts; i++) {
      var th = (i / pts) * 360;
      var rr = r + amp * Math.sin((th * Math.PI) / 180 * k + ph) + amp * 0.5 * Math.sin((th * Math.PI) / 180 * (k + 3));
      var p = pt(rr, th);
      d += (i ? "L" : "M") + f1(p[0]) + " " + f1(p[1]);
    }
    return d + "Z";
  }
  function shape(t, rand) {
    switch (t) {
      case "pep": return '<circle r="8.5" class="t-pep"/><circle r="1.4" cx="-3" cy="-2" class="t-pep2"/><circle r="1.1" cx="2.5" cy="2.6" class="t-pep2"/>';
      case "onion": return '<path d="M-6 0a6 6 0 1 1 3 5.2" class="t-onion"/>';
      case "tom": return '<circle r="7.5" class="t-tom"/><circle r="4.2" class="t-tom2"/><circle r="1" cx="-1.6" cy="-.8" class="t-seed"/><circle r="1" cx="1.6" cy=".9" class="t-seed"/>';
      case "chick": return '<rect x="-5" y="-2.6" width="10" height="5.2" rx="2.4" class="t-chick"/>';
      case "cream": return '<path d="' + blob(6.5, 1.4, Math.floor(rand() * 1e6), 18) + '" class="t-cream"/>';
      case "herb": return '<rect x="-.9" y="-.9" width="1.8" height="1.8" class="t-herb"/>';
      case "leaf": return '<ellipse rx="5.5" ry="2.6" class="t-leaf"/><path d="M-5 0h10" class="t-vein"/>';
      case "olive": return '<circle r="3.6" class="t-olive"/>';
      case "ham": return '<rect x="-5.5" y="-4" width="11" height="8" rx="1.6" class="t-ham"/>';
      case "meat": return '<path d="' + blob(3.4, 0.9, Math.floor(rand() * 1e6), 12) + '" class="t-meat"/>';
      case "corn": return '<circle r="2.3" class="t-corn"/>';
      case "egg": return '<path d="' + blob(7, 1.3, Math.floor(rand() * 1e6), 16) + '" class="t-egg"/><circle r="3.3" class="t-yolk"/>';
      case "berry": return '<path d="M0 5C-5 1-5.5-3-3-4.5c1.4-.8 2.4-.3 3 .6.6-.9 1.6-1.4 3-.6C5.5-3 5 1 0 5Z" class="t-berry"/>';
      case "banana": return '<circle r="6" class="t-banana"/><circle r="2.8" class="t-banana2"/>';
      case "fish": return '<path d="M-6-2.5h12v5h-12z" rx="2" class="t-fish"/>';
      case "mush": return '<path d="M-6 1a6 5 0 0 1 12 0Z" class="t-mush"/><rect x="-1.7" y="1" width="3.4" height="4" rx="1" class="t-mush2"/>';
      case "cheese2": return '<path d="' + blob(5, 1.2, Math.floor(rand() * 1e6), 14) + '" class="t-cheese2"/>';
      case "garlic": return '<ellipse rx="3.6" ry="2.6" class="t-garlic"/>';
      default: return '<circle r="4.2" class="t-' + t + '"/>';
    }
  }
  var pzCount = 0;
  // sectors: [{ key, ingredients: [], removed: [] }]
  function pizzaSVG(sectors, opts) {
    opts = opts || {};
    var n = Math.max(1, sectors.length);
    var R = 84, id = "mnpz" + (++pzCount);
    var slices = opts.slices || 8;
    var fresh = opts.fresh || {};
    var defs = "", body = "", detail = opts.detail !== false;
    var empty = !sectors.length;
    if (empty) sectors = [{ key: "vazio", ingredients: [], removed: [] }];
    sectors.forEach(function (sec, i) {
      var span = 360 / n, a0 = -90 + i * span, a1 = a0 + span;
      var cid = id + "c" + i;
      defs += '<clipPath id="' + cid + '">' + (n === 1 ? '<circle r="' + (R + 1) + '"/>' : '<path d="' + wedge(R + 1, a0, a1) + '"/>') + "</clipPath>";
      var removed = (sec.removed || []).map(norm);
      var ings = (sec.ingredients || []).filter(function (x) { return removed.indexOf(norm(x)) < 0; });
      var base = baseOf(ings);
      var g = '<g clip-path="url(#' + cid + ')" class="pz-sec' + (fresh[sec.key + "@" + i + "/" + n] ? " is-new" : "") + (empty ? " is-empty" : "") + '">';
      if (base.choco) g += '<circle r="' + R + '" class="pz-choco"/>';
      else if (base.sauce || !ings.length) g += '<circle r="' + R + '" class="pz-sauce"/>';
      else g += '<circle r="' + R + '" class="pz-dough"/>';
      if (base.cheese && !base.choco) {
        g += '<path d="' + blob(76, 4, hash(sec.key + "q"), 64) + '" class="pz-cheese"/>';
        if (detail) {
          var rq = rng(hash(sec.key + "spots"));
          for (var s = 0; s < 7; s++) {
            var sp = pt(10 + rq() * 58, rq() * 360);
            g += '<ellipse cx="' + f1(sp[0]) + '" cy="' + f1(sp[1]) + '" rx="' + f1(4 + rq() * 6) + '" ry="' + f1(2 + rq() * 3) + '" class="pz-melt"/>';
          }
        }
      }
      var k = 0;
      ings.forEach(function (ing) {
        var tp = toppingOf(ing);
        if (tp.t === "skip") return;
        var rand = rng(hash(sec.key + "|" + norm(ing)));
        var count = Math.max(detail ? 2 : 1, Math.round(((tp.n || 8) / n) * (detail ? 1 : 0.6)));
        var pad = n === 1 ? 0 : 7;
        for (var c = 0; c < count; c++) {
          var ang = a0 + pad + rand() * (span - pad * 2);
          var rad = 12 + Math.sqrt(rand()) * (R - 22);
          if (n > 1 && rad < 22) rad = 22 + rand() * 10;
          var p = pt(rad, ang);
          g += '<g transform="translate(' + f1(p[0]) + " " + f1(p[1]) + ") rotate(" + Math.round(rand() * 360) + ')"><g class="pz-top" style="--i:' + (k++) + '">' + shape(tp.t, rand) + "</g></g>";
        }
      });
      g += "</g>";
      body += g;
    });
    var cuts = "";
    if (detail) {
      for (var c = 0; c < slices; c++) {
        var e = pt(R, -90 + (c * 360) / slices);
        cuts += '<path d="M0 0L' + f1(e[0]) + " " + f1(e[1]) + '" class="pz-cut"/>';
      }
    }
    var divs = "";
    if (n > 1) {
      for (var d = 0; d < n; d++) {
        var e2 = pt(R + 2, -90 + (d * 360) / n);
        divs += '<path d="M0 0L' + f1(e2[0]) + " " + f1(e2[1]) + '" class="pz-div"/>';
      }
    }
    var crust = '<circle r="97" class="pz-crust"/><circle r="91" class="pz-crust2"/>';
    if (opts.stuffed) {
      for (var b = 0; b < 28; b++) {
        var bp = pt(93.5, (b * 360) / 28);
        crust += '<circle cx="' + f1(bp[0]) + '" cy="' + f1(bp[1]) + '" r="2.6" class="pz-stuff"/>';
      }
    }
    var label = opts.label ? ' role="img" aria-label="' + esc(opts.label) + '"' : ' aria-hidden="true"';
    return '<svg class="mn-pz ' + (opts.cls || "") + '" viewBox="-100 -100 200 200" focusable="false"' + label + "><defs>" + defs + "</defs>" + crust + body + cuts + divs + "</svg>";
  }

  function bottleSVG(name) {
    var s = norm(name);
    var tone = /zero|diet|light/.test(s) ? "zero" : /coca|cola|pepsi/.test(s) ? "cola" : /guarana|soda|sprite|limao/.test(s) ? "green" : /suco|laranja|fanta|uva/.test(s) ? "orange" : /agua/.test(s) ? "water" : "b" + (hash(s) % 3);
    return '<svg class="mn-bottle mn-bottle--' + tone + '" viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
      '<ellipse cx="50" cy="94" rx="20" ry="3.5" class="bt-shadow"/>' +
      '<path d="M43 6h14v6c0 6 9 10 9 22v54a5 5 0 0 1-5 5H39a5 5 0 0 1-5-5V34c0-12 9-16 9-22V6Z" class="bt-body"/>' +
      '<rect x="42" y="3" width="16" height="6" rx="1.5" class="bt-cap"/>' +
      '<rect x="34" y="46" width="32" height="22" class="bt-label"/>' +
      '<path d="M38 50h6M38 55h14" class="bt-mark"/>' +
      '<path d="M39 30c1-6 4-9 5-12" class="bt-shine"/><path d="M39 72v12" class="bt-shine"/>' +
      "</svg>";
  }

  // ---------------------------------------------------------------- dados do cardápio
  var state = { menu: null, query: "", searchOpen: false, activeCat: "" };

  function activeProducts() {
    if (!state.menu) return [];
    return (state.menu.products || []).filter(function (p) { return p && p.active !== false; });
  }
  function activeGroups(p) {
    return (p.groups || []).map(function (g) {
      var opts = (g.options || []).filter(function (o) { return o && o.active !== false; });
      var max = Math.max(1, Number(g.max) || 1);
      var min = Math.min(Math.max(0, Number(g.min) || 0), opts.length, max);
      return { id: g.id, name: g.name, kind: g.kind === "flavor" ? "flavor" : "extra", min: min, max: Math.min(max, Math.max(opts.length, 1)), options: opts };
    }).filter(function (g) { return g.options.length; });
  }
  function findProduct(id) {
    return activeProducts().filter(function (p) { return p.id === id; })[0] || null;
  }
  function productKind(p) {
    var gs = activeGroups(p);
    if (gs.some(function (g) { return g.kind === "flavor"; })) return "pizza";
    var cat = (state.menu.categories || []).filter(function (c) { return c.id === p.categoryId; })[0];
    var s = norm(p.name + " " + (cat ? cat.name : ""));
    if (/pizza|borda|calzone|esfiha|esfirra/.test(s)) return "pizza";
    if (/bebida|refri|coca|guarana|suco|agua|cerveja|lata|litro|\d\s?l\b|ml\b|soda|fanta|sprite|pepsi/.test(s)) return "drink";
    return "pizza";
  }
  function sliceCount(p) {
    if (Number(p.slices) > 0) return Math.min(16, Math.max(2, Math.round(Number(p.slices))));
    var m = /(\d+)\s*fatias?/i.exec((p.description || "") + " " + p.name);
    var n = m ? parseInt(m[1], 10) : 8;
    return Math.min(16, Math.max(4, n));
  }
  function isStuffed(p) { return /borda/i.test(p.name + " " + (p.description || "")); }

  function calcUnit(p, sel) {
    var flavor = [], extras = 0, base = Number(p.price) || 0;
    activeGroups(p).forEach(function (g) {
      (sel[g.id] || []).forEach(function (oid) {
        var o = g.options.filter(function (x) { return x.id === oid; })[0];
        if (!o) return;
        var v = Number(o.price) || 0;
        if (g.kind === "flavor") flavor.push(v); else extras += v;
      });
    });
    if (p.pricing === "max") {
      var top = flavor.length ? Math.max.apply(null, flavor) : 0;
      // sabor sem preço cadastrado (0) cai no preço base do produto
      return round2((top > 0 ? top : base) + extras);
    }
    return round2(base + flavor.reduce(function (a, b) { return a + b; }, 0) + extras);
  }
  function fromPrice(p) {
    var gs = activeGroups(p);
    var sel = {};
    var variable = false;
    gs.forEach(function (g) {
      var prices = g.options.map(function (o) { return Number(o.price) || 0; });
      if (prices.some(function (x) { return x !== prices[0]; }) || g.max > 1 || g.kind === "extra") variable = true;
      if (g.min > 0) {
        var sorted = g.options.slice().sort(function (a, b) { return (Number(a.price) || 0) - (Number(b.price) || 0); });
        sel[g.id] = sorted.slice(0, g.min).map(function (o) { return o.id; });
      }
    });
    var v = calcUnit(p, sel);
    if (p.pricing === "max" && gs.some(function (g) { return g.kind === "flavor" && g.min === 0; })) v = Math.min(v, Number(p.price) || v);
    return { value: v, variable: variable && gs.length > 0 };
  }
  function previewSectors(p, count) {
    var g = activeGroups(p).filter(function (x) { return x.kind === "flavor"; })[0];
    if (!g) return [{ key: p.id, ingredients: ["molho de tomate", "mussarela", "oregano"], removed: [] }];
    var n = Math.min(count || g.max, g.options.length);
    return g.options.slice(0, n).map(function (o) { return { key: o.id, ingredients: o.ingredients || [], removed: [] }; });
  }
  function productArt(p, opts) {
    opts = opts || {};
    if (p.image) {
      return '<img class="mn-photo" src="' + esc(p.image) + '" alt="' + esc(opts.alt || "") + '" loading="lazy" decoding="async" data-fallback="' + esc(p.id) + '"' + (opts.detail === false ? ' data-detail="0"' : "") + ">";
    }
    if (productKind(p) === "drink") return bottleSVG(p.name);
    return pizzaSVG(previewSectors(p, opts.count), { slices: sliceCount(p), stuffed: isStuffed(p), detail: opts.detail !== false, cls: opts.cls });
  }

  // ---------------------------------------------------------------- sacola (JR.cart)
  var listeners = [];
  var items = [];
  (function load() {
    try {
      var raw = localStorage.getItem(LS_CART);
      var arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) arr.forEach(function (it) {
        if (it && it.productId && Number(it.qty) > 0) items.push(normalizeItem(it));
      });
    } catch (e) { }
  })();
  function normalizeItem(it) {
    var qty = Math.max(1, Math.floor(Number(it.qty) || 1));
    var unit = round2(it.unitPrice);
    return {
      productId: it.productId, name: String(it.name || ""), image: it.image || "",
      qty: qty, unitPrice: unit, total: round2(unit * qty),
      choices: Array.isArray(it.choices) ? it.choices : [],
      removed: Array.isArray(it.removed) ? it.removed : [],
      note: String(it.note || ""),
    };
  }
  function sig(it) { return JSON.stringify([it.productId, it.choices, it.removed.slice().sort(), it.note.trim(), it.unitPrice]); }
  function changed() {
    try { localStorage.setItem(LS_CART, JSON.stringify(items)); } catch (e) { }
    listeners.slice().forEach(function (fn) { try { fn(items); } catch (e) { console.error(e); } });
    if (JR.emit) JR.emit("cart:changed", items);
  }
  var cart = {
    items: items,
    add: function (item) {
      var it = normalizeItem(item);
      var s = sig(it);
      for (var i = 0; i < items.length; i++) {
        if (sig(items[i]) === s) {
          items[i].qty += it.qty;
          items[i].total = round2(items[i].unitPrice * items[i].qty);
          changed();
          return i;
        }
      }
      items.push(it);
      changed();
      return items.length - 1;
    },
    update: function (index, patch) {
      var it = items[index];
      if (!it) return;
      Object.assign(it, patch || {});
      items[index] = normalizeItem(it);
      changed();
    },
    remove: function (index) {
      if (index < 0 || index >= items.length) return;
      items.splice(index, 1);
      changed();
    },
    clear: function () { items.length = 0; changed(); },
    count: function () { return items.reduce(function (a, it) { return a + it.qty; }, 0); },
    subtotal: function () { return round2(items.reduce(function (a, it) { return a + it.total; }, 0)); },
    open: function () { openDrawer(); },
    close: function () { closeDrawer(); },
    onChange: function (fn) {
      if (typeof fn !== "function") return function () { };
      listeners.push(fn);
      return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
    },
  };
  JR.cart = cart;

  // ---------------------------------------------------------------- elementos raiz
  var elHeader = doc.getElementById("site-header");
  var elMenu = doc.getElementById("menu-root");
  var elCart = doc.getElementById("cart-root");
  var elFooter = doc.getElementById("site-footer");
  var elNav, elBody, sheetDlg, drawerDlg, bagBtn, toastEl;

  function storeInfo() { return (state.menu && state.menu.store) || {}; }
  function isOpen() { return storeInfo().open !== false; }

  function lockScroll(on) { doc.documentElement.classList.toggle("mn-lock", !!on); }

  // ---------------------------------------------------------------- cabeçalho
  function renderHeader() {
    if (!elHeader) return;
    var st = storeInfo();
    var fee = Number(st.deliveryFee) || 0;
    var min = Number(st.minOrder) || 0;
    var feat = activeProducts().filter(function (p) { return p.featured && productKind(p) === "pizza"; })[0] || activeProducts().filter(function (p) { return productKind(p) === "pizza"; })[0];
    var addr = [st.address, st.city].filter(Boolean).join(" · ");
    var name = st.name || "Pizzaria Jr Delícia";
    var sst = JR.storeStatus ? JR.storeStatus(st) : { state: isOpen() ? "open" : "closed", label: isOpen() ? "Aberto agora" : "Fechado agora", note: "" };
    elHeader.className = "mn-hero" + (isOpen() ? "" : " is-closed");
    elHeader.innerHTML =
      '<div class="mn-hero__inner">' +
        '<div class="mn-hero__text">' +
          '<div class="mn-brand">' +
            '<span class="mn-logo">' + (st.logo ? '<img src="' + esc(st.logo) + '" alt="" width="64" height="64" data-logo>' : "") + '<span class="mn-logo__mono" aria-hidden="true">Jr</span></span>' +
            '<span class="mn-status ' + (sst.state === "open" ? "is-open" : "is-closed") + '"><span class="mn-status__dot" aria-hidden="true"></span>' + esc(sst.label) + "</span>" +
          "</div>" +
          '<h1 class="mn-hero__name">' + esc(name) + "</h1>" +
          (st.slogan ? '<p class="mn-hero__slogan">' + esc(st.slogan) + "</p>" : "") +
          '<ul class="mn-facts">' +
            (st.etaMin ? '<li>' + icon("clock") + '<span><b>' + esc(st.etaMin) + "</b><small>entrega</small></span></li>" : "") +
            '<li>' + icon("moto") + '<span><b>' + (fee > 0 ? money(fee) : "Grátis") + "</b><small>taxa</small></span></li>" +
            (min > 0 ? '<li>' + icon("receipt") + '<span><b>' + money(min) + "</b><small>pedido mínimo</small></span></li>" : "") +
          "</ul>" +
          (addr ? '<p class="mn-hero__addr">' + icon("pin") + "<span>" + esc(addr) + "</span></p>" : "") +
          (st.hours ? '<p class="mn-hero__addr">' + icon("clock") + "<span>" + esc(st.hours) + "</span></p>" : "") +
          (sst.note ? '<p class="mn-hero__addr mn-hero__sched">' + esc(sst.note) + "</p>" : "") +
        "</div>" +
        '<div class="mn-hero__art" aria-hidden="true">' + (feat ? '<div class="mn-hero__disc">' + pizzaSVG(previewSectors(feat), { slices: sliceCount(feat) }) + "</div>" : "") + "</div>" +
      "</div>" +
      '<div class="mn-cloth" aria-hidden="true"></div>';
    var logo = qs("[data-logo]", elHeader);
    if (logo) {
      logo.addEventListener("load", function () { logo.parentNode.classList.add("has-img"); });
      logo.addEventListener("error", function () { logo.remove(); });
      if (logo.complete && logo.naturalWidth) logo.parentNode.classList.add("has-img");
    }
  }

  // ---------------------------------------------------------------- rodapé
  function renderFooter() {
    if (!elFooter) return;
    var st = storeInfo();
    var cfg = window.JR_CONFIG || {};
    var wa = String(st.whatsapp || cfg.whatsapp || "").replace(/\D/g, "");
    var addr = [st.address, st.city].filter(Boolean).join(" · ");
    elFooter.className = "mn-foot";
    elFooter.innerHTML =
      '<div class="mn-foot__inner">' +
        '<div class="mn-foot__brand"><strong>' + esc(st.name || "Pizzaria Jr Delícia") + "</strong>" + (st.slogan ? "<span>" + esc(st.slogan) + "</span>" : "") + "</div>" +
        '<ul class="mn-foot__list">' +
          (addr ? "<li>" + icon("pin") + "<span>" + esc(addr) + "</span></li>" : "") +
          (st.hours ? "<li>" + icon("clock") + "<span>" + esc(st.hours) + "</span></li>" : "") +
          (st.phone ? '<li>' + icon("phone") + '<a href="tel:' + esc(String(st.phone).replace(/[^\d+]/g, "")) + '">' + esc(st.phone) + "</a></li>" : "") +
          (wa ? '<li>' + icon("phone") + '<a href="https://wa.me/' + esc(wa) + '" target="_blank" rel="noopener">WhatsApp</a></li>' : "") +
        "</ul>" +
        '<div class="mn-foot__end"><span>© ' + new Date().getFullYear() + " " + esc(st.name || "Pizzaria Jr Delícia") + '</span><a class="mn-foot__owner" href="#owner-panel">' + icon("lock") + "Área do dono</a></div>" +
      "</div>";
  }

  // ---------------------------------------------------------------- cardápio
  function ensureMenuShell() {
    if (elNav) return;
    elMenu.classList.add("mn-root");
    elMenu.innerHTML = '<nav class="mn-nav" aria-label="Categorias do cardápio"></nav><div class="mn-body"></div>';
    elNav = qs(".mn-nav", elMenu);
    elBody = qs(".mn-body", elMenu);
    sheetDlg = doc.createElement("dialog");
    sheetDlg.className = "mn-dlg mn-dlg--sheet";
    sheetDlg.setAttribute("aria-labelledby", "mn-sheet-title");
    elMenu.appendChild(sheetDlg);
    wireSheet();

    elNav.addEventListener("click", function (e) {
      var b = e.target.closest("[data-cat]");
      if (b) {
        var sec = doc.getElementById("mn-cat-" + b.getAttribute("data-cat"));
        if (sec) {
          setActiveCat(b.getAttribute("data-cat"));
          sec.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        }
        return;
      }
      if (e.target.closest("[data-search-open]")) { state.searchOpen = true; renderNav(); var inp = qs(".mn-search input", elNav); if (inp) inp.focus(); return; }
      if (e.target.closest("[data-search-close]")) { state.searchOpen = false; state.query = ""; renderNav(); renderBody(); var sb = qs("[data-search-open]", elNav); if (sb) sb.focus(); }
    });
    elNav.addEventListener("input", function (e) {
      if (e.target.matches(".mn-search input")) { state.query = e.target.value; renderBody(); }
    });
    elNav.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && e.target.matches(".mn-search input")) { var c = qs("[data-search-close]", elNav); if (c) c.click(); }
    });
    elBody.addEventListener("click", function (e) {
      var quick = e.target.closest("[data-quick]");
      if (quick) { e.stopPropagation(); quickAdd(quick.getAttribute("data-quick"), quick); return; }
      var card = e.target.closest("[data-open]");
      if (card) openSheet(card.getAttribute("data-open"), card);
    });
    // fotos que não carregam (ex.: ainda não enviadas) viram a ilustração gerada
    doc.addEventListener("error", function (e) {
      var t = e.target;
      if (t && t.matches && t.matches("img[data-fallback]")) {
        var p = findProduct(t.getAttribute("data-fallback"));
        var wrap = doc.createElement("span");
        if (p) wrap.innerHTML = productArt(Object.assign({}, p, { image: "" }), { detail: t.getAttribute("data-detail") !== "0" });
        else wrap.innerHTML = pizzaSVG([{ key: t.getAttribute("data-fallback"), ingredients: ["molho", "mussarela", "oregano"], removed: [] }], { detail: false });
        t.replaceWith(wrap.firstChild || doc.createTextNode(""));
      }
    }, true);
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  function categoriesWithProducts() {
    var prods = activeProducts();
    return (state.menu.categories || []).map(function (c) {
      return { cat: c, items: prods.filter(function (p) { return p.categoryId === c.id; }) };
    }).filter(function (x) { return x.items.length; }).concat((function () {
      var ids = (state.menu.categories || []).map(function (c) { return c.id; });
      var orphan = prods.filter(function (p) { return ids.indexOf(p.categoryId) < 0; });
      return orphan.length ? [{ cat: { id: "outros", name: "Outros" }, items: orphan }] : [];
    })());
  }

  function renderNav() {
    if (state.searchOpen) {
      elNav.innerHTML = '<div class="mn-nav__inner mn-search">' + icon("search") +
        '<label class="mn-sr" for="mn-q">Buscar no cardápio</label>' +
        '<input id="mn-q" type="search" placeholder="Buscar sabor, ingrediente, bebida…" autocomplete="off" value="' + esc(state.query) + '">' +
        '<button type="button" class="mn-iconbtn" data-search-close aria-label="Fechar busca">' + icon("close") + "</button></div>";
      return;
    }
    var cats = categoriesWithProducts();
    elNav.innerHTML = '<div class="mn-nav__inner">' +
      '<button type="button" class="mn-iconbtn mn-nav__search" data-search-open aria-label="Buscar no cardápio">' + icon("search") + "</button>" +
      '<div class="mn-chips" role="list">' + cats.map(function (x) {
        return '<button type="button" role="listitem" class="mn-chip' + (state.activeCat === x.cat.id ? " is-active" : "") + '" data-cat="' + esc(x.cat.id) + '"' + (state.activeCat === x.cat.id ? ' aria-current="true"' : "") + ">" + esc(x.cat.name) + "</button>";
      }).join("") + "</div></div>";
  }

  function setActiveCat(id) {
    if (state.activeCat === id) return;
    state.activeCat = id;
    qsa(".mn-chip", elNav).forEach(function (b) {
      var on = b.getAttribute("data-cat") === id;
      b.classList.toggle("is-active", on);
      if (on) {
        b.setAttribute("aria-current", "true");
        var sc = b.parentNode;
        var left = b.offsetLeft - sc.clientWidth / 2 + b.clientWidth / 2;
        try { sc.scrollTo({ left: left, behavior: reduceMotion ? "auto" : "smooth" }); } catch (e) { sc.scrollLeft = left; }
      } else b.removeAttribute("aria-current");
    });
  }
  var ticking = false;
  function onScroll() {
    if (ticking || state.searchOpen) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var line = (elNav ? elNav.getBoundingClientRect().bottom : 0) + 24;
      var secs = qsa(".mn-section", elBody), cur = secs.length ? secs[0].getAttribute("data-cat") : "";
      secs.forEach(function (s) { if (s.getBoundingClientRect().top <= line) cur = s.getAttribute("data-cat"); });
      if (cur) setActiveCat(cur);
    });
  }

  function priceTag(p) {
    var fp = fromPrice(p);
    return '<span class="mn-price">' + (fp.variable ? "<small>a partir de</small>" : "") + "<b>" + money(fp.value) + "</b></span>";
  }
  function needsSheet(p) {
    return activeGroups(p).length > 0;
  }
  function productCard(p) {
    var kind = productKind(p);
    var open = isOpen();
    var quick = !needsSheet(p);
    return '<article class="mn-card mn-card--' + kind + '">' +
      '<button type="button" class="mn-card__hit" data-open="' + esc(p.id) + '" aria-label="' + esc(p.name) + ", " + esc(fromPrice(p).variable ? "a partir de " : "") + money(fromPrice(p).value) + '. Ver opções"></button>' +
      '<div class="mn-card__text">' +
        (p.badge ? '<span class="mn-badge">' + esc(p.badge) + "</span>" : "") +
        "<h3 class=\"mn-card__name\">" + esc(p.name) + "</h3>" +
        (p.description ? '<p class="mn-card__desc">' + esc(p.description) + "</p>" : "") +
        priceTag(p) +
      "</div>" +
      '<div class="mn-card__art">' + productArt(p, { detail: true }) +
        (quick ? '<button type="button" class="mn-add-quick" data-quick="' + esc(p.id) + '" aria-label="Adicionar ' + esc(p.name) + ' à sacola"' + (open ? "" : " disabled") + ">" + icon("plus") + "</button>" : "") +
      "</div>" +
      "</article>";
  }
  function featuredCard(p, i) {
    var kind = productKind(p);
    return '<li class="mn-feat mn-feat--' + kind + '">' +
      '<button type="button" class="mn-feat__btn" data-open="' + esc(p.id) + '">' +
        '<span class="mn-feat__rank" aria-hidden="true">' + String(i + 1).padStart(2, "0") + "</span>" +
        '<span class="mn-feat__art">' + productArt(p) + "</span>" +
        '<span class="mn-feat__text">' +
          (p.badge ? '<span class="mn-badge">' + esc(p.badge) + "</span>" : "") +
          '<span class="mn-feat__name">' + esc(p.name) + "</span>" +
          priceTag(p) +
        "</span>" +
      "</button></li>";
  }

  function searchMatches(q) {
    var nq = norm(q).trim();
    if (!nq) return [];
    var cats = state.menu.categories || [];
    return activeProducts().map(function (p) {
      var cat = cats.filter(function (c) { return c.id === p.categoryId; })[0];
      var hay = norm([p.name, p.description, cat && cat.name].join(" "));
      var hits = [];
      activeGroups(p).forEach(function (g) {
        g.options.forEach(function (o) {
          var t = norm(o.name + " " + (o.ingredients || []).join(" ") + " " + (o.description || ""));
          if (t.indexOf(nq) >= 0 && hits.indexOf(o.name) < 0) hits.push(o.name);
        });
      });
      return { p: p, ok: hay.indexOf(nq) >= 0 || hits.length > 0, hits: hits };
    }).filter(function (x) { return x.ok; });
  }

  function renderBody() {
    if (!elBody) return;
    var html = "";
    if (!isOpen()) {
      var st = storeInfo();
      html += '<div class="mn-closed" role="status">' + icon("clock") + "<div><strong>Estamos fechados agora.</strong><span>Dá para olhar o cardápio à vontade; os pedidos voltam quando o forno acender" + (st.hours ? " (" + esc(st.hours) + ")" : "") + ".</span></div></div>";
    }
    if (state.searchOpen && state.query.trim()) {
      var res = searchMatches(state.query);
      html += '<section class="mn-section mn-results" aria-live="polite"><header class="mn-section__head"><h2>' + plural(res.length, "resultado", "resultados") + "</h2><p>para “" + esc(state.query.trim()) + "”</p></header>";
      if (!res.length) html += '<p class="mn-empty">Nada com esse nome por aqui. Tente “calabresa”, “frango” ou “coca”.</p>';
      else html += '<div class="mn-grid">' + res.map(function (r) {
        var card = productCard(r.p);
        if (r.hits.length) card = card.replace("</h3>", '</h3><p class="mn-hit">Sabor: ' + esc(r.hits.slice(0, 3).join(", ")) + "</p>");
        return card;
      }).join("") + "</div>";
      html += "</section>";
      elBody.innerHTML = html;
      return;
    }
    var feats = activeProducts().filter(function (p) { return p.featured; });
    if (feats.length) {
      html += '<section class="mn-showcase" aria-labelledby="mn-feat-title"><header class="mn-section__head"><h2 id="mn-feat-title">Os mais pedidos</h2><p>Os queridinhos do bairro</p></header>' +
        '<ol class="mn-rail">' + feats.map(featuredCard).join("") + "</ol></section>";
    }
    var groups = categoriesWithProducts();
    if (!groups.length) html += '<p class="mn-empty">O cardápio está sendo preparado. Volte daqui a pouco.</p>';
    groups.forEach(function (x) {
      html += '<section class="mn-section" id="mn-cat-' + esc(x.cat.id) + '" data-cat="' + esc(x.cat.id) + '" aria-labelledby="mn-h-' + esc(x.cat.id) + '">' +
        '<header class="mn-section__head"><h2 id="mn-h-' + esc(x.cat.id) + '">' + esc(x.cat.name) + '</h2><p>' + plural(x.items.length, "opção", "opções") + "</p></header>" +
        '<div class="mn-grid">' + x.items.map(productCard).join("") + "</div></section>";
    });
    elBody.innerHTML = html;
    if (!state.activeCat && groups[0]) state.activeCat = groups[0].cat.id;
  }

  function renderAll() {
    ensureMenuShell();
    renderHeader();
    renderNav();
    renderBody();
    renderFooter();
    renderBag();
    if (sheet && sheetDlg.open) syncSheet();
  }

  // ---------------------------------------------------------------- folha do produto
  var sheet = null; // { productId, sel, removed, note, qty, prevKeys, opener, hint }
  function flavorSectors(p, sel, removed) {
    var out = [];
    activeGroups(p).forEach(function (g) {
      if (g.kind !== "flavor") return;
      (sel[g.id] || []).forEach(function (oid) {
        var o = g.options.filter(function (x) { return x.id === oid; })[0];
        if (o) out.push({ key: o.id, name: o.name, ingredients: o.ingredients || [], removed: removed || [] });
      });
    });
    return out;
  }
  function availableIngredients(p, sel) {
    var list = [];
    flavorSectors(p, sel, []).forEach(function (s) {
      s.ingredients.forEach(function (i) {
        if (!list.some(function (x) { return norm(x) === norm(i); })) list.push(i);
      });
    });
    return list;
  }

  function openSheet(pid, opener) {
    var p = findProduct(pid);
    if (!p) return;
    var sel = {};
    activeGroups(p).forEach(function (g) {
      sel[g.id] = [];
      // grupos obrigatórios com uma única opção já vêm marcados
      if (g.min > 0 && g.options.length === 1) sel[g.id] = [g.options[0].id];
    });
    sheet = { productId: pid, sel: sel, removed: [], note: "", qty: 1, prevKeys: {}, opener: opener || null, hint: {}, fq: "", ff: "all" };
    buildSheet();
    if (!sheetDlg.open) {
      try { sheetDlg.showModal(); } catch (e) { sheetDlg.setAttribute("open", ""); }
    }
    lockScroll(true);
    var x = qs(".mn-x", sheetDlg);
    if (x) x.focus({ preventScroll: true });
    var scr = qs(".mn-sheet__scroll", sheetDlg);
    if (scr) scr.scrollTop = 0;
  }
  function closeSheet() {
    if (sheetDlg && sheetDlg.open) sheetDlg.close();
  }
  function wireSheet() {
    sheetDlg.addEventListener("close", function () {
      lockScroll(drawerDlg && drawerDlg.open);
      if (sheet && sheet.opener && doc.contains(sheet.opener)) { try { sheet.opener.focus({ preventScroll: true }); } catch (e) { } }
      sheet = null;
    });
    sheetDlg.addEventListener("click", function (e) {
      if (e.target === sheetDlg) { closeSheet(); return; }
      if (!sheet) return;
      var t = e.target;
      if (t.closest(".mn-x")) { closeSheet(); return; }
      var ffb = t.closest("[data-ff]");
      if (ffb) {
        sheet.ff = ffb.getAttribute("data-ff");
        qsa("[data-ff]", sheetDlg).forEach(function (b) { b.setAttribute("aria-pressed", String(b === ffb)); });
        applyFlavorFilter();
        return;
      }
      var opt = t.closest("[data-opt]");
      if (opt) { toggleOption(opt.getAttribute("data-group"), opt.getAttribute("data-opt")); return; }
      var chip = t.closest("[data-ing]");
      if (chip) {
        var ing = chip.getAttribute("data-ing");
        var i = sheet.removed.map(norm).indexOf(norm(ing));
        if (i >= 0) sheet.removed.splice(i, 1); else sheet.removed.push(ing);
        refreshSheet(chip);
        return;
      }
      if (t.closest("[data-qty-minus]")) { sheet.qty = Math.max(1, sheet.qty - 1); refreshSheet(t.closest("button")); return; }
      if (t.closest("[data-qty-plus]")) { sheet.qty = Math.min(50, sheet.qty + 1); refreshSheet(t.closest("button")); return; }
      if (t.closest("[data-add]")) { addFromSheet(); }
    });
    sheetDlg.addEventListener("input", function (e) {
      if (sheet && e.target.matches("[data-note]")) sheet.note = e.target.value.slice(0, 200);
      if (sheet && e.target.matches("[data-fq]")) { sheet.fq = e.target.value; applyFlavorFilter(); }
    });
  }
  function toggleOption(gid, oid) {
    var p = findProduct(sheet.productId);
    if (!p) return;
    var g = activeGroups(p).filter(function (x) { return x.id === gid; })[0];
    if (!g) return;
    var cur = sheet.sel[gid] || (sheet.sel[gid] = []);
    var i = cur.indexOf(oid);
    sheet.hint[gid] = "";
    if (i >= 0) cur.splice(i, 1);
    else if (g.max === 1) cur.splice(0, cur.length, oid);
    else if (cur.length >= g.max) sheet.hint[gid] = "Máximo de " + g.max + ". Toque em um escolhido para tirar.";
    else cur.push(oid);
    // remove retiradas de ingredientes que não existem mais
    var avail = availableIngredients(p, sheet.sel).map(norm);
    sheet.removed = sheet.removed.filter(function (r) { return avail.indexOf(norm(r)) >= 0; });
    refreshSheet(qs('[data-group="' + cssEsc(gid) + '"][data-opt="' + cssEsc(oid) + '"]', sheetDlg));
    if (sheet.hint[gid]) {
      var gEl = qs('[data-gid="' + cssEsc(gid) + '"]', sheetDlg);
      shake(gEl);
    }
  }
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, "\\$&"); }
  function shake(el) {
    if (!el || reduceMotion) return;
    el.classList.remove("is-shake");
    void el.offsetWidth;
    el.classList.add("is-shake");
  }
  function unmet(p) {
    return activeGroups(p).filter(function (g) { return (sheet.sel[g.id] || []).length < g.min; });
  }
  function buildSheet() {
    var p = findProduct(sheet.productId);
    if (!p) return;
    var kind = productKind(p);
    var hasFlavor = activeGroups(p).some(function (g) { return g.kind === "flavor"; });
    sheetDlg.innerHTML =
      '<div class="mn-sheet mn-sheet--' + kind + (hasFlavor ? " has-builder" : "") + '">' +
        '<button type="button" class="mn-x mn-iconbtn" aria-label="Fechar">' + icon("close") + "</button>" +
        '<div class="mn-sheet__visual" data-visual></div>' +
        '<div class="mn-sheet__main">' +
          '<div class="mn-sheet__scroll">' +
            '<header class="mn-sheet__head">' +
              (p.badge ? '<span class="mn-badge">' + esc(p.badge) + "</span>" : "") +
              '<h2 id="mn-sheet-title">' + esc(p.name) + "</h2>" +
              (p.description ? "<p>" + esc(p.description) + "</p>" : "") +
            "</header>" +
            '<div data-groups></div>' +
            '<div data-chips></div>' +
            '<div class="mn-note"><label for="mn-note">Alguma observação?</label><textarea id="mn-note" data-note rows="2" maxlength="200" placeholder="Ex.: bem assada, cortar em 12 pedaços"></textarea></div>' +
          "</div>" +
          '<footer class="mn-sheet__foot" data-foot></footer>' +
        "</div>" +
      "</div>";
    refreshSheet(null);
  }
  function syncSheet() {
    var p = findProduct(sheet.productId);
    if (!p) { closeSheet(); return; }
    var gs = activeGroups(p);
    var next = {};
    gs.forEach(function (g) {
      var ids = g.options.map(function (o) { return o.id; });
      next[g.id] = (sheet.sel[g.id] || []).filter(function (id) { return ids.indexOf(id) >= 0; }).slice(0, g.max);
    });
    sheet.sel = next;
    var avail = availableIngredients(p, sheet.sel).map(norm);
    sheet.removed = sheet.removed.filter(function (r) { return avail.indexOf(norm(r)) >= 0; });
    var noteVal = sheet.note;
    var focusKey = doc.activeElement && doc.activeElement.getAttribute && doc.activeElement.getAttribute("data-fk");
    buildSheet();
    var ta = qs("[data-note]", sheetDlg);
    if (ta) ta.value = noteVal;
    if (focusKey) { var f = qs('[data-fk="' + cssEsc(focusKey) + '"]', sheetDlg); if (f) f.focus({ preventScroll: true }); }
  }

  function refreshSheet(focusEl) {
    var p = findProduct(sheet.productId);
    if (!p) { closeSheet(); return; }
    var focusKey = focusEl && focusEl.getAttribute("data-fk");
    var gs = activeGroups(p);
    var kind = productKind(p);
    var sectors = flavorSectors(p, sheet.sel, sheet.removed);
    var unit = calcUnit(p, sheet.sel);
    var missing = unmet(p);
    var open = isOpen();

    // --- visual
    var vis = qs("[data-visual]", sheetDlg);
    var hasFlavor = gs.some(function (g) { return g.kind === "flavor"; });
    var fresh = {};
    var keys = {};
    var n = sectors.length;
    sectors.forEach(function (s, i) {
      var k = s.key + "@" + i + "/" + n;
      keys[k] = 1;
      if (!sheet.prevKeys[k]) fresh[k] = 1;
    });
    var firstPaint = !vis.firstChild;
    sheet.prevKeys = keys;
    var art;
    if (!hasFlavor) art = productArt(p, { alt: p.name });
    else art = pizzaSVG(sectors, { slices: sliceCount(p), stuffed: isStuffed(p), fresh: firstPaint ? {} : fresh, label: sectors.length ? "Sua pizza: " + sectors.map(function (s) { return fracLabel(n) + " " + s.name; }).join(", ") : "Pizza ainda sem sabor" });
    var legend = "";
    if (hasFlavor) {
      legend = '<div class="mn-legend">' +
        '<span class="mn-legend__kicker">Sua pizza · ' + plural(sliceCount(p), "fatia", "fatias") + "</span>" +
        (sectors.length ? '<ol class="mn-legend__list">' + sectors.map(function (s, i) {
          return '<li><span class="mn-frac">' + (n === 1 ? "inteira" : "1/" + n) + "</span><span>" + esc(s.name) + "</span></li>";
        }).join("") + "</ol>" : '<p class="mn-legend__empty">Escolha um sabor e veja a pizza tomar forma.</p>') +
        (sheet.removed.length ? '<p class="mn-legend__minus">Sem ' + esc(sheet.removed.join(", ")) + "</p>" : "") +
        "</div>";
    }
    var discCls = "mn-sheet__disc" + (hasFlavor ? " is-builder" : "") + (hasFlavor && !sectors.length ? " is-empty" : "");
    vis.innerHTML = '<div class="' + discCls + '">' + art + (hasFlavor && !sectors.length ? '<span class="mn-disc-hint" aria-hidden="true">?</span>' : "") + "</div>" + legend;
    if (!firstPaint && Object.keys(fresh).length && !reduceMotion) {
      var disc = qs(".mn-sheet__disc", vis);
      if (disc) disc.classList.add("is-turn");
    }

    // --- grupos
    var gHtml = gs.map(function (g) {
      var cur = sheet.sel[g.id] || [];
      var full = cur.length >= g.max;
      var req = g.min > 0;
      var ok = cur.length >= g.min;
      var rule = g.kind === "flavor"
        ? (g.max > 1 ? (g.min > 1 ? "Escolha de " + g.min + " a " + g.max : "Escolha até " + g.max + " (meio a meio)") : "Escolha 1")
        : (g.max > 1 ? "Escolha até " + g.max : "Escolha 1");
      var prices = g.options.map(function (o) { return Number(o.price) || 0; });
      var uniform = prices.every(function (x) { return x === prices[0]; });
      var showPrice = g.kind === "extra" || p.pricing !== "max" || !uniform;
      var plusSign = g.kind === "extra" || p.pricing !== "max";
      return '<fieldset class="mn-group mn-group--' + g.kind + (ok ? " is-ok" : "") + '" data-gid="' + esc(g.id) + '">' +
        '<legend class="mn-group__head"><span class="mn-group__name">' + esc(g.name) + "</span>" +
          '<span class="mn-group__meta"><span class="mn-group__rule">' + rule + "</span>" +
          '<span class="mn-tag ' + (req ? (ok ? "is-ok" : "is-req") : "") + '">' + (req ? (ok ? icon("check_") + "Pronto" : "Obrigatório") : "Opcional") + "</span>" +
          '<span class="mn-count" aria-hidden="true">' + cur.length + "/" + g.max + "</span></span></legend>" +
        '<p class="mn-group__hint" aria-live="polite">' + esc(sheet.hint[g.id] || "") + "</p>" +
        flavorTools(g) +
        '<div class="mn-opts">' + g.options.map(function (o) {
          var pos = cur.indexOf(o.id);
          var on = pos >= 0;
          var dim = !on && full && g.max > 1;
          var frac = g.kind === "flavor" && on ? fracLabel(cur.length) : "";
          var price = Number(o.price) || 0;
          var thumb = g.kind === "flavor" ? '<span class="mn-opt__thumb">' + pizzaSVG([{ key: o.id, ingredients: o.ingredients || [], removed: [] }], { detail: false }) + "</span>" : '<span class="mn-opt__box" aria-hidden="true">' + icon(g.max === 1 ? "dot_" : "check_") + "</span>";
          var sub = (o.ingredients && o.ingredients.length) ? o.ingredients.join(", ") : (o.description || "");
          return '<button type="button" class="mn-opt' + (on ? " is-on" : "") + (dim ? " is-dim" : "") + (g.max === 1 ? " is-radio" : "") + '" data-group="' + esc(g.id) + '" data-opt="' + esc(o.id) + '" data-sweet="' + (o.sweet ? 1 : 0) + '" data-hay="' + esc(norm(o.name + " " + (o.ingredients || []).join(" ") + " " + (o.description || ""))) + '" data-fk="o:' + esc(g.id) + ":" + esc(o.id) + '" aria-pressed="' + on + '">' +
            thumb +
            '<span class="mn-opt__text"><span class="mn-opt__name">' + esc(o.name) + "</span>" + (sub ? '<span class="mn-opt__sub">' + esc(sub) + "</span>" : "") + "</span>" +
            (frac ? '<span class="mn-frac mn-frac--pop">' + frac + "</span>" : "") +
            (showPrice && (price > 0 || !plusSign) ? '<span class="mn-opt__price">' + (plusSign ? "+ " : "") + money(price) + "</span>" : "") +
            "</button>";
        }).join("") + '</div><p class="mn-opts__none" hidden>Nenhum sabor encontrado. Tente outra palavra.</p></fieldset>';
    }).join("");
    qs("[data-groups]", sheetDlg).innerHTML = gHtml;
    applyFlavorFilter();

    // --- ingredientes
    var ings = availableIngredients(p, sheet.sel);
    var chips = qs("[data-chips]", sheetDlg);
    chips.innerHTML = ings.length ? '<div class="mn-ings"><div class="mn-ings__head"><h3>' + icon("scissors") + "Tirar algum ingrediente?</h3><p>Toque para retirar. Toque de novo para voltar.</p></div>" +
      '<div class="mn-ings__list">' + ings.map(function (i) {
        var off = sheet.removed.map(norm).indexOf(norm(i)) >= 0;
        return '<button type="button" class="mn-ing' + (off ? " is-off" : "") + '" data-ing="' + esc(i) + '" data-fk="i:' + esc(norm(i)) + '" aria-pressed="' + off + '" aria-label="' + (off ? "Sem " : "Com ") + esc(i) + (off ? ". Toque para voltar" : ". Toque para retirar") + '">' + (off ? "sem " : "") + esc(i) + "</button>";
      }).join("") + "</div></div>" : "";

    // --- rodapé
    var foot = qs("[data-foot]", sheetDlg);
    var total = round2(unit * sheet.qty);
    var label, blocked = !open || missing.length > 0;
    if (!open) label = "Loja fechada";
    else if (missing.length) {
      var m = missing[0], left = m.min - (sheet.sel[m.id] || []).length;
      label = m.kind === "flavor" ? "Escolha " + (left === 1 ? "1 sabor" : left + " sabores") : (/^escolha/i.test(m.name) ? m.name.replace(/\s*\(.*\)$/, "") : "Escolha: " + m.name);
    } else label = "Adicionar";
    foot.innerHTML =
      '<div class="mn-step" role="group" aria-label="Quantidade">' +
        '<button type="button" class="mn-step__btn" data-qty-minus data-fk="q-" aria-label="Diminuir quantidade"' + (sheet.qty <= 1 ? " disabled" : "") + ">" + icon("minus") + "</button>" +
        '<output class="mn-step__val" aria-live="polite">' + sheet.qty + "</output>" +
        '<button type="button" class="mn-step__btn" data-qty-plus data-fk="q+" aria-label="Aumentar quantidade">' + icon("plus") + "</button>" +
      "</div>" +
      '<button type="button" class="mn-cta' + (blocked ? " is-blocked" : "") + '" data-add data-fk="add"' + (!open ? " disabled" : "") + (blocked ? ' aria-disabled="true"' : "") + ">" +
        '<span class="mn-cta__label">' + label + "</span>" +
        '<span class="mn-cta__price">' + money(total) + "</span>" +
      "</button>";

    if (focusKey) {
      var f = qs('[data-fk="' + cssEsc(focusKey) + '"]', sheetDlg);
      if (f) f.focus({ preventScroll: true });
    }
  }

  // busca e filtro Salgadas/Doces dentro da lista de sabores
  function flavorTools(g) {
    if (g.kind !== "flavor" || g.options.length < 7) return "";
    var hasSweet = g.options.some(function (o) { return o.sweet; });
    var hasSalty = g.options.some(function (o) { return !o.sweet; });
    var f = sheet.ff || "all";
    var seg = hasSweet && hasSalty ? '<div class="mn-seg" role="group" aria-label="Tipo de sabor">' + [["all", "Todos"], ["salty", "Salgadas"], ["sweet", "Doces"]].map(function (x) {
      return '<button type="button" class="mn-seg__btn" data-ff="' + x[0] + '" data-fk="ff:' + x[0] + '" aria-pressed="' + (f === x[0]) + '">' + x[1] + "</button>";
    }).join("") + "</div>" : "";
    return '<div class="mn-ftools">' +
      '<label class="mn-fsearch">' + icon("search") + '<span class="mn-sr">Buscar sabor</span>' +
      '<input type="search" data-fq data-fk="fq" placeholder="Buscar sabor ou ingrediente" autocomplete="off" value="' + esc(sheet.fq || "") + '"></label>' +
      seg + "</div>";
  }
  function applyFlavorFilter() {
    if (!sheet) return;
    var q = norm(sheet.fq || "").trim(), f = sheet.ff || "all";
    qsa(".mn-group--flavor", sheetDlg).forEach(function (fs) {
      var shown = 0;
      qsa(".mn-opt", fs).forEach(function (b) {
        var sweet = b.getAttribute("data-sweet") === "1";
        var ok = (f === "all" || (f === "sweet") === sweet) && (!q || b.getAttribute("data-hay").indexOf(q) >= 0);
        b.hidden = !ok;
        if (ok) shown++;
      });
      var none = qs(".mn-opts__none", fs);
      if (none) none.hidden = shown > 0;
    });
  }

  function addFromSheet() {
    var p = findProduct(sheet.productId);
    if (!p || !isOpen()) return;
    var missing = unmet(p);
    if (missing.length) {
      var gEl = qs('[data-gid="' + cssEsc(missing[0].id) + '"]', sheetDlg);
      if (gEl) {
        gEl.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
        gEl.classList.add("is-flag");
        shake(gEl);
        var first = qs(".mn-opt", gEl);
        if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, reduceMotion ? 0 : 350);
      }
      return;
    }
    var gs = activeGroups(p);
    var choices = [];
    gs.forEach(function (g) {
      var ids = sheet.sel[g.id] || [];
      if (!ids.length) return;
      var opts = ids.map(function (id) {
        var o = g.options.filter(function (x) { return x.id === id; })[0];
        var out = { id: o.id, name: o.name, price: Number(o.price) || 0 };
        if (g.kind === "flavor") out.fraction = fracLabel(ids.length);
        return out;
      });
      choices.push({ groupId: g.id, groupName: g.name, kind: g.kind, options: opts });
    });
    var unit = calcUnit(p, sheet.sel);
    var note = (qs("[data-note]", sheetDlg) || {}).value || sheet.note || "";
    cart.add({
      productId: p.id, name: p.name, image: p.image || "", qty: sheet.qty, unitPrice: unit,
      choices: choices, removed: sheet.removed.slice(), note: note.trim(),
    });
    var name = p.name;
    closeSheet();
    toast(name + " foi para a sacola");
  }

  function quickAdd(pid, btn) {
    var p = findProduct(pid);
    if (!p || !isOpen()) return;
    cart.add({ productId: p.id, name: p.name, image: p.image || "", qty: 1, unitPrice: calcUnit(p, {}), choices: [], removed: [], note: "" });
    if (btn && !reduceMotion) { btn.classList.remove("is-pop"); void btn.offsetWidth; btn.classList.add("is-pop"); }
    toast(p.name + " foi para a sacola");
  }

  // ---------------------------------------------------------------- sacola: botão, gaveta, aviso
  function ensureCartShell() {
    if (bagBtn) return;
    elCart.classList.add("mn-cart");
    elCart.innerHTML =
      '<button type="button" class="mn-bag" hidden aria-haspopup="dialog">' +
        '<span class="mn-bag__icon">' + icon("bag") + '<span class="mn-bag__count" data-count>0</span></span>' +
        '<span class="mn-bag__label">Ver sacola</span>' +
        '<span class="mn-bag__total" data-total></span>' +
      "</button>" +
      '<div class="mn-toast" role="status" aria-live="polite"></div>';
    bagBtn = qs(".mn-bag", elCart);
    toastEl = qs(".mn-toast", elCart);
    drawerDlg = doc.createElement("dialog");
    drawerDlg.className = "mn-dlg mn-dlg--drawer";
    drawerDlg.setAttribute("aria-labelledby", "mn-drawer-title");
    elCart.appendChild(drawerDlg);
    bagBtn.addEventListener("click", openDrawer);
    drawerDlg.addEventListener("close", function () {
      lockScroll(sheetDlg && sheetDlg.open);
    });
    drawerDlg.addEventListener("click", function (e) {
      if (e.target === drawerDlg) { closeDrawer(); return; }
      var t = e.target;
      if (t.closest("[data-close-drawer]")) { closeDrawer(); return; }
      var row = t.closest("[data-idx]");
      var idx = row ? parseInt(row.getAttribute("data-idx"), 10) : -1;
      if (t.closest("[data-inc]")) { cart.update(idx, { qty: items[idx].qty + 1 }); focusAfter('[data-idx="' + idx + '"] [data-inc]'); return; }
      if (t.closest("[data-dec]")) { if (items[idx].qty > 1) cart.update(idx, { qty: items[idx].qty - 1 }); focusAfter('[data-idx="' + idx + '"] [data-dec]'); return; }
      if (t.closest("[data-del]")) { cart.remove(idx); focusAfter(items.length ? '[data-idx="' + Math.min(idx, items.length - 1) + '"] [data-del]' : "[data-close-drawer]"); return; }
      if (t.closest("[data-keep]")) { closeDrawer(); return; }
      if (t.closest("[data-checkout]")) {
        if (!items.length || !isOpen() || belowMin()) return;
        closeDrawer();
        if (JR.checkout && typeof JR.checkout.open === "function") JR.checkout.open();
        else toast("A finalização ainda não está disponível. Tente de novo em instantes.");
      }
    });
    cart.onChange(function () { renderBag(); if (drawerDlg.open) renderDrawer(); });
  }
  function focusAfter(sel) {
    var el = qs(sel, drawerDlg);
    if (el && !el.disabled) el.focus({ preventScroll: true });
    else { var c = qs("[data-close-drawer]", drawerDlg); if (c) c.focus({ preventScroll: true }); }
  }
  function belowMin() {
    var min = Number(storeInfo().minOrder) || 0;
    return min > 0 && cart.subtotal() < min;
  }
  var lastCount = null;
  function renderBag() {
    ensureCartShell();
    var c = cart.count();
    bagBtn.hidden = c === 0;
    doc.documentElement.classList.toggle("mn-has-bag", c > 0);
    qs("[data-count]", bagBtn).textContent = c;
    qs("[data-total]", bagBtn).textContent = money(cart.subtotal());
    bagBtn.setAttribute("aria-label", "Ver sacola: " + plural(c, "item", "itens") + ", " + money(cart.subtotal()));
    if (lastCount !== null && c > lastCount && !reduceMotion) {
      bagBtn.classList.remove("is-bump"); void bagBtn.offsetWidth; bagBtn.classList.add("is-bump");
    }
    lastCount = c;
  }
  function itemArt(it) {
    var p = (state.menu && (state.menu.products || []).filter(function (x) { return x.id === it.productId; })[0]) || null;
    var flavors = [];
    (it.choices || []).forEach(function (ch) {
      if (ch.kind !== "flavor") return;
      ch.options.forEach(function (o) {
        var ings = [];
        if (p) (p.groups || []).forEach(function (g) { (g.options || []).forEach(function (x) { if (x.id === o.id) ings = x.ingredients || []; }); });
        flavors.push({ key: o.id, ingredients: ings, removed: it.removed || [] });
      });
    });
    if (flavors.length) return pizzaSVG(flavors, { detail: false });
    if (it.image) return '<img class="mn-photo" src="' + esc(it.image) + '" alt="" loading="lazy" data-detail="0" data-fallback="' + esc(it.productId) + '">';
    if (p && productKind(p) === "drink") return bottleSVG(p.name);
    if (!p && /coca|guaran|refri|suco|agua|litro/i.test(norm(it.name))) return bottleSVG(it.name);
    return pizzaSVG([{ key: it.productId, ingredients: ["molho", "mussarela", "oregano"], removed: [] }], { detail: false, stuffed: /borda/i.test(it.name) });
  }
  function itemDetails(it) {
    var lines = [];
    (it.choices || []).forEach(function (ch) {
      var names = ch.options.map(function (o) {
        return (ch.kind === "flavor" && ch.options.length > 1 ? (o.fraction || "1/" + ch.options.length) + " " : "") + o.name;
      });
      lines.push('<span class="mn-line__opt">' + esc(names.join(" · ")) + "</span>");
    });
    if (it.removed && it.removed.length) lines.push('<span class="mn-line__minus">Sem ' + esc(it.removed.join(", ")) + "</span>");
    if (it.note) lines.push('<span class="mn-line__note">“' + esc(it.note) + "”</span>");
    return lines.join("");
  }
  function renderDrawer() {
    var st = storeInfo();
    var fee = Number(st.deliveryFee) || 0;
    var min = Number(st.minOrder) || 0;
    var sub = cart.subtotal();
    var c = cart.count();
    var blocked = !c || !isOpen() || belowMin();
    var html = '<div class="mn-drawer">' +
      '<header class="mn-drawer__head"><div><h2 id="mn-drawer-title">Sua sacola</h2><p>' + (c ? plural(c, "item", "itens") : "vazia por enquanto") + "</p></div>" +
      '<button type="button" class="mn-iconbtn" data-close-drawer aria-label="Fechar sacola">' + icon("close") + "</button></header>";
    if (!items.length) {
      html += '<div class="mn-drawer__empty">' + pizzaSVG([], { detail: false }) + "<p>Sua sacola está vazia.</p>" +
        '<button type="button" class="mn-ghost" data-keep>Ver o cardápio</button></div>';
    } else {
      html += '<ul class="mn-lines">' + items.map(function (it, i) {
        return '<li class="mn-line" data-idx="' + i + '">' +
          '<span class="mn-line__art">' + itemArt(it) + "</span>" +
          '<div class="mn-line__body"><div class="mn-line__top"><strong>' + esc(it.name) + "</strong><span class=\"mn-line__price\">" + money(it.total) + "</span></div>" +
            itemDetails(it) +
            '<div class="mn-line__ctrl">' +
              '<div class="mn-step mn-step--sm" role="group" aria-label="Quantidade de ' + esc(it.name) + '">' +
                '<button type="button" class="mn-step__btn" data-dec aria-label="Diminuir"' + (it.qty <= 1 ? " disabled" : "") + ">" + icon("minus") + "</button>" +
                '<output class="mn-step__val">' + it.qty + "</output>" +
                '<button type="button" class="mn-step__btn" data-inc aria-label="Aumentar">' + icon("plus") + "</button>" +
              "</div>" +
              (it.qty > 1 ? '<span class="mn-line__unit">' + money(it.unitPrice) + " cada</span>" : "") +
              '<button type="button" class="mn-iconbtn mn-line__del" data-del aria-label="Remover ' + esc(it.name) + '">' + icon("trash") + "</button>" +
            "</div>" +
          "</div></li>";
      }).join("") + "</ul>" +
      '<footer class="mn-drawer__foot">' +
        '<dl class="mn-sum"><div><dt>Subtotal</dt><dd>' + money(sub) + "</dd></div>" +
        "<div><dt>Entrega</dt><dd>" + (fee > 0 ? money(fee) : "Grátis") + "</dd></div></dl>" +
        (min > 0 && sub < min ? '<p class="mn-warn">Faltam ' + money(min - sub) + " para o pedido mínimo de " + money(min) + ".</p>" : "") +
        (!isOpen() ? '<p class="mn-warn">A loja está fechada agora. Seu pedido fica guardado aqui.</p>' : "") +
        '<button type="button" class="mn-cta" data-checkout' + (blocked ? " disabled" : "") + '><span class="mn-cta__label">Finalizar pedido</span><span class="mn-cta__price">' + money(sub) + "</span></button>" +
        '<button type="button" class="mn-ghost" data-keep>Continuar escolhendo</button>' +
      "</footer>";
    }
    html += "</div>";
    drawerDlg.innerHTML = html;
  }
  function openDrawer() {
    ensureCartShell();
    if (sheetDlg && sheetDlg.open) closeSheet();
    renderDrawer();
    if (!drawerDlg.open) { try { drawerDlg.showModal(); } catch (e) { drawerDlg.setAttribute("open", ""); } }
    lockScroll(true);
    var b = qs("[data-close-drawer]", drawerDlg);
    if (b) b.focus({ preventScroll: true });
  }
  function closeDrawer() {
    if (drawerDlg && drawerDlg.open) drawerDlg.close();
    if (bagBtn && !bagBtn.hidden) try { bagBtn.focus({ preventScroll: true }); } catch (e) { }
  }
  var toastTimer;
  function toast(msg) {
    ensureCartShell();
    toastEl.innerHTML = '<span class="mn-toast__in">' + icon("check_") + esc(msg) + "</span>";
    toastEl.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-on"); }, 2600);
  }
  P.check_ = '<path d="m5 12.5 4.5 4.5L19 7.5"/>';
  P.dot_ = '<circle cx="12" cy="12" r="4" class="mn-fill"/>';

  // ---------------------------------------------------------------- início
  async function init() {
    ensureMenuShell();
    ensureCartShell();
    renderBag();
    elBody.innerHTML = '<div class="mn-loading" role="status">' + pizzaSVG([], { detail: false }) + "<span>Esquentando o forno…</span></div>";
    try {
      if (!JR.db || !JR.db.getMenu) throw new Error("Camada de dados indisponível");
      state.menu = await JR.db.getMenu();
    } catch (e) {
      console.error(e);
      state.menu = window.JR_SEED ? JSON.parse(JSON.stringify(window.JR_SEED)) : { store: {}, categories: [], products: [] };
    }
    if (!state.menu || typeof state.menu !== "object") state.menu = { store: {}, categories: [], products: [] };
    renderAll();
    if (JR.on) JR.on("menu:changed", function (m) {
      if (!m) return;
      state.menu = m;
      renderAll();
    });
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
  else init();
})();
