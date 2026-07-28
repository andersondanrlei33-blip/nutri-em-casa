-- =====================================================================
-- "condicoes_saude" passa a guardar uma lista fechada de slugs (ver tipo
-- CondicaoSaude no app) em vez de texto livre — cada uma dispara um ajuste
-- clínico específico (ex: doença renal limita proteína). Dados antigos em
-- texto livre (poucas linhas de teste) ficam órfãos, sem problema.
-- =====================================================================
alter table public.avaliacoes_nutricionais
  add column if not exists condicoes_saude_outras text,
  add column if not exists medicamentos_em_uso text[] not null default '{}';

comment on column public.avaliacoes_nutricionais.condicoes_saude is 'Lista fechada de slugs: diabetes_tipo1, diabetes_tipo2, hipertensao, doenca_renal, hipotireoidismo, hipertireoidismo, colesterol_alto.';
comment on column public.avaliacoes_nutricionais.condicoes_saude_outras is 'Condições relevantes não cobertas pela lista fechada — apenas registro, sem ajuste automático no cálculo.';
comment on column public.avaliacoes_nutricionais.medicamentos_em_uso is 'Medicamentos em uso informados na consulta — apenas registro/contexto, sem ajuste automático no cálculo ainda.';
comment on column public.avaliacoes_nutricionais.ajuste_seguranca is 'Todos os avisos/recomendações da consulta (segurança calórica + condições de saúde + sono/estresse), concatenados.';
