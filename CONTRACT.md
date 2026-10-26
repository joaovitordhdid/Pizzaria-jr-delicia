# Contrato entre os módulos (leia antes de editar)

Site estático em `public/` (HTML + CSS + JS puro, sem build, sem framework). Hospedagem: Vercel. Funções serverless em `api/`.
Idioma de toda interface: português do Brasil. Público: clientes no celular (mobile-first, 360–430px) e o dono no celular ou PC.

## Ordem de carregamento (public/index.html, não renomear)
supabase-js UMD → Chart.js 4 UMD (global `Chart`) → `config.js` (`JR_CONFIG`) → `js/data.js` (`JR_SEED`) → `js/seed-admin.js` (`JR_SEED_STOCK`, `JR_SEED_EXPENSES`, `JR_SEED_ORDERS`) → `js/store.js` (`JR`) → `js/app.js` → `js/nfce.js` → `js/checkout.js` → `js/admin.js`.
Cada arquivo é um IIFE que só adiciona ao objeto global `window.JR`. Não use módulos ES nem bundler.

## Donos dos arquivos
- Design (cardápio): `css/style.css`, `js/app.js`, marcação dentro de `#site-header`, `#menu-root`, `#cart-root`, `#site-footer` (geradas por JS). Pode ajustar valores em `css/tokens.css` (nunca renomear tokens).
- Pagamento: `css/checkout.css`, `js/checkout.js`, `js/nfce.js`, `api/nfce.js`. Renderiza dentro de `#checkout-root`.
- Painel: `css/admin.css`, `js/admin.js`, `js/seed-admin.js`. Renderiza dentro de `#owner-panel` (fica no fim da página).
- Coordenação (não editar sem combinar): `index.html`, `config.js`, `js/store.js`, `js/data.js`, `css/tokens.css` (nomes), `supabase/schema.sql`.

Escopo de CSS: prefixe seletores com o container (`#checkout-root ...`, `#owner-panel ...`) ou com prefixo de classe (`.ck-`, `.adm-`, design usa `.mn-`). Use só os tokens `--jr-*` para cor/fonte.

## Dados (`JR_SEED` = formato do cardápio, salvo como `menu`)
```js
{
  store: { name, slogan, logo, phone, whatsapp, address, city, hours: "texto", deliveryFee: number, minOrder: number, etaMin: "40–60 min", open: true },
  categories: [{ id, name }],
  products: [{
    id, categoryId, name, description, price /* "a partir de" */, image /* url ou "" */,
    active: true, featured: bool, badge: "" /* ex: "Mais pedido" */,
    pricing: "max" | "sum",   // "max": preço = maior preço entre os sabores escolhidos + extras; "sum": price + soma das opções
    groups: [{
      id, name, min, max, kind: "flavor" | "extra",
      options: [{ id, name, description, ingredients: ["mussarela", ...], price, active: true }]
    }]
  }]
}
```
Preço de uma pizza com pricing "max": max(preço dos sabores escolhidos) + soma dos extras (kind "extra"). Opções/produtos com `active:false` não aparecem para o cliente. Ingredientes podem ser retirados pelo cliente (lista `removed` no item).

## API `window.JR` (de store.js)
- `JR.mode` = "demo" | "supabase"; `JR.demoUser` = {email,password} no modo demo.
- `JR.money(n)` → "R$ 49,99"; `JR.uid(prefix)`; `JR.clone(o)`; `JR.on(evt, fn)`; `JR.emit(evt, payload)`.
- `JR.db.getMenu()`, `saveMenu(menu)`, `resetMenu()` — eventos `menu:changed`.
- `JR.db.getStock()`, `saveStock(items)`; `getExpenses()`, `saveExpenses(items)`.
- `JR.db.createOrder(order)` → order completo com `id`, `code`, `created_at`, `status:"novo"`; `listOrders()`; `updateOrder(id, patch)` — evento `orders:changed`.
- `JR.db.uploadImage(file)` → url.
- `JR.auth.getSession()`, `signIn(email, senha)` (lança Error com mensagem em pt-BR), `signOut()` — evento `auth:changed`.
Todas assíncronas.

## Carrinho (app.js publica `JR.cart`)
```js
JR.cart = { items: [], add(item), update(index, patch), remove(index), clear(), count(), subtotal(), open(), close(), onChange(fn) }
item = { productId, name, image, qty, unitPrice, total, choices: [{ groupId, groupName, kind, options: [{ id, name, price }] }], removed: ["cebola"], note: "" }
```
O botão "Finalizar pedido" da sacola chama `JR.checkout.open()`.

## Checkout (checkout.js publica `JR.checkout`)
`JR.checkout.open()` mostra o fluxo usando `JR.cart.items`. Ao concluir: `JR.db.createOrder(order)`, emite nota via `JR.nfce.emit(order)`, salva `invoice` com `JR.db.updateOrder` (no modo Supabase o cliente não pode atualizar; então emita ANTES de criar o pedido e grave `invoice` junto), limpa o carrinho, mostra confirmação.
```js
order = {
  customer: { name, cpf, phone, email, address: { street, number, complement, district, city, reference, lat, lng, accuracy } },
  fulfillment: "entrega" | "retirada",
  items: [/* itens do carrinho */],
  totals: { subtotal, deliveryFee, discount, total },
  payment: { method: "pix" | "cartao" | "dinheiro", changeFor: number|null, status: "pendente" },
  invoice: { status: "simulada" | "autorizada" | "pendente" | "erro", provider, number, series, key, url, issued_at, message }
}
```
`JR.nfce.emit(order)` → Promise<invoice>. `JR.nfce.render(invoice, order)` → HTML do cupom (DANFE NFC-e simplificado).

## Painel (admin.js)
Status de pedido: "novo" → "preparo" → "saiu" → "entregue" | "cancelado".
Estoque: `[{ id, name, unit: "kg"|"un"|"L", qty, min, cost /* por unidade */, uses: [{ productId?, optionId?, qty }] }]` — ao marcar pedido "entregue" (uma vez, flag `stock_applied`), baixa o estoque.
Despesas: `[{ id, date: "2026-10-01", description, category, amount }]`.
