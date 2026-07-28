# Nutri em Casa

Plataforma de acompanhamento nutricional com IA — consulta nutricional completa, plano
alimentar 100% editável, biblioteca de receitas, acompanhamento diário e assinatura recorrente.

## Stack

- **Next.js 16** (App Router, Server Components) + **React 19** + **TypeScript**
- **Tailwind CSS v4** (tema configurado em `src/app/globals.css`)
- **Supabase** — Auth, Postgres, Row Level Security e Storage
- **Anthropic API** (opcional) para geração inteligente do plano alimentar, com fallback
  determinístico caso a chave não esteja configurada
- Pagamentos via **arquitetura de adapters** (`src/lib/payments`) — Stripe, Mercado Pago,
  Asaas, Hotmart e Kiwify já implementados atrás da mesma interface
- PWA completo (manifest, service worker, ícones, instalável e com suporte offline básico)

## Estrutura do projeto

```
src/
  app/                    # Rotas (App Router)
    (auth)/               # Login e cadastro
    (app)/                # Área logada (dashboard, plano, receitas, etc.)
    api/                  # Rotas de API (geração de plano, checkout, webhooks)
  components/
    ui/                   # Design system (Button, Card, Input, Modal, Toast...)
    layout/               # Sidebar, Topbar, AppShell
    consulta/ plano/ receitas/ tracking/ dashboard/
  hooks/                  # useUser, useSupabaseTable (CRUD genérico)
  lib/
    nutrition/            # Motor de cálculo (IMC, TMB, TDEE, macros) + gerador de plano
    ai/                   # Cliente da Anthropic
    subscriptions/        # Definição de planos e regras de acesso
    payments/             # Adapters de gateway de pagamento
    supabase/             # Clientes (browser, server, middleware)
  types/domain.ts         # Tipos compartilhados (espelham o schema SQL)
supabase/
  migrations/0001_init.sql       # Schema completo + RLS
  migrations/0002_seed_receitas.sql  # Biblioteca inicial de receitas
public/
  manifest.json, sw.js, icons/   # PWA
```

## Como rodar localmente

1. **Crie um projeto no [Supabase](https://supabase.com)** e rode as migrations:
   - Abra o SQL Editor do projeto e execute, nesta ordem:
     `supabase/migrations/0001_init.sql` e depois `supabase/migrations/0002_seed_receitas.sql`.
   - Isso cria todas as tabelas, enums, políticas de RLS, buckets de Storage e a
     biblioteca inicial de receitas.

2. **Configure as variáveis de ambiente**:
   ```bash
   cp .env.example .env.local
   ```
   Preencha ao menos `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e
   `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API no painel do Supabase).

3. **Instale as dependências e rode**:
   ```bash
   npm install
   npm run dev
   ```
   Acesse `http://localhost:3000`.

4. **Rode os testes do motor de cálculo nutricional** (não depende de instalar
   dependências, roda com o Node nativo):
   ```bash
   npm test
   ```

## Ativando a IA da consulta nutricional

Sem `ANTHROPIC_API_KEY`, o app gera planos alimentares usando um algoritmo determinístico
(`src/lib/nutrition/mealPlanGenerator.ts`) que distribui as metas calóricas/macros calculadas
entre as refeições do dia — 100% funcional, mas sem variedade gerada por IA.

Para ativar a geração inteligente, defina `ANTHROPIC_API_KEY` em `.env.local`. O sistema
passa a usar o modelo Claude para montar o cardápio semanal respeitando restrições,
alergias e preferências informadas na consulta, com fallback automático para o gerador
determinístico caso a chamada à API falhe.

## Ativando pagamentos

Defina `PAYMENT_PROVIDER` como `stripe`, `mercadopago`, `asaas`, `hotmart` ou `kiwify` e
preencha as variáveis específicas do provedor escolhido em `.env.local` (veja
`.env.example`). Trocar de gateway no futuro não exige alterar nenhuma rota ou tela — apenas
implementar (se necessário) a interface `ProvedorPagamentoAdapter` em `src/lib/payments`.

Configure os webhooks do provedor apontando para:
- Stripe: `POST /api/webhooks/stripe`
- Mercado Pago: `POST /api/webhooks/mercadopago`
- Hotmart/Kiwify/Asaas: adapters prontos em `src/lib/payments`; crie as rotas de webhook
  correspondentes seguindo o mesmo padrão de `src/app/api/webhooks/stripe/route.ts` quando
  for ativar esses provedores.

## Deploy em produção

1. Deploy do Next.js na **Vercel** (recomendado) ou qualquer host compatível com Next 16.
2. Configure todas as variáveis de `.env.example` no ambiente de produção.
3. Aponte o domínio customizado e habilite HTTPS (obrigatório para PWA e para os webhooks
   de pagamento).
4. Rode as migrations do Supabase no projeto de produção (ou use `supabase db push` com a
   CLI oficial).
5. Configure os webhooks dos gateways de pagamento apontando para o domínio de produção.
6. Teste a instalação do PWA em um dispositivo móvel (Adicionar à tela de início).

## Decisões de arquitetura

- **RLS em todas as tabelas de dados do usuário** — a API nunca precisa checar
  manualmente "esse registro é do usuário logado?"; o Postgres garante isso.
- **Motor de cálculo isolado e testável** (`src/lib/nutrition/calculations.ts`) — sem
  dependências de I/O, usado tanto no preview instantâneo do cliente quanto na geração
  oficial do plano no servidor. Cobertura de testes em `calculations.test.ts`.
- **Geração de plano com fallback gracioso** — o app nunca fica bloqueado por falta de
  chave de IA ou por instabilidade da API externa.
- **Adapters de pagamento** — cada gateway implementa a mesma interface; a aplicação nunca
  importa um SDK de pagamento fora de `src/lib/payments`.
- **Hook de CRUD genérico** (`useSupabaseTable`) — usado por todos os módulos de
  acompanhamento (peso, medidas, água, sono, humor, exercícios) e metas, evitando duplicar
  lógica de criar/editar/excluir/duplicar em cada tela.

## Limitações conhecidas / próximos passos

- Os webhooks de Hotmart, Kiwify e Asaas têm o adapter pronto, mas as rotas de API
  (`src/app/api/webhooks/...`) só foram criadas para Stripe e Mercado Pago — replique o
  padrão quando for ativar os demais provedores.
- A exclusão de conta (Configurações → Zona de risco) está desabilitada no MVP; hoje é um
  processo manual via suporte — implemente a rota de exclusão em cascata antes de anunciar
  essa opção publicamente.
- Testes automatizados cobrem o motor de cálculo nutricional (a lógica de negócio mais
  crítica). Recomenda-se adicionar testes de integração (Playwright/Cypress) para os
  fluxos de consulta → geração de plano → checkout antes do lançamento comercial.
