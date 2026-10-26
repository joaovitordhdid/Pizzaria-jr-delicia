// Camada de dados compartilhada pelo cardápio, checkout e painel.
// Dois modos: Supabase (quando JR_CONFIG tem URL e chave) ou demonstração (localStorage do navegador).
(function () {
  const cfg = window.JR_CONFIG || {};
  const useSupabase = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  const sb = useSupabase ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

  const DEMO_USER = { email: "dono@pizzariajr.com", password: "jrdelicia2026" };
  const LS = "jr_v1_";

  // ---------- eventos ----------
  const listeners = {};
  function on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); }
  function emit(evt, payload) { (listeners[evt] || []).forEach((fn) => { try { fn(payload); } catch (e) { console.error(e); } }); }

  // ---------- util ----------
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function lsGet(key, fallback) {
    try { const v = localStorage.getItem(LS + key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(LS + key, JSON.stringify(value)); } catch { /* sem armazenamento */ }
  }
  function uid(prefix) { return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function money(n) { return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

  // ---------- chave/valor (cardápio, estoque, despesas) ----------
  const memory = {};
  async function kvGet(key, fallback) {
    if (sb) {
      const { data, error } = await sb.from("jr_kv").select("value").eq("key", key).maybeSingle();
      if (error) { console.warn("jr_kv", key, error.message); return clone(fallback); }
      return data ? data.value : clone(fallback);
    }
    if (key in memory) return clone(memory[key]);
    return lsGet(key, clone(fallback));
  }
  async function kvSet(key, value) {
    if (sb) {
      const { error } = await sb.from("jr_kv").upsert({ key, value, updated_at: new Date().toISOString() });
      if (error) throw new Error("Não foi possível salvar: " + error.message);
    } else {
      memory[key] = clone(value);
      lsSet(key, value);
    }
    emit(key + ":changed", clone(value));
    return value;
  }

  // ---------- cardápio ----------
  async function getMenu() { return kvGet("menu", window.JR_SEED); }
  async function saveMenu(menu) { return kvSet("menu", menu); }
  async function resetMenu() { return kvSet("menu", clone(window.JR_SEED)); }

  // ---------- estoque e despesas ----------
  async function getStock() { return kvGet("stock", (window.JR_SEED_STOCK || [])); }
  async function saveStock(items) { return kvSet("stock", items); }
  async function getExpenses() { return kvGet("expenses", (window.JR_SEED_EXPENSES || [])); }
  async function saveExpenses(items) { return kvSet("expenses", items); }

  // ---------- pedidos ----------
  function demoOrders() { return lsGet("orders", null) ?? clone(window.JR_SEED_ORDERS || []); }

  async function createOrder(order) {
    const full = Object.assign({
      id: (crypto.randomUUID ? crypto.randomUUID() : uid("ord")),
      code: "JR" + Date.now().toString().slice(-6),
      created_at: new Date().toISOString(),
      status: "novo",
    }, clone(order));
    if (sb) {
      const { error } = await sb.from("jr_orders").insert({
        id: full.id, code: full.code, status: full.status, created_at: full.created_at,
        customer: full.customer, items: full.items, totals: full.totals, payment: full.payment, invoice: full.invoice || null, fulfillment: full.fulfillment || null,
      });
      if (error) throw new Error("Não foi possível enviar o pedido: " + error.message);
    } else {
      const list = demoOrders(); list.unshift(full); lsSet("orders", list);
    }
    emit("orders:changed");
    return full;
  }
  async function listOrders() {
    if (sb) {
      const { data, error } = await sb.from("jr_orders").select("*").order("created_at", { ascending: false }).limit(1000);
      if (error) throw new Error(error.message);
      return data;
    }
    return demoOrders();
  }
  async function updateOrder(id, patch) {
    if (sb) {
      const { error } = await sb.from("jr_orders").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const list = demoOrders().map((o) => (o.id === id ? Object.assign(o, patch) : o));
      lsSet("orders", list);
    }
    emit("orders:changed");
  }

  // ---------- login do dono ----------
  let session = null;
  async function getSession() {
    if (sb) {
      const { data } = await sb.auth.getSession();
      session = data.session ? { email: data.session.user.email } : null;
    } else {
      session = (() => { try { return JSON.parse(sessionStorage.getItem(LS + "session")); } catch { return null; } })();
    }
    return session;
  }
  async function signIn(email, password) {
    email = String(email || "").trim().toLowerCase();
    if (sb) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error("E-mail ou senha incorretos.");
      const { data: admin } = await sb.from("jr_admins").select("email").eq("email", email).maybeSingle();
      if (!admin) { await sb.auth.signOut(); throw new Error("Esta conta não tem acesso ao painel."); }
      session = { email: data.user.email };
    } else {
      if (email !== DEMO_USER.email || password !== DEMO_USER.password) throw new Error("E-mail ou senha incorretos.");
      session = { email, demo: true };
      try { sessionStorage.setItem(LS + "session", JSON.stringify(session)); } catch { }
    }
    emit("auth:changed", session);
    return session;
  }
  async function signOut() {
    if (sb) await sb.auth.signOut();
    try { sessionStorage.removeItem(LS + "session"); } catch { }
    session = null;
    emit("auth:changed", null);
  }

  // ---------- fotos (painel) ----------
  // Supabase: envia para o bucket público "fotos". Demo: converte em data URL reduzida.
  async function uploadImage(file) {
    if (sb) {
      const path = "produtos/" + uid("img") + "." + (file.name.split(".").pop() || "jpg");
      const { error } = await sb.storage.from("fotos").upload(path, file, { upsert: false });
      if (error) throw new Error("Falha ao enviar a foto: " + error.message);
      return sb.storage.from("fotos").getPublicUrl(path).data.publicUrl;
    }
    return await new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = () => { img.src = reader.result; };
      reader.onerror = reject;
      img.onload = () => {
        const max = 600, scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.8));
      };
      reader.readAsDataURL(file);
    });
  }


  // ---------- horário (fuso de Sergipe, UTC-3) ----------
  // open:false no painel fecha a loja; fora do horário o cliente ainda pode pedir (agendado para a abertura).
  function storeStatus(st) {
    st = st || {};
    if (st.open === false) return { state: "closed", label: "Fechado agora", note: "" };
    const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || "").trim()); return m ? (+m[1]) * 60 + (+m[2]) : null; };
    const o = toMin(st.openTime), c = toMin(st.closeTime);
    if (o == null || c == null) return { state: "open", label: "Aberto agora", note: "" };
    const now = new Date(Date.now() - 3 * 3600 * 1000);
    const cur = now.getUTCHours() * 60 + now.getUTCMinutes();
    const inside = c > o ? (cur >= o && cur < c) : (cur >= o || cur < c);
    if (inside) return { state: "open", label: "Aberto agora", note: "" };
    const at = st.openTime.replace(/^0/, "").replace(":00", "h").replace(":", "h");
    return { state: "scheduled", label: "Abre às " + at, note: "Estamos fechados agora. Você já pode fazer seu pedido: ele começa a ser preparado quando abrirmos, às " + at + "." };
  }

  window.JR = Object.assign(window.JR || {}, {
    mode: sb ? "supabase" : "demo",
    demoUser: sb ? null : DEMO_USER,
    on, emit, uid, money, clone, storeStatus,
    db: { getMenu, saveMenu, resetMenu, getStock, saveStock, getExpenses, saveExpenses, createOrder, listOrders, updateOrder, uploadImage },
    auth: { getSession, signIn, signOut },
  });
})();
