// Função serverless (Vercel, Node 20+): emite NFC-e na Focus NFe a partir do pedido do checkout.
// POST /api/nfce  body: { order }  →  { invoice }
// Leia api/README-nfce.md antes de ativar. Sem as variáveis de ambiente, responde 501.
//
// Variáveis de ambiente:
//   FOCUSNFE_TOKEN       token da empresa na Focus NFe (obrigatório)
//   EMPRESA_CNPJ         CNPJ do emitente, só números (obrigatório)
//   FOCUSNFE_AMBIENTE    "producao" ou "homologacao" (padrão: homologacao)
//   NCM_PIZZA            padrão 21069090      NCM_BEBIDA   padrão 22021000
//   CFOP                 padrão 5102          CSOSN        padrão 102 (Simples Nacional)
//   ICMS_ORIGEM          padrão 0             CEST_BEBIDA  opcional (ex.: 0300700)
//   NFCE_FRETE           "item" (taxa de entrega vira item), "frete" (valor_frete) ou "ignorar". Padrão: "frete"
//   NCM_TAXA_ENTREGA     NCM usado quando NFCE_FRETE=item (padrão: 00000000 — combine com o contador)
//   ALLOWED_ORIGIN       opcional: domínio do site autorizado a chamar (ex.: https://pizzariajr.com.br)

const PROD = "https://api.focusnfe.com.br";
const HOMOLOG = "https://homologacao.focusnfe.com.br";
const PAY_CODES = { dinheiro: "01", cartao_credito: "03", cartao_debito: "04", pix: "17" };

