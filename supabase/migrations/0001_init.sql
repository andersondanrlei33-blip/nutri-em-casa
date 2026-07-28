-- =====================================================================
-- Nutri em Casa — schema inicial
-- Rode este arquivo no SQL Editor do Supabase (ou via `supabase db push`).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
create type genero as enum ('feminino', 'masculino', 'outro');

create type nivel_atividade as enum ('sedentario', 'leve', 'moderado', 'intenso', 'atleta');

create type objetivo_nutricional as enum (
  'emagrecimento', 'manutencao', 'ganho_massa', 'saude_geral', 'performance_esportiva'
);

create type categoria_receita as enum (
  'cafe_da_manha', 'almoco', 'jantar', 'lanche', 'sobremesa', 'pre_treino', 'pos_treino'
);

create type dia_semana as enum (
  'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'
);

create type plano_assinatura as enum ('gratuito', 'premium', 'anual', 'trial');

create type status_assinatura as enum ('ativa', 'trial', 'cancelada', 'expirada', 'inadimplente');

create type provedor_pagamento as enum ('stripe', 'mercadopago', 'asaas', 'hotmart', 'kiwify');

-- ---------------------------------------------------------------------
-- PERFIS (espelha auth.users)
-- ---------------------------------------------------------------------
create table public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  email text not null,
  avatar_url text,
  data_nascimento date,
  genero genero,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.perfis is 'Dados de perfil complementares a auth.users';

-- Cria o perfil e a assinatura gratuita automaticamente no cadastro.
create function public.handle_novo_usuario()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.perfis (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)), new.email);

  insert into public.assinaturas (usuario_id, plano, status, trial_termina_em)
  values (new.id, 'trial', 'trial', now() + interval '7 days');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_novo_usuario();

-- ---------------------------------------------------------------------
-- ASSINATURAS
-- ---------------------------------------------------------------------
create table public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  plano plano_assinatura not null default 'gratuito',
  status status_assinatura not null default 'ativa',
  provedor provedor_pagamento,
  id_externo text,
  inicio_em timestamptz not null default now(),
  renovacao_em timestamptz,
  trial_termina_em timestamptz,
  cancelada_em timestamptz,
  criado_em timestamptz not null default now()
);

create index idx_assinaturas_usuario on public.assinaturas(usuario_id);
create index idx_assinaturas_id_externo on public.assinaturas(id_externo);

-- ---------------------------------------------------------------------
-- AVALIAÇÕES NUTRICIONAIS (consulta com a IA)
-- ---------------------------------------------------------------------
create table public.avaliacoes_nutricionais (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  peso_kg numeric(5,2) not null check (peso_kg > 0),
  altura_cm numeric(5,1) not null check (altura_cm > 0),
  idade smallint not null check (idade between 10 and 120),
  genero genero not null,
  nivel_atividade nivel_atividade not null,
  objetivo objetivo_nutricional not null,
  peso_meta_kg numeric(5,2),
  restricoes_alimentares text[] not null default '{}',
  alergias text[] not null default '{}',
  condicoes_saude text[] not null default '{}',
  refeicoes_por_dia smallint not null default 3 check (refeicoes_por_dia between 3 and 6),
  preferencias_alimentares text[] not null default '{}',
  alimentos_evitados text[] not null default '{}',
  qualidade_sono smallint check (qualidade_sono between 1 and 5),
  nivel_estresse smallint check (nivel_estresse between 1 and 5),
  observacoes text,
  -- resultados calculados (ver src/lib/nutrition/calculations.ts)
  imc numeric(4,1) not null,
  classificacao_imc text not null,
  tmb integer not null,
  tdee integer not null,
  meta_calorica integer not null,
  meta_proteina_g integer not null,
  meta_carboidrato_g integer not null,
  meta_gordura_g integer not null,
  meta_fibra_g integer not null,
  meta_agua_ml integer not null,
  criado_em timestamptz not null default now()
);

create index idx_avaliacoes_usuario on public.avaliacoes_nutricionais(usuario_id, criado_em desc);

