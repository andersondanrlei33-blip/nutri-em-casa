-- =====================================================================
-- Sinalizadores de segurança clínica na consulta nutricional: quando
-- marcados, o motor de cálculo NUNCA aplica déficit/superávit calórico
-- automático (usa manutenção) e recomenda acompanhamento profissional.
-- =====================================================================
alter table public.avaliacoes_nutricionais
  add column if not exists gestante boolean not null default false,
  add column if not exists lactante boolean not null default false,
  add column if not exists historico_transtorno_alimentar boolean not null default false,
  add column if not exists ajuste_seguranca text;

comment on column public.avaliacoes_nutricionais.gestante is 'Gestante no momento da consulta — bloqueia déficit/superávit calórico automático.';
comment on column public.avaliacoes_nutricionais.lactante is 'Lactante no momento da consulta — bloqueia déficit/superávit calórico automático.';
comment on column public.avaliacoes_nutricionais.historico_transtorno_alimentar is 'Histórico de transtorno alimentar — bloqueia déficit/superávit calórico automático.';
comment on column public.avaliacoes_nutricionais.ajuste_seguranca is 'Explicação do ajuste de segurança aplicado à meta calórica (piso mínimo ou condição especial), se houver.';

-- =====================================================================
-- Tags estruturadas nas receitas, para filtrar a geração do plano por
-- alergia/restrição de forma confiável (em vez de depender só de texto
-- livre interpretado por IA).
-- =====================================================================
alter table public.receitas
  add column if not exists alergenos text[] not null default '{}',
  add column if not exists dietas_atendidas text[] not null default '{}';

comment on column public.receitas.alergenos is 'Alérgenos presentes, vocabulário fechado: lactose, gluten, amendoim, ovo, castanhas, peixe, frutos_do_mar, soja.';
comment on column public.receitas.dietas_atendidas is 'Dietas/restrições que a receita atende: vegetariano, vegano, sem_gluten, sem_lactose.';

-- Backfill das 12 receitas semeadas em 0002_seed_receitas.sql
update public.receitas set alergenos = '{ovo}', dietas_atendidas = '{vegetariano,sem_gluten,sem_lactose}'
  where nome = 'Omelete de claras com espinafre';
update public.receitas set alergenos = '{amendoim,lactose}', dietas_atendidas = '{vegetariano}'
  where nome = 'Aveia com banana e pasta de amendoim';
update public.receitas set alergenos = '{}', dietas_atendidas = '{sem_gluten,sem_lactose}'
  where nome = 'Frango grelhado com batata-doce e brócolis';
update public.receitas set alergenos = '{peixe}', dietas_atendidas = '{sem_gluten,sem_lactose}'
  where nome = 'Salmão assado com quinoa e legumes';
update public.receitas set alergenos = '{lactose}', dietas_atendidas = '{sem_gluten}'
  where nome = 'Tapioca com frango desfiado';
update public.receitas set alergenos = '{lactose,gluten}', dietas_atendidas = '{vegetariano}'
  where nome = 'Iogurte grego com granola e frutas vermelhas';
update public.receitas set alergenos = '{gluten,lactose,peixe}', dietas_atendidas = '{}'
  where nome = 'Wrap integral de atum';
update public.receitas set alergenos = '{}', dietas_atendidas = '{sem_gluten,sem_lactose}'
  where nome = 'Sopa de legumes com frango';
update public.receitas set alergenos = '{lactose}', dietas_atendidas = '{vegetariano}'
  where nome = 'Shake proteico pós-treino';
update public.receitas set alergenos = '{castanhas}', dietas_atendidas = '{vegetariano,vegano,sem_gluten,sem_lactose}'
  where nome = 'Mix de castanhas pré-treino';
update public.receitas set alergenos = '{}', dietas_atendidas = '{vegetariano,vegano,sem_gluten,sem_lactose}'
  where nome = 'Salada de grão-de-bico com legumes';
update public.receitas set alergenos = '{castanhas}', dietas_atendidas = '{vegetariano,sem_gluten,sem_lactose}'
  where nome = 'Pudim de chia com cacau';
