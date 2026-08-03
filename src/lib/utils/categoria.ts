import type { CategoriaReceita } from "@/types/domain";

export const CATEGORIA_LABEL: Record<CategoriaReceita, string> = {
  cafe_da_manha: "Café da manhã",
  almoco: "Almoço",
  jantar: "Jantar",
  lanche: "Lanche",
  sobremesa: "Sobremesa",
  pre_treino: "Pré-treino",
  pos_treino: "Pós-treino",
  // Item simples usado só pelo motor de ajuste de macros (ajusteMacros.ts)
  // pra completar um dia que ficou desviado da meta — nunca escolhido
  // manualmente na tela de Receitas, mas precisa de rótulo aqui porque
  // Record<CategoriaReceita, string> exige todos os valores do tipo.
  complemento: "Complemento",
};

/**
 * Estima a categoria de uma refeição pelo horário — usado só como
 * fallback para refeições antigas, salvas antes da coluna "categoria"
 * existir em refeicoes_plano (essas ficaram com categoria = null).
 */
export function inferirCategoriaPorHorario(horario: string): CategoriaReceita {
  const hora = Number(horario.slice(0, 2));
  if (hora < 10) return "cafe_da_manha";
  if (hora < 15) return "almoco";
  if (hora < 18) return "lanche";
  return "jantar";
}
