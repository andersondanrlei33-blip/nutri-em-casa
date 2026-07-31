// ============================================================================
// motor.ts
// Orquestra as regras: detecta insights, funde os que se sobrepõem
// (Seção 5.2 da spec) e seleciona os 4 de maior prioridade para a consulta.
// ============================================================================

import { AvaliacaoFisicaNormalizada, PerfilPaciente, Insight } from "./types";
import { TODAS_AS_REGRAS } from "./regras";

const MAX_INSIGHTS_NA_CONSULTA = 4;

/** Roda todas as regras cadastradas e retorna só os insights que dispararam. */
export function detectarInsights(
  dados: AvaliacaoFisicaNormalizada,
  perfil: PerfilPaciente,
  anterior: AvaliacaoFisicaNormalizada | null = null
): Insight[] {
  return TODAS_AS_REGRAS.map((regra) => regra(dados, perfil, anterior)).filter(
    (insight): insight is Insight => insight !== null
  );
}

/**
 * Funde insights que compartilham a mesma tagTematica em um único bloco
 * (ex: R2 "gordura no tronco" + R3 "relação cintura-quadril elevada" viram
 * um insight só, usando o texto da regra de maior prioridade e as
 * variáveis das duas para enriquecer o preenchimento do texto).
 */
export function deduplicarEFundir(insights: Insight[]): Insight[] {
  const semTag = insights.filter((i) => !i.tagTematica);
  const comTag = insights.filter((i) => i.tagTematica);

  const grupos = new Map<string, Insight[]>();
  for (const insight of comTag) {
    const tag = insight.tagTematica as string;
    if (!grupos.has(tag)) grupos.set(tag, []);
    grupos.get(tag)!.push(insight);
  }

  const fundidos: Insight[] = [];
  for (const grupo of grupos.values()) {
    const ordenado = [...grupo].sort((a, b) => a.prioridade - b.prioridade);
    const principal = ordenado[0];
    const complementares = ordenado.slice(1);

    fundidos.push({
      ...principal,
      variaveis: {
        ...principal.variaveis,
        ...complementares.reduce((acc, c) => ({ ...acc, ...c.variaveis }), {}),
      },
    });
  }

  return [...semTag, ...fundidos];
}

/** Ordena por prioridade (1 = mais importante) e corta no máximo definido. */
export function ordenarEPriorizar(insights: Insight[]): Insight[] {
  return [...insights].sort((a, b) => a.prioridade - b.prioridade).slice(0, MAX_INSIGHTS_NA_CONSULTA);
}

/** Pipeline completo: detectar → fundir → priorizar. Use esta função na prática. */
export function processarAvaliacao(
  dados: AvaliacaoFisicaNormalizada,
  perfil: PerfilPaciente,
  anterior: AvaliacaoFisicaNormalizada | null = null
): Insight[] {
  const brutos = detectarInsights(dados, perfil, anterior);
  const fundidos = deduplicarEFundir(brutos);
  return ordenarEPriorizar(fundidos);
}
