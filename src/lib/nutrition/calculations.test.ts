/**
 * Motor de cálculo nutricional — Nutri em Casa
 *
 * Funções puras, sem dependências externas, cobrindo:
 *  - IMC (Índice de Massa Corporal)
 *  - TMB (Taxa Metabólica Basal) — Mifflin-St Jeor
 *  - TDEE (Gasto Energético Diário Total)
 *  - Metas calóricas por objetivo
 *  - Distribuição de macronutrientes (proteína, carboidrato, gordura, fibra)
 *  - Água recomendada
 *
 * Mantidas isoladas de I/O para serem 100% testáveis e reutilizáveis tanto
 * no cliente (preview instantâneo durante a consulta) quanto no servidor
 * (geração oficial do plano, salva no banco).
 */

import type { CondicaoSaude, Genero, NivelAtividade, ObjetivoNutricional } from "../../types/domain.ts";

export interface DadosAntropometricos {
  pesoKg: number;
  alturaCm: number;
  idade: number;
  genero: Genero;
}

const FATOR_ATIVIDADE: Record<NivelAtividade, number> = {
  sedentario: 1.2,
  leve: 1.375,
  moderado: 1.55,
  intenso: 1.725,
  atleta: 1.9,
};

/** IMC = peso (kg) / altura (m)^2 */
export function calcularIMC({ pesoKg, alturaCm }: DadosAntropometricos): number {
  if (pesoKg <= 0 || alturaCm <= 0) {
    throw new Error("Peso e altura devem ser maiores que zero.");
  }
  const alturaM = alturaCm / 100;
  return arredondar(pesoKg / (alturaM * alturaM), 1);
}

export function classificarIMC(imc: number): string {
  if (imc < 18.5) return "Abaixo do peso";
  if (imc < 25) return "Peso normal";
  if (imc < 30) return "Sobrepeso";
  if (imc < 35) return "Obesidade grau I";
  if (imc < 40) return "Obesidade grau II";
  return "Obesidade grau III";
}

/**
 * TMB pela equação de Mifflin-St Jeor (mais precisa que Harris-Benedict
 * para a população geral, segundo a Academy of Nutrition and Dietetics).
 */
export function calcularTMB({ pesoKg, alturaCm, idade, genero }: DadosAntropometricos): number {
  const base = 10 * pesoKg + 6.25 * alturaCm - 5 * idade;
  const ajuste = genero === "masculino" ? 5 : genero === "feminino" ? -161 : -78; // média para "outro"
  return arredondar(base + ajuste, 0);
}

export function calcularTDEE(tmb: number, nivelAtividade: NivelAtividade): number {
  return arredondar(tmb * FATOR_ATIVIDADE[nivelAtividade], 0);
}

/**
 * Piso calórico mínimo de segurança: um déficit nunca deve levar a meta
 * abaixo desses valores sem acompanhamento presencial (referência clínica
 * usual: ~1200 kcal/dia para mulheres, ~1500 kcal/dia para homens).
 */
const PISO_CALORICO: Record<Genero, number> = {
  feminino: 1200,
  masculino: 1500,
  outro: 1350,
};

export interface CondicaoEspecial {
  gestante?: boolean;
  lactante?: boolean;
  historicoTranstornoAlimentar?: boolean;
  /** Sinal indireto de possível transtorno alimentar não declarado: IMC já
   *  abaixo do peso (< 18.5) e objetivo escolhido é emagrecimento. Um
   *  nutricionista fica atento a essa combinação mesmo sem a pessoa marcar
   *  "histórico de transtorno alimentar" explicitamente. */
  imcAbaixoDoPesoComObjetivoEmagrecimento?: boolean;
}

export interface MetaCaloricaResultado {
  valor: number;
  /** Explicação do ajuste de segurança aplicado, se houver (null = nenhum ajuste). */
  avisoSeguranca: string | null;
}

