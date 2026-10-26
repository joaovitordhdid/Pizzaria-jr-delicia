# Pizzaria Jr Delícia — cardápio digital

Site estático (HTML, CSS e JavaScript puro) hospedado no Vercel, projeto `pizzaria-jr-delicia`.

## Estrutura
- `public/index.html` — página única: cardápio, sacola, finalização do pedido e, no fim da página, a Área do dono.
- `public/js/data.js` — cardápio original copiado do anota.ai em 26/10/2026 (35 sabores, bebidas, bordas).
- `public/js/store.js` — dados e login. Modo demonstração (navegador) ou Supabase.
- `public/js/app.js` + `css/style.css` — cardápio e sacola.
- `public/js/checkout.js` + `css/checkout.css` + `js/nfce.js` — finalização e nota fiscal.
- `public/js/admin.js` + `css/admin.css` + `js/seed-admin.js` — painel do dono (pedidos, cardápio, financeiro, estoque).
- `api/nfce.js` — função do Vercel que emite NFC-e pela Focus NFe quando configurada.
- `scripts/fetch-images.sh` — baixa as fotos do cardápio antigo durante o build.
- `supabase/schema.sql` — banco de dados para quando o login de verdade for ligado.

## Modo demonstração (como está hoje)
Login de teste do painel: `dono@pizzariajr.com` / `jrdelicia2026`.
Neste modo tudo fica salvo só no navegador de quem está usando: mudanças de preço feitas pelo dono no celular dele não aparecem para os clientes, e os pedidos dos clientes não chegam no painel do dono. Serve para conhecer e testar o sistema. A senha de teste fica visível no código, então não é segura.

## Ligar o login e o banco de verdade (Supabase)
1. Criar um projeto no Supabase (a conta grátis permite 2 projetos ativos).
2. No SQL Editor, rodar `supabase/schema.sql`.
3. Em Authentication > Users, criar o usuário do dono (e-mail e senha) e rodar:
   `insert into jr_admins (email) values ('email-do-dono@exemplo.com');`
4. Em `public/config.js`, preencher `supabaseUrl` e `supabaseAnonKey` (Project Settings > API) e publicar de novo.
A partir daí só quem tem o e-mail e a senha cadastrados entra no painel, e cardápio, pedidos, estoque e despesas ficam no banco.

## Nota fiscal automática (NFC-e)
Hoje gera um cupom de teste, sem valor fiscal. Para emitir de verdade veja `api/README-nfce.md`. Resumo do que a loja precisa: CNPJ ativo com inscrição estadual, certificado digital A1, CSC (código de segurança do contribuinte) da SEFAZ-SE, conta num emissor (ex.: Focus NFe) e o contador definindo NCM/CFOP/CSOSN.