-- ---------------------------------------------------------------------
-- RECEITAS (biblioteca global + criadas pelo usuário)
-- ---------------------------------------------------------------------
create table public.receitas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references auth.users(id) on delete cascade, -- null = biblioteca global
  nome text not null,
  descricao text,
  categoria categoria_receita not null,
  ingredientes jsonb not null default '[]',
  modo_preparo text[] not null default '{}',
  tempo_preparo_min smallint not null default 15,
  porcoes smallint not null default 1,
  calorias integer not null default 0,
  proteina_g numeric(6,1) not null default 0,
  carboidrato_g numeric(6,1) not null default 0,
  gordura_g numeric(6,1) not null default 0,
  fibra_g numeric(6,1) not null default 0,
  imagem_url text,
  favorito boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index idx_receitas_usuario on public.receitas(usuario_id);
create index idx_receitas_categoria on public.receitas(categoria);
create index idx_receitas_busca on public.receitas using gin (to_tsvector('portuguese', nome || ' ' || coalesce(descricao, '')));

-- ---------------------------------------------------------------------
-- PLANOS ALIMENTARES E REFEIÇÕES
-- ---------------------------------------------------------------------
create table public.planos_alimentares (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  nome text not null default 'Meu plano alimentar',
  data_inicio date not null default current_date,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create index idx_planos_usuario on public.planos_alimentares(usuario_id);

create table public.refeicoes_plano (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references public.planos_alimentares(id) on delete cascade,
  receita_id uuid references public.receitas(id) on delete set null,
  dia_semana dia_semana not null,
  nome_refeicao text not null,
  horario time not null,
  quantidade_porcoes numeric(4,2) not null default 1,
  ordem smallint not null default 0,
  consumida boolean not null default false,
  criado_em timestamptz not null default now()
);

create index idx_refeicoes_plano on public.refeicoes_plano(plano_id, dia_semana, ordem);

-- ---------------------------------------------------------------------
-- REGISTROS DE ACOMPANHAMENTO
-- ---------------------------------------------------------------------
create table public.registros_consumo (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  refeicao_plano_id uuid references public.refeicoes_plano(id) on delete set null,
  data date not null default current_date,
  calorias integer not null default 0,
  proteina_g numeric(6,1) not null default 0,
  carboidrato_g numeric(6,1) not null default 0,
  gordura_g numeric(6,1) not null default 0,
  criado_em timestamptz not null default now()
);
create index idx_registros_consumo_usuario on public.registros_consumo(usuario_id, data desc);

create table public.registros_peso (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  peso_kg numeric(5,2) not null check (peso_kg > 0),
  data date not null default current_date,
  observacoes text,
  criado_em timestamptz not null default now(),
  unique (usuario_id, data)
);
create index idx_registros_peso_usuario on public.registros_peso(usuario_id, data desc);

create table public.registros_medidas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  data date not null default current_date,
  cintura_cm numeric(5,1),
  quadril_cm numeric(5,1),
  peito_cm numeric(5,1),
  braco_cm numeric(5,1),
  coxa_cm numeric(5,1),
  pescoco_cm numeric(5,1),
  percentual_gordura numeric(4,1),
  criado_em timestamptz not null default now()
);
create index idx_registros_medidas_usuario on public.registros_medidas(usuario_id, data desc);

create table public.registros_agua (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  data date not null default current_date,
  quantidade_ml integer not null check (quantidade_ml > 0),
  criado_em timestamptz not null default now()
);
create index idx_registros_agua_usuario on public.registros_agua(usuario_id, data desc);

create table public.registros_sono (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  data date not null default current_date,
  horas numeric(3,1) not null check (horas >= 0 and horas <= 24),
  qualidade smallint not null check (qualidade between 1 and 5),
  criado_em timestamptz not null default now(),
  unique (usuario_id, data)
);
create index idx_registros_sono_usuario on public.registros_sono(usuario_id, data desc);

create table public.registros_humor (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  data date not null default current_date,
  humor smallint not null check (humor between 1 and 5),
  energia smallint not null check (energia between 1 and 5),
  observacoes text,
  criado_em timestamptz not null default now()
);
create index idx_registros_humor_usuario on public.registros_humor(usuario_id, data desc);

create table public.registros_exercicio (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  data date not null default current_date,
  tipo text not null,
  duracao_min smallint not null check (duracao_min > 0),
  calorias_estimadas integer,
  intensidade text not null default 'moderada' check (intensidade in ('leve', 'moderada', 'intensa')),
  observacoes text,
  criado_em timestamptz not null default now()
);
create index idx_registros_exercicio_usuario on public.registros_exercicio(usuario_id, data desc);

