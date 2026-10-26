// DADOS DE EXEMPLO do painel do dono (modo demonstração).
// Tudo aqui tem `example: true` e pode ser apagado pelo próprio painel ("Limpar exemplos").
// Usa os ids de produtos de data.js de forma defensiva: só cria vínculos/itens para produtos que existem.
(function () {
  var seed = window.JR_SEED || { products: [] };
  var products = Array.isArray(seed.products) ? seed.products : [];
  function prod(id) { for (var i = 0; i < products.length; i++) if (products[i].id === id) return products[i]; return null; }
  function flavorGroup(p) { return p && (p.groups || []).filter(function (g) { return g.kind === "flavor"; })[0] || null; }
  // Vínculo de consumo por produto (só se o produto existir)
  function useP(pid, qty) { return prod(pid) ? [{ productId: pid, qty: qty }] : []; }
  // Vínculo por ingrediente: todo sabor (em cada tamanho) que leva o ingrediente gasta qtyBySize
  function useIng(re, qtyBySize) {
    var out = [];
    Object.keys(qtyBySize).forEach(function (pid) {
      var g = flavorGroup(prod(pid)); if (!g) return;
      (g.options || []).forEach(function (o) {
        if ((o.ingredients || []).some(function (i) { return re.test(i); })) out.push({ productId: pid, optionId: o.id, qty: qtyBySize[pid] });
      });
    });
    return out;
  }
  function cat() { return [].concat.apply([], arguments); }
  var SZ = { "pizza-media": 1, "pizza-grande": 1.35, "pizza-grande-3": 1.5 };
  function perSize(base) { var o = {}; Object.keys(SZ).forEach(function (k) { o[k] = Math.round(base * SZ[k] * 1000) / 1000; }); return o; }
  function usePizza(base) { var out = []; Object.keys(SZ).forEach(function (k) { out = out.concat(useP(k, Math.round(base * SZ[k] * 1000) / 1000)); }); return out; }

  window.JR_SEED_STOCK = [
    { id: "ex-farinha", name: "Farinha de trigo", unit: "kg", qty: 42, min: 15, cost: 4.2, uses: usePizza(0.22), example: true },
    { id: "ex-mussarela", name: "Mussarela", unit: "kg", qty: 6.5, min: 8, cost: 38.9, uses: usePizza(0.2), example: true },
    { id: "ex-molho", name: "Molho de tomate", unit: "kg", qty: 9, min: 5, cost: 9.5, uses: usePizza(0.12), example: true },
    { id: "ex-calabresa", name: "Calabresa", unit: "kg", qty: 4.2, min: 3, cost: 27.9, uses: useIng(/^calabresa$/i, perSize(0.15)), example: true },
    { id: "ex-frango", name: "Frango desfiado", unit: "kg", qty: 1.8, min: 3, cost: 22.5, uses: useIng(/frango/i, perSize(0.15)), example: true },
    { id: "ex-catupiry", name: "Catupiry", unit: "kg", qty: 2.4, min: 2, cost: 34.0, uses: useIng(/catupiry/i, perSize(0.08)), example: true },
    { id: "ex-bacon", name: "Bacon", unit: "kg", qty: 2.1, min: 1.5, cost: 39.9, uses: useIng(/bacon/i, perSize(0.1)), example: true },
    { id: "ex-presunto", name: "Presunto", unit: "kg", qty: 3.2, min: 2, cost: 29.9, uses: useIng(/presunto/i, perSize(0.1)), example: true },
    { id: "ex-tomate", name: "Tomate", unit: "kg", qty: 3, min: 2, cost: 7.9, uses: useIng(/^tomate( fatiado)?$/i, perSize(0.08)), example: true },
    { id: "ex-cebola", name: "Cebola", unit: "kg", qty: 4, min: 2, cost: 5.5, uses: useIng(/^cebola$/i, perSize(0.05)), example: true },
    { id: "ex-oregano", name: "Orégano", unit: "kg", qty: 0.8, min: 0.3, cost: 60, uses: usePizza(0.004), example: true },
    { id: "ex-oleo", name: "Óleo de soja", unit: "L", qty: 9, min: 4, cost: 8.5, uses: usePizza(0.02), example: true },
    { id: "ex-caixa-media", name: "Caixa de pizza média", unit: "un", qty: 85, min: 50, cost: 1.9, uses: cat(useP("pizza-media", 1)), example: true },
    { id: "ex-caixa-grande", name: "Caixa de pizza grande", unit: "un", qty: 34, min: 60, cost: 2.3, uses: cat(useP("pizza-grande", 1), useP("pizza-grande-3", 1)), example: true },
    { id: "ex-coca", name: "Coca-Cola 1L", unit: "un", qty: 24, min: 12, cost: 5.8, uses: useP("coca-1l", 1), example: true },
    { id: "ex-coca-zero", name: "Coca-Cola Zero 1L", unit: "un", qty: 10, min: 12, cost: 5.8, uses: useP("coca-zero-1l", 1), example: true },
    { id: "ex-guarana", name: "Guaraná Antarctica 1L", unit: "un", qty: 18, min: 12, cost: 4.6, uses: useP("guarana-1l", 1), example: true },
    { id: "ex-gas", name: "Gás de cozinha (P13)", unit: "un", qty: 1, min: 1, cost: 115, uses: [], example: true },
  ];

  // ---------- despesas do mês ----------
  var now = new Date();
  function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function dayOfMonth(n) { var d = new Date(now.getFullYear(), now.getMonth(), Math.min(n, now.getDate())); return ymd(d); }
  window.JR_SEED_EXPENSES = [
    { id: "ex-desp-1", date: dayOfMonth(1), description: "Aluguel do salão", category: "aluguel", amount: 1200, example: true },
    { id: "ex-desp-2", date: dayOfMonth(3), description: "Compra no atacado (farinha, molho, queijo)", category: "insumos", amount: 1380.5, example: true },
    { id: "ex-desp-3", date: dayOfMonth(5), description: "2 botijões de gás P13", category: "gas", amount: 230, example: true },
    { id: "ex-desp-4", date: dayOfMonth(5), description: "Pagamento motoboy (quinzena)", category: "funcionarios", amount: 650, example: true },
    { id: "ex-desp-5", date: dayOfMonth(8), description: "Caixas de pizza e sacolas", category: "embalagem", amount: 280, example: true },
    { id: "ex-desp-6", date: dayOfMonth(12), description: "Conta de energia", category: "outros", amount: 286.4, example: true },
  ];

  // ---------- ~60 pedidos dos últimos 30 dias ----------
  var s = 20261026;
  function rnd() { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }
  var nomes = ["Ana Paula Souza", "Carlos Henrique Lima", "Mariana Oliveira", "João Pedro Santos", "Fernanda Costa", "Rafael Almeida", "Juliana Ribeiro", "Lucas Ferreira", "Patrícia Gomes", "Bruno Martins", "Camila Rocha", "Diego Carvalho", "Larissa Mendes", "Thiago Barbosa", "Aline Pereira"];
  var ruas = ["Rua das Flores", "Av. Brasil", "Rua São João", "Rua Sete de Setembro", "Rua Tiradentes", "Av. Getúlio Vargas", "Rua XV de Novembro"];
  var bairros = ["Centro", "Jardim América", "Vila Nova", "São José", "Santa Cruz"];
  var pizzas = ["pizza-media", "pizza-grande", "pizza-grande-3"].map(prod).filter(Boolean);
  var bebidas = ["coca-1l", "coca-zero-1l", "guarana-1l"].map(prod).filter(Boolean);
  var fee = Number(seed.store && seed.store.deliveryFee) || 5;
  var hoursWeighted = [18, 19, 19, 20, 20, 20, 20, 21, 21, 21, 22, 22, 23, 17, 12];
  var r2 = function (n) { return Math.round(n * 100) / 100; };

  function pizzaItem(p) {
    var g = flavorGroup(p);
    var opts = g ? (g.options || []).filter(function (o) { return o.active !== false; }) : [];
    var n = opts.length ? Math.max(1, Math.min(g.max || 1, 1 + Math.floor(rnd() * (g.max || 1)))) : 0;
    var chosen = [];
    for (var i = 0; i < n; i++) { var o = pick(opts); if (chosen.indexOf(o) < 0) chosen.push(o); }
    var unit = p.price;
    if (p.pricing === "max" && chosen.length) unit = Math.max.apply(null, chosen.map(function (o) { return Number(o.price) || 0; })) || p.price;
    var removed = rnd() < 0.2 && chosen[0] && chosen[0].ingredients && chosen[0].ingredients.length ? [pick(chosen[0].ingredients)] : [];
    return {
      productId: p.id, name: p.name, image: "", qty: 1, unitPrice: unit, total: unit,
      choices: g ? [{ groupId: g.id, groupName: g.name, kind: "flavor", options: chosen.map(function (o) { return { id: o.id, name: o.name, price: o.price }; }) }] : [],
      removed: removed, note: "",
    };
  }
  function drinkItem(p) {
    var q = rnd() < 0.25 ? 2 : 1;
    return { productId: p.id, name: p.name, image: "", qty: q, unitPrice: p.price, total: r2(p.price * q), choices: [], removed: [], note: "" };
  }

  var orders = [];
  var total = 60;
  for (var k = 0; k < total; k++) {
    var daysAgo = Math.floor(rnd() * 30) + 1; // ontem até 30 dias atrás
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, pick(hoursWeighted), Math.floor(rnd() * 60));
    var items = [];
    if (pizzas.length) {
      items.push(pizzaItem(pick(pizzas)));
      if (rnd() < 0.3) items.push(pizzaItem(pick(pizzas)));
    }
    if (bebidas.length && rnd() < 0.65) items.push(drinkItem(pick(bebidas)));
    if (!items.length) continue;
    var entrega = rnd() < 0.8;
    var subtotal = r2(items.reduce(function (a, it) { return a + it.total; }, 0));
    var dfee = entrega ? fee : 0;
    var method = pick(["pix", "pix", "pix", "cartao", "cartao", "dinheiro"]);
    var tot = r2(subtotal + dfee);
    var nome = pick(nomes);
    var cpf = String(10000000000 + Math.floor(rnd() * 89999999999)).slice(0, 11);
    orders.push({
      id: "ex-ord-" + (k + 1), code: "EX" + String(1000 + k), example: true,
      created_at: d.toISOString(), status: rnd() < 0.05 ? "cancelado" : "entregue", stock_applied: true,
      customer: {
        name: nome, cpf: cpf, phone: "(11) 9" + String(1000 + Math.floor(rnd() * 8999)) + "-" + String(1000 + Math.floor(rnd() * 8999)), email: "",
        address: entrega ? { street: pick(ruas), number: String(10 + Math.floor(rnd() * 990)), complement: "", district: pick(bairros), city: "São Paulo", reference: "", lat: null, lng: null, accuracy: null } : null,
      },
      fulfillment: entrega ? "entrega" : "retirada",
      items: items,
      totals: { subtotal: subtotal, deliveryFee: dfee, discount: 0, total: tot },
      payment: { method: method, changeFor: method === "dinheiro" ? Math.ceil(tot / 50) * 50 : null, status: "pago" },
      invoice: { status: "simulada", provider: "simulado", number: String(500 + k), series: "1", key: "", url: "", issued_at: d.toISOString(), message: "Exemplo sem valor fiscal" },
    });
  }
  orders.sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
  window.JR_SEED_ORDERS = orders;
})();
