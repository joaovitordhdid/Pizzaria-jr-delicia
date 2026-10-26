# Nota fiscal (NFC-e) e Pix — o que falta para valer de verdade

Hoje o site funciona em modo **simulado**: cada pedido recebe um cupom de teste com número, série e chave de acesso no formato da NFC-e, marcado como **"Documento sem valor fiscal — emissão de teste"**. Ele **não** é enviado à SEFAZ e **não** substitui a nota fiscal.

A função `api/nfce.js` já está pronta para emitir NFC-e de verdade pela **Focus NFe**. Ela só funciona depois que os itens abaixo estiverem prontos. Sem eles, ela responde `501` e o pedido continua normalmente, com a nota marcada como "pendente".

## 1. O que o dono precisa ter (fora do site)

| Item | Onde conseguir |
|---|---|
| **CNPJ ativo** com atividade de restaurante/pizzaria | Receita Federal / contador |
| **Inscrição Estadual** ativa e habilitada para emitir NFC-e (modelo 65) | SEFAZ do seu estado (em SP: credenciamento no Posto Fiscal Eletrônico) |
| **Certificado digital A1** (arquivo .pfx + senha) do CNPJ | Autoridade certificadora (Serasa, Certisign, Valid etc.), cerca de R$ 150–250/ano |
| **CSC (Código de Segurança do Contribuinte) e ID do Token** | Portal da SEFAZ do estado, gerado com o certificado |
| **Conta na Focus NFe** (plano pago, com período de teste) | focusnfe.com.br: cadastre a empresa, envie o certificado A1 e informe o CSC/ID Token |
| **Contador** para confirmar NCM, CFOP, CSOSN/CST, CEST e o regime tributário | Seu contador |

Os padrões já configurados são **apenas sugestões** e precisam ser conferidos pelo contador:

- NCM pizza: `21069090` (preparações alimentícias). NCM refrigerante: `22021000`.
- CFOP `5102` (venda de mercadoria dentro do estado).
- CSOSN `102` (Simples Nacional, sem permissão de crédito). Refrigerantes costumam ter **substituição tributária** (CSOSN `500` + CEST). Se for o caso, o contador vai indicar outro código.
- Taxa de entrega: por padrão vai como `valor_frete`. Também dá para lançar como item (`NFCE_FRETE=item`) ou deixar fora da nota (`NFCE_FRETE=ignorar`).
- Formas de pagamento: `01` dinheiro, `03` cartão de crédito, `04` cartão de débito e `17` Pix. Cartão sai como "não integrado" (`tipo_integracao=2`).

## 2. Configurar no Vercel

1. Vercel → seu projeto → **Settings → Environment Variables**. Adicione:

   | Variável | Exemplo | Obrigatória |
   |---|---|---|
   | `FOCUSNFE_TOKEN` | token da empresa no painel da Focus | sim |
   | `EMPRESA_CNPJ` | `12345678000190` | sim |
   | `FOCUSNFE_AMBIENTE` | `homologacao` (teste) ou `producao` | não (padrão: homologação) |
   | `NCM_PIZZA` / `NCM_BEBIDA` | `21069090` / `22021000` | não |
   | `CFOP` / `CSOSN` / `ICMS_ORIGEM` | `5102` / `102` / `0` | não |
   | `CEST_BEBIDA` | código CEST indicado pelo contador | não |
   | `NFCE_FRETE` | `frete`, `item` ou `ignorar` | não |
   | `ALLOWED_ORIGIN` | `https://seusite.com.br` | recomendado |

2. Em `public/config.js`, troque `nfce.provider` de `"simulado"` para `"focusnfe"`.
3. Faça um novo deploy. Teste primeiro com `FOCUSNFE_AMBIENTE=homologacao`. As notas saem com "SEM VALOR FISCAL" e não contam. Quando estiver tudo certo, mude para `producao`.

A função usa `https://homologacao.focusnfe.com.br` ou `https://api.focusnfe.com.br` (`POST /v2/nfce?ref=...`), com Basic Auth (token como usuário e senha vazia). Ela devolve ao site o número, a série, a chave, a URL de consulta (QR Code do cupom) e o link do DANFE oficial.

## 3. Limites conhecidos (leia)

- **A função é pública.** Qualquer pessoa que descubra a URL pode pedir uma nota. Configure `ALLOWED_ORIGIN`, acompanhe as notas no painel da Focus e, se possível, mova a emissão para quando o dono **confirmar** o pedido no painel.
- Os preços vêm do navegador. A função só confere se a soma dos itens bate com o subtotal. Ela não consulta o cardápio oficial.
- Se a SEFAZ ou a Focus estiverem fora do ar, o pedido é salvo assim mesmo, com a nota "pendente" ou "erro". A emissão fica para depois, pelo painel da Focus. O cancelamento de NFC-e também é feito por lá, em até 30 minutos.
- Ninguém testou este código contra a Focus NFe real (não havia conta nem certificado). Valide em homologação antes de ir para produção.

## 4. Pix

Em `public/config.js`, adicione:

```js
pix: { key: "sua-chave-pix", name: "PIZZARIA JR DELICIA", city: "SAO PAULO" },
```

- `key`: CPF/CNPJ (só números), e-mail, celular com `+55DDD...` ou chave aleatória.
- `name` (até 25 letras) e `city` (até 15) precisam bater com o cadastro da conta no banco.

Com a chave, a tela de confirmação mostra o QR Code e o código "Pix copia e cola" (BR Code estático com o valor e o código do pedido como identificador). Sem chave, o cliente vê "o atendente envia a chave Pix".

**Importante:** o Pix estático **não confirma o pagamento sozinho**. O dono confere o recebimento no app do banco (ou o comprovante que o cliente manda no WhatsApp). Para confirmação automática é preciso um PSP com API de Pix dinâmico (Mercado Pago, Efí, Asaas etc.), que não está incluído.
