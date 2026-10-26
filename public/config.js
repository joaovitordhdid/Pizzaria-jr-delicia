// Configuração da loja. Preencha para sair do modo demonstração.
window.JR_CONFIG = {
  // Supabase (login do dono + banco de dados). Vazio = modo demonstração no navegador.
  supabaseUrl: "",
  supabaseAnonKey: "",

  // Nota fiscal (NFC-e). "simulado" gera um cupom de teste sem valor fiscal.
  // Para emitir de verdade: provider "focusnfe" e configure as variáveis no Vercel (veja LEIA-ME.md).
  nfce: {
    provider: "simulado",
    endpoint: "/api/nfce",
  },

  // WhatsApp da loja (só números, com DDI 55) para enviar o resumo do pedido.
  whatsapp: "",
};