/**
 * Ajuste calórico por objetivo. Déficit/superávit conservadores e
 * seguros (evitando restrições agressivas), alinhados a diretrizes de
 * emagrecimento/ganho de massa saudáveis (~0.5-1% do peso corporal/semana).
 *
 * Duas travas de segurança, nessa ordem de prioridade:
 *  1) Gestação, amamentação ou histórico de transtorno alimentar: NUNCA
 *     aplica déficit/superávit automático, independente do objetivo
 *     escolhido — usa manutenção (TDEE) e recomenda acompanhamento.
 *  2) Piso calórico mínimo: mesmo sem condição especial, a meta nunca
 *     fica abaixo do piso seguro por gênero.
 */
export function calcularMetaCalorica(
  tdee: number,
  objetivo: ObjetivoNutricional,
  genero: Genero,
  condicaoEspecial: CondicaoEspecial = {}
): MetaCaloricaResultado {
  const { gestante, lactante, historicoTranstornoAlimentar, imcAbaixoDoPesoComObjetivoEmagrecimento } =
    condicaoEspecial;

  if (gestante || lactante || historicoTranstornoAlimentar) {
    const motivo = gestante ? "gravidez" : lactante ? "amamentação" : "histórico de transtorno alimentar";
    return {
      valor: tdee,
      avisoSeguranca:
        `Por segurança, sua meta foi ajustada para manutenção calórica (sem déficit ou superávit) devido a ${motivo} ` +
        "informado(a) na consulta. Recomendamos fortemente buscar acompanhamento com um nutricionista licenciado " +
        "para orientação individualizada nesta fase.",
    };
  }

  if (imcAbaixoDoPesoComObjetivoEmagrecimento) {
    return {
      valor: tdee,
      avisoSeguranca:
        "Seu IMC atual já está na faixa 'abaixo do peso', então não aplicamos o déficit calórico que o objetivo de " +
        "emagrecimento pediria — isso não seria seguro. Ajustamos sua meta para manutenção e recomendamos fortemente " +
        "conversar com um nutricionista ou médico antes de buscar perder mais peso.",
    };
  }

  let bruta: number;
  switch (objetivo) {
    case "emagrecimento":
      bruta = arredondar(tdee * 0.8, 0); // déficit de ~20%
      break;
    case "ganho_massa":
      bruta = arredondar(tdee * 1.12, 0); // superávit de ~12%
      break;
    case "performance_esportiva":
      bruta = arredondar(tdee * 1.08, 0);
      break;
    case "manutencao":
    case "saude_geral":
    default:
      bruta = tdee;
  }

  const piso = PISO_CALORICO[genero];
  if (bruta < piso) {
    return {
      valor: piso,
      avisoSeguranca:
        `Sua meta calórica calculada ficou abaixo do mínimo seguro recomendado (${piso} kcal/dia), então ajustamos ` +
        "para esse piso. Déficits mais agressivos que isso não devem ser feitos sem acompanhamento profissional presencial.",
    };
  }

  return { valor: bruta, avisoSeguranca: null };
}

export interface Macros {
  proteinaG: number;
  carboidratoG: number;
  gorduraG: number;
  fibraG: number;
}

/**
 * Distribuição de macros baseada no objetivo e no peso corporal
 * (proteína/gordura por kg, restante em carboidrato), respeitando os
 * mínimos recomendados por diretrizes de nutrição esportiva/clínica.
 *
 * `limiteProteinaPorKg` permite capar a proteína por uma condição de saúde
 * (ex: doença renal) independente do que o objetivo pediria.
 */
