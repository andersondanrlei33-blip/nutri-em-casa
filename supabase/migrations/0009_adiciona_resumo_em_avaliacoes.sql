-- Salva o resumo em texto corrido da consulta (calculations.ts::montarResumoConsulta)
-- pra poder mostrar exatamente o que foi dito ao paciente na hora, quando
-- ele revisitar essa consulta no Histórico depois. Nullable: consultas
-- feitas antes dessa coluna existir não têm esse texto (a tela de detalhe
-- cai de volta pro "ajuste_seguranca" nesses casos).
ALTER TABLE avaliacoes_nutricionais ADD COLUMN IF NOT EXISTS resumo text;
