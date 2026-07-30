import type { Receita } from "@/types/domain";

/**
 * Monta os campos de macro/calorias de um registro de consumo a partir da
 * receita e da quantidade de porções — usado tanto ao marcar uma refeição
 * do plano como consumida (Dashboard e Plano Alimentar) quanto ao registrar
 * uma troca avulsa na tela de Receitas. Guardar os valores já calculados
 * aqui (em vez de só a receita_id) evita ter que juntar com receitas toda
 * vez que os macros de um dia forem somados.
 */
export function montarRegistroConsumo(receita: Receita, porcoes: number) {
  return {
    receita_id: receita.id,
    calorias: Math.round(receita.calorias * porcoes),
    proteina_g: Math.round(receita.proteina_g * porcoes),
    carboidrato_g: Math.round(receita.carboidrato_g * porcoes),
    gordura_g: Math.round(receita.gordura_g * porcoes),
  };
}
