-- Vocabulário fechado de indicações de saúde por receita (baixo_sodio,
-- baixo_indice_glicemico, baixo_colesterol, controle_renal, alta_fibra) —
-- permite filtrar/priorizar receitas por condição de saúde no código, igual
-- já é feito pra alergia, em vez de confiar só na IA julgar sozinha.
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS indicacoes_saude text[] NOT NULL DEFAULT '{}';