const onlyDigits = (s) => String(s == null ? "" : s).replace(/\D/g, "");
const dec = (n, p = 2) => (Math.round((Number(n) || 0) * 10 ** p) / 10 ** p).toFixed(p);

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function validCPF(c) {
  c = onlyDigits(c);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (len) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += Number(c[i]) * (len + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

function isDrink(item) {
  if (item.ncm) return false;
  if (String(item.categoryId || "").toLowerCase().includes("bebida")) return true;
  return /\b(coca|guaran[aá]|refri|refrigerante|fanta|sprite|soda|suco|[aá]gua|cerveja|pepsi|kuat|schweppes)\b/i.test(item.name || "");
}

function description(item) {
  const opts = [];
  (item.choices || []).forEach((g) => (g.options || []).forEach((o) => opts.push(o.name)));
  const d = item.name + (opts.length ? " - " + opts.join("/") : "");
  return d.normalize("NFC").slice(0, 120);
}

export function buildFocusPayload(order, env, now = new Date()) {
  const items = Array.isArray(order.items) ? order.items : [];
  if (!items.length) throw Object.assign(new Error("Pedido sem itens."), { status: 400 });

  const cfop = env.CFOP || "5102";
  const csosn = env.CSOSN || "102";
  const origem = env.ICMS_ORIGEM || "0";
  const freteMode = (env.NFCE_FRETE || "frete").toLowerCase();
  const fee = Number(order.totals && order.totals.deliveryFee) || 0;

  const nfItems = items.map((it, i) => {
    const qty = Number(it.qty) || 1;
    const total = Number(it.total != null ? it.total : qty * (Number(it.unitPrice) || 0));
    const unit = total / qty;
    const drink = isDrink(it);
    const out = {
      numero_item: i + 1,
      codigo_produto: String(it.productId || "ITEM" + (i + 1)).slice(0, 60),
      descricao: description(it),
      codigo_ncm: it.ncm || (drink ? env.NCM_BEBIDA || "22021000" : env.NCM_PIZZA || "21069090"),
      cfop,
      unidade_comercial: "UN",
      quantidade_comercial: dec(qty, 4),
      valor_unitario_comercial: dec(unit, 10),
      unidade_tributavel: "UN",
      quantidade_tributavel: dec(qty, 4),
      valor_unitario_tributavel: dec(unit, 10),
      valor_bruto: dec(total),
      icms_origem: origem,
      icms_situacao_tributaria: csosn,
    };
    if (drink && env.CEST_BEBIDA) out.cest = env.CEST_BEBIDA;
    return out;
  });

  let itemsTotal = nfItems.reduce((s, x) => s + Number(x.valor_bruto), 0);
  if (fee > 0 && freteMode === "item") {
    nfItems.push({
      numero_item: nfItems.length + 1, codigo_produto: "TAXA-ENTREGA", descricao: "Taxa de entrega",
      codigo_ncm: env.NCM_TAXA_ENTREGA || "00000000", cfop, unidade_comercial: "UN", quantidade_comercial: "1.0000",
      valor_unitario_comercial: dec(fee, 10), unidade_tributavel: "UN", quantidade_tributavel: "1.0000",
      valor_unitario_tributavel: dec(fee, 10), valor_bruto: dec(fee), icms_origem: origem, icms_situacao_tributaria: csosn,
    });
    itemsTotal += fee;
  }
  const delivery = order.fulfillment === "entrega" || (order.customer && order.customer.fulfillment === "entrega");
  const useFrete = fee > 0 && freteMode === "frete";
  const total = itemsTotal + (useFrete ? fee : 0);

  const pay = order.payment || {};
  let code = PAY_CODES.dinheiro;
  if (pay.method === "pix") code = PAY_CODES.pix;
  else if (pay.method === "cartao") code = pay.card === "debito" ? PAY_CODES.cartao_debito : PAY_CODES.cartao_credito;
  const forma = { forma_pagamento: code, valor_pagamento: dec(total) };
  if (code === "03" || code === "04") forma.tipo_integracao = "2"; // maquininha não integrada

  const payload = {
    cnpj_emitente: onlyDigits(env.EMPRESA_CNPJ),
    data_emissao: now.toISOString(),
    natureza_operacao: "VENDA AO CONSUMIDOR",
    tipo_documento: "1",
    presenca_comprador: delivery ? "4" : "1", // 4 = entrega em domicílio; 1 = presencial
    modalidade_frete: useFrete ? "0" : "9",
    local_destino: "1",
    items: nfItems,
    formas_pagamento: [forma],
  };
  if (useFrete) payload.valor_frete = dec(fee);
  const cpf = onlyDigits(order.customer && order.customer.cpf);
  if (validCPF(cpf)) {
    payload.cpf_destinatario = cpf;
    if (order.customer.name) payload.nome_destinatario = String(order.customer.name).slice(0, 60);
    payload.indicador_inscricao_estadual_destinatario = "9";
  }
  if (order.customer && order.customer.email) payload.email_destinatario = String(order.customer.email).slice(0, 60);
  return { payload, total };
}

function invoiceFromFocus(data, base, ambiente) {
  const st = String((data && data.status) || "");
  const inv = {
    provider: "focusnfe",
    ambiente,
    number: data.numero != null ? Number(data.numero) : null,
    series: data.serie != null ? Number(data.serie) : null,
    key: data.chave_nfe ? onlyDigits(data.chave_nfe) : null,
    url: data.qrcode_url || data.url_consulta_nf || null,
    danfe_url: data.caminho_danfe ? (/^https?:/.test(data.caminho_danfe) ? data.caminho_danfe : base + data.caminho_danfe) : null,
    xml_url: data.caminho_xml_nota_fiscal ? (/^https?:/.test(data.caminho_xml_nota_fiscal) ? data.caminho_xml_nota_fiscal : base + data.caminho_xml_nota_fiscal) : null,
    protocol: data.protocolo || null,
    issued_at: new Date().toISOString(),
    ref: data.ref || null,
  };
  if (st === "autorizado") {
    inv.status = "autorizada";
    inv.message = ambiente === "homologacao" ? "Emitida em HOMOLOGAÇÃO — sem valor fiscal" : "NFC-e autorizada";
  } else if (st === "processando_autorizacao") {
    inv.status = "pendente"; inv.message = "NFC-e em processamento na SEFAZ.";
  } else {
    inv.status = "erro";
    inv.message = "SEFAZ recusou a nota: " + (data.mensagem_sefaz || data.mensagem || st || "erro desconhecido");
  }
  return inv;
}

export default async function handler(req, res) {
  const origin = process.env.ALLOWED_ORIGIN;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.headers.origin && req.headers.origin !== origin) return send(res, 403, { error: "Origem não autorizada." });
  }
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method !== "POST") return send(res, 405, { error: "Use POST." });

  const env = process.env;
  const missing = ["FOCUSNFE_TOKEN", "EMPRESA_CNPJ"].filter((k) => !env[k]);
  if (missing.length) {
    return send(res, 501, {
      error: "nfce_nao_configurada",
      message: "Emissão de NFC-e não configurada no servidor (faltam: " + missing.join(", ") + "). Veja api/README-nfce.md.",
    });
  }

  let body;
  try { body = await readBody(req); } catch (e) { return send(res, 400, { error: "JSON inválido." }); }
  const order = body && body.order;
  if (!order || typeof order !== "object") return send(res, 400, { error: "Envie { order }." });

  // conferência básica dos valores enviados pelo navegador
  const items = Array.isArray(order.items) ? order.items : [];
  const sum = items.reduce((s, it) => s + (Number(it.total) || 0), 0);
  const t = order.totals || {};
  if (items.length > 60 || Math.abs(sum - (Number(t.subtotal) || 0)) > 0.05 || sum <= 0) {
    return send(res, 422, { error: "Totais do pedido não conferem." });
  }

  const ambiente = (env.FOCUSNFE_AMBIENTE || "homologacao").toLowerCase().startsWith("prod") ? "producao" : "homologacao";
  const base = ambiente === "producao" ? PROD : HOMOLOG;
  const ref = String(order.code || "jr" + Date.now()).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 50) + "-" + Date.now().toString(36);

  let built;
  try { built = buildFocusPayload(order, env); } catch (e) { return send(res, e.status || 400, { error: e.message }); }

  const auth = "Basic " + Buffer.from(env.FOCUSNFE_TOKEN + ":").toString("base64");
  let resp, data;
  try {
    resp = await fetch(base + "/v2/nfce?ref=" + encodeURIComponent(ref), {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(built.payload),
      signal: AbortSignal.timeout(20000),
    });
    const text = await resp.text();
    try { data = JSON.parse(text); } catch { data = { mensagem: text.slice(0, 300) }; }
  } catch (e) {
    return send(res, 502, { error: "focus_indisponivel", message: "Não foi possível falar com a Focus NFe (" + (e.name === "TimeoutError" ? "tempo esgotado" : e.message) + ")." });
  }

  if (!resp.ok && !(data && data.status)) {
    const msg = (data && (data.mensagem || data.codigo)) || "HTTP " + resp.status;
    const invoice = { status: "erro", provider: "focusnfe", ambiente, number: null, series: null, key: null, url: null, issued_at: new Date().toISOString(), ref, message: "Focus NFe: " + msg };
    return send(res, 200, { invoice });
  }
  const invoice = invoiceFromFocus(Object.assign({ ref }, data), base, ambiente);
  return send(res, 200, { invoice });
}
