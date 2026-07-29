-- Adiciona a categoria da refeição (café da manhã, almoço, lanche, jantar...)
-- na tabela refeicoes_plano. Antes essa informação era calculada durante a
-- geração do plano mas nunca persistida, então a tela de Plano Alimentar não
-- tinha como mostrar o rótulo da refeição — só o horário e o nome do prato.
ALTER TABLE refeicoes_plano ADD COLUMN IF NOT EXISTS categoria categoria_receita;
