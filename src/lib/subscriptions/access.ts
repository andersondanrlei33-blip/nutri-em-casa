import type { Assinatura } from "@/types/domain";
import { PLANOS, type FuncionalidadesPlano } from "./plans";

/** Assinatura efetiva de um usuário sem registro (nunca assinou nada). */
export function assinaturaPadrao(usuarioId: string): Assinatura {
  return {
    id: "sem-registro",
    usuario_id: usuarioId,
    plano: "gratuito",
    status: "ativa",
    provedor: null,
    id_externo: null,
    inicio_em: new Date().toISOString(),
    renovacao_em: null,
    trial_termina_em: null,
    cancelada_em: null,
    criado_em: new Date().toISOString(),
  };
}

/** Está com acesso Premium ativo (inclui trial e anual)? */
export function temAcessoPremium(assinatura: Assinatura): boolean {
  if (assinatura.status === "cancelada" || assinatura.status === "expirada") return false;
  if (assinatura.status === "inadimplente") return false;

  if (assinatura.plano === "trial") {
    if (!assinatura.trial_termina_em) return false;
    return new Date(assinatura.trial_termina_em) > new Date();
  }

  return assinatura.plano === "premium" || assinatura.plano === "anual";
}

export function funcionalidadesAtivas(assinatura: Assinatura): FuncionalidadesPlano {
  const premiumAtivo = temAcessoPremium(assinatura);
  return premiumAtivo ? PLANOS.premium.funcionalidades : PLANOS.gratuito.funcionalidades;
}

export function podeUsarFuncionalidade(
  assinatura: Assinatura,
  funcionalidade: keyof FuncionalidadesPlano
): boolean {
  const flags = funcionalidadesAtivas(assinatura);
  const valor = flags[funcionalidade];
  return typeof valor === "boolean" ? valor : true;
}

/** Verifica se um contador (ex: receitas salvas) ainda está dentro do limite do plano. */
export function dentroDoLimite(
  assinatura: Assinatura,
  funcionalidade: "limiteReceitasSalvas" | "limitePlanosAtivos",
  quantidadeAtual: number
): boolean {
  const limite = funcionalidadesAtivas(assinatura)[funcionalidade];
  if (limite === null) return true;
  return quantidadeAtual < limite;
}

export function diasRestantesTrial(assinatura: Assinatura): number {
  if (assinatura.plano !== "trial" || !assinatura.trial_termina_em) return 0;
  const diff = new Date(assinatura.trial_termina_em).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}