export function calcularMacros(
  metaCalorica: number,
  pesoKg: number,
  objetivo: ObjetivoNutricional,
  limiteProteinaPorKg: number | null = null
): Macros {
  let proteinaPorKg: number;
  let gorduraPorKg: number;

  switch (objetivo) {
    case "emagrecimento":
      proteinaPorKg = 2.0; // preserva massa magra em déficit
      gorduraPorKg = 0.8;
      break;
    case "ganho_massa":
      proteinaPorKg = 1.8;
      gorduraPorKg = 1.0;
      break;
    case "performance_esportiva":
      proteinaPorKg = 1.8;
      gorduraPorKg = 0.9;
      break;
    default:
      proteinaPorKg = 1.4;
      gorduraPorKg = 0.9;
  }

  if (limiteProteinaPorKg != null) {
    proteinaPorKg = Math.min(proteinaPorKg, limiteProteinaPorKg);
  }

  const proteinaG = arredondar(pesoKg * proteinaPorKg, 0);
  const gorduraG = arredondar(pesoKg * gorduraPorKg, 0);

  const caloriasProteina = proteinaG * 4;
  const caloriasGordura = gorduraG * 9;
  const caloriasRestantes = Math.max(metaCalorica - caloriasProteina - caloriasGordura, 0);
  const carboidratoG = arredondar(caloriasRestantes / 4, 0);

  // Fibra: 14g por 1000 kcal (diretriz USDA/Institute of Medicine)
  const fibraG = arredondar((metaCalorica / 1000) * 14, 0);

  return { proteinaG, carboidratoG, gorduraG, fibraG };
}

/**
 * Água recomendada: 35ml/kg como base, +500ml se nível de atividade
 * moderado ou superior (perda extra por suor).
 */
export function calcularAguaRecomendada(pesoKg: number, nivelAtividade: NivelAtividade): number {
  const base = pesoKg * 35;
  const extra = ["moderado", "intenso", "atleta"].includes(nivelAtividade) ? 500 : 0;
  return arredondar(base + extra, 0);
}

/**
 * Avalia as condições de saúde crônicas informadas (lista fechada — não
 * texto livre) e retorna: (a) um limite de proteína/kg quando a condição
 * exige isso por segurança, e (b) recomendações em texto. Deliberadamente
 * conservador: quando não temos como calcular um ajuste preciso (ex:
 * tireoide, diabetes), não fingimos precisão — recomendamos acompanhamento
 * em vez de adivinhar um número.
 */
export function avaliarCondicoesSaude(condicoes: CondicaoSaude[]): {
  avisos: string[];
  limiteProteinaPorKg: number | null;
} {
  const avisos: string[] = [];
  let limiteProteinaPorKg: number | null = null;

  if (condicoes.includes("doenca_renal")) {
    limiteProteinaPorKg = 1.0;
    avisos.push(
      "Como você informou uma condição renal, ajustamos sua proteína para um valor mais conservador. O ideal é " +
        "que a quantidade exata seja definida por um nutricionista ou nefrologista com base nos seus exames."
    );
  }
  if (condicoes.includes("diabetes_tipo1") || condicoes.includes("diabetes_tipo2")) {
    avisos.push(
      "Como você informou diabetes, é importante monitorar a distribuição de carboidratos ao longo do dia e sua " +
        "glicemia com acompanhamento profissional — os valores aqui são uma referência geral, não uma prescrição individualizada."
    );
  }
  if (condicoes.includes("hipertensao")) {
    avisos.push(
      "Como você informou hipertensão, modere o sódio (sal, industrializados, temperos prontos) e, se possível, " +
        "acompanhe sua pressão regularmente."
    );
  }
  if (condicoes.includes("hipotireoidismo") || condicoes.includes("hipertireoidismo")) {
    avisos.push(
      "Alterações de tireoide afetam seu metabolismo de um jeito que este cálculo não mede sozinho — o ideal é " +
        "ajustar sua meta calórica com acompanhamento profissional, principalmente se notar resultados muito diferentes do esperado."
    );
  }
  if (condicoes.includes("colesterol_alto")) {
    avisos.push(
      "Como você informou colesterol alto, priorize gorduras insaturadas (azeite, castanhas, peixes) e modere frituras e gorduras saturadas."
    );
  }

  return { avisos, limiteProteinaPorKg };
}

/** Recomendações a partir de sono/estresse informados na consulta — dado que
 *  antes era coletado e nunca usado. Não altera nenhum cálculo, só orienta. */
