// ============================================================================
// index.ts
// Ponto de entrada único. É isto (e ponte.ts) que o resto do app deve
// importar — não precisa conhecer motor.ts nem montarConsulta.ts diretamente.
// ============================================================================

export * from "./types";
export * from "./regras";
export * from "./motor";
export * from "./bibliotecaSelector";
export * from "./montarConsulta";
export * from "./resumoGeral";
export * from "./util";
export * from "./ponte";

import { processarAvaliacao } from "./motor";
import { montarConsultaAvaliacaoFisica } from "./montarConsulta";
import { AvaliacaoFisicaNormalizada, PerfilPaciente } from "./types";
import { BibliotecaClinica } from "./bibliotecaSelector";

/**
 * Função de conveniência que junta Parte 2 (motor de regras) + Parte 3
 * (montador de consulta) em uma única chamada.
 *
 * `avaliacaoAnterior` é opcional — passe a avaliação normalizada mais
 * recente do paciente (se houver alguma) para habilitar a regra de
 * evolução (R12), que é o insight de maior valor quando disponível.
 */
export async function gerarConsultaDeAvaliacaoFisica(
  dados: AvaliacaoFisicaNormalizada,
  perfil: PerfilPaciente,
  biblioteca: BibliotecaClinica,
  avaliacaoAnterior: AvaliacaoFisicaNormalizada | null = null,
  /** Número sequencial da consulta do paciente — ver comentário em
   *  bibliotecaSelector.ts::escolherRotativo. Assume 1 se não informado. */
  numeroConsulta: number = 1
): Promise<{ texto: string; insightsDetectados: string[] }> {
  const insights = processarAvaliacao(dados, perfil, avaliacaoAnterior);
  const texto = await montarConsultaAvaliacaoFisica(insights, dados, perfil, biblioteca, numeroConsulta);
  return {
    texto,
    insightsDetectados: insights.map((i) => i.codigoRegra),
  };
}