-- ---------------------------------------------------------------------
-- METAS
-- ---------------------------------------------------------------------
create table public.metas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('peso', 'medida', 'agua', 'habito', 'personalizada')),
  titulo text not null,
  valor_alvo numeric(8,2),
  valor_atual numeric(8,2),
  unidade text,
  prazo date,
  concluida boolean not null default false,
  criado_em timestamptz not null default now()
);
create index idx_metas_usuario on public.metas(usuario_id);

-- ---------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------
create function public.tocar_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create trigger trg_perfis_atualizado before update on public.perfis
  for each row execute procedure public.tocar_atualizado_em();
create trigger trg_receitas_atualizado before update on public.receitas
  for each row execute procedure public.tocar_atualizado_em();

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.perfis enable row level security;
alter table public.assinaturas enable row level security;
alter table public.avaliacoes_nutricionais enable row level security;
alter table public.receitas enable row level security;
alter table public.planos_alimentares enable row level security;
alter table public.refeicoes_plano enable row level security;
alter table public.registros_consumo enable row level security;
alter table public.registros_peso enable row level security;
alter table public.registros_medidas enable row level security;
alter table public.registros_agua enable row level security;
alter table public.registros_sono enable row level security;
alter table public.registros_humor enable row level security;
alter table public.registros_exercicio enable row level security;
alter table public.metas enable row level security;

-- PERFIS: cada usuário só vê/edita o próprio perfil
create policy "perfis_select_own" on public.perfis for select using (auth.uid() = id);
create policy "perfis_update_own" on public.perfis for update using (auth.uid() = id);

-- ASSINATURAS: leitura própria; escrita reservada ao service role (webhooks)
create policy "assinaturas_select_own" on public.assinaturas for select using (auth.uid() = usuario_id);

-- AVALIAÇÕES
create policy "avaliacoes_all_own" on public.avaliacoes_nutricionais for all
  using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

-- RECEITAS: qualquer usuário autenticado lê a biblioteca global (usuario_id
-- is null) ou as próprias; só edita/exclui as próprias.
create policy "receitas_select" on public.receitas for select
  using (usuario_id is null or auth.uid() = usuario_id);
create policy "receitas_insert_own" on public.receitas for insert
  with check (auth.uid() = usuario_id);
create policy "receitas_update_own" on public.receitas for update
  using (auth.uid() = usuario_id);
create policy "receitas_delete_own" on public.receitas for delete
  using (auth.uid() = usuario_id);

-- PLANOS ALIMENTARES
create policy "planos_all_own" on public.planos_alimentares for all
  using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

-- REFEIÇÕES DO PLANO (acesso via join com o plano do usuário)
create policy "refeicoes_all_own" on public.refeicoes_plano for all
  using (exists (
    select 1 from public.planos_alimentares p
    where p.id = refeicoes_plano.plano_id and p.usuario_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.planos_alimentares p
    where p.id = refeicoes_plano.plano_id and p.usuario_id = auth.uid()
  ));

-- REGISTROS DE ACOMPANHAMENTO (mesmo padrão em todas as tabelas de registro)
create policy "registros_consumo_all_own" on public.registros_consumo for all
  using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);
create policy "registros_peso_all_own" on public.registros_peso for all
  using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);
create policy "registros_medidas_all_own" on public.registros_medidas for all
  using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);
create policy "registros_agua_all_own" on public.registros_agua for all
  using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);
create policy "registros_sono_all_own" on public.registros_sono for all
  using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);
create policy "registros_humor_all_own" on public.registros_humor for all
  using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);
create policy "registros_exercicio_all_own" on public.registros_exercicio for all
  using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

-- METAS
create policy "metas_all_own" on public.metas for all
  using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

-- ---------------------------------------------------------------------
-- STORAGE (avatares e imagens de receitas)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatares', 'avatares', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('receitas', 'receitas', true)
on conflict (id) do nothing;

create policy "avatares_leitura_publica" on storage.objects for select
  using (bucket_id = 'avatares');
create policy "avatares_upload_proprio" on storage.objects for insert
  with check (bucket_id = 'avatares' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "receitas_imagens_leitura_publica" on storage.objects for select
  using (bucket_id = 'receitas');
create policy "receitas_imagens_upload_proprio" on storage.objects for insert
  with check (bucket_id = 'receitas' and auth.uid()::text = (storage.foldername(name))[1]);