export function avaliarSonoEEstresse(qualidadeSono: number | null, nivelEstresse: number | null): string[] {
  const avisos: string[] = [];
  if (qualidadeSono != null && qualidadeSono <= 2) {
    avisos.push(
      "Sua qualidade de sono está baixa. Sono ruim está associado a mais fome ao longo do dia e mais dificuldade " +
        "para perder peso — melhorar isso pode ajudar tanto quanto ajustar a dieta."
    );
  }
  if (nivelEstresse != null && nivelEstresse >= 4) {
    avisos.push(
      "Seu nível de estresse está alto. Estresse crônico eleva o cortisol e pode dificultar tanto o emagrecimento " +
        "quanto o ganho de massa — vale cuidar disso junto com a alimentação."
    );
  }
  return avisos;
}

/**
 * Relação cintura-quadril (RCQ) — indicador clássico de risco cardiovascular
 * quando as duas medidas estão disponíveis. Referências de corte (OMS):
 * mulher ≥0.85 e homem ≥0.90 já indicam risco aumentado.
 */
export function calcularRCQ(
  cinturaCm: number,
  quadrilCm: number,
  genero: Genero
): { valor: number; classificacao: string } {
  const valor = arredondar(cinturaCm / quadrilCm, 2);

  if (genero === "masculino") {
    return { valor, classificacao: valor >= 0.9 ? "Risco aumentado" : "Risco baixo" };
  }
  if (genero === "feminino") {
    return { valor, classificacao: valor >= 0.85 ? "Risco aumentado" : "Risco baixo" };
  }
  // Sem um corte padronizado para "outro" — mostramos o número com um corte
  // conservador (média dos dois) em vez de inventar uma referência específica.
  return { valor, classificacao: valor >= 0.875 ? "Risco possivelmente aumentado" : "Risco baixo" };
}

export interface ResultadoAvaliacao {
  imc: number;
  classificacaoImc: string;
  tmb: number;
  tdee: number;
  metaCalorica: number;
  macros: Macros;
  aguaMl: number;
  /** Todos os avisos/recomendações da consulta: segurança calórica, condições
   *  de saúde informadas e sono/estresse — nessa ordem de prioridade. */
  avisos: string[];
}

/** Executa a bateria completa de cálculos a partir dos dados da consulta. */
export function gerarResultadoAvaliacao(
  dados: DadosAntropometricos & {
    nivelAtividade: NivelAtividade;
    objetivo: ObjetivoNutricional;
    condicoesSaude?: CondicaoSaude[];
    qualidadeSono?: number | null;
    nivelEstresse?: number | null;
  } & CondicaoEspecial
): ResultadoAvaliacao {
  const imc = calcularIMC(dados);
  const classificacaoImc = classificarIMC(imc);
  const tmb = calcularTMB(dados);
  const tdee = calcularTDEE(tmb, dados.nivelAtividade);
  const { valor: metaCalorica, avisoSeguranca } = calcularMetaCalorica(tdee, dados.objetivo, dados.genero, {
    gestante: dados.gestante,
    lactante: dados.lactante,
    historicoTranstornoAlimentar: dados.historicoTranstornoAlimentar,
    imcAbaixoDoPesoComObjetivoEmagrecimento: imc < 18.5 && dados.objetivo === "emagrecimento",
  });

  const { avisos: avisosCondicoes, limiteProteinaPorKg } = avaliarCondicoesSaude(dados.condicoesSaude ?? []);
  const macros = calcularMacros(metaCalorica, dados.pesoKg, dados.objetivo, limiteProteinaPorKg);
  const aguaMl = calcularAguaRecomendada(dados.pesoKg, dados.nivelAtividade);
  const avisosSono = avaliarSonoEEstresse(dados.qualidadeSono ?? null, dados.nivelEstresse ?? null);

  const avisos = [avisoSeguranca, ...avisosCondicoes, ...avisosSono].filter((a): a is string => Boolean(a));

  return { imc, classificacaoImc, tmb, tdee, metaCalorica, macros, aguaMl, avisos };
}

function arredondar(valor: number, casas: number): number {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}
