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

import type { CondicaoSaude, ConsumoAlcool, Genero, NivelAtividade, ObjetivoNutricional, StatusTabagismo } from "../../types/domain.ts";
import { normalizar } from "./receitaMatching.ts";

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
  /** Rótulo de uma condição clínica complexa detectada no campo de texto
   *  livre "outra condição" (ex: cirurgia bariátrica, insuficiência cardíaca,
   *  tratamento oncológico) — ver identificarCondicaoClinicaComplexa. Null/
   *  undefined quando nada foi identificado. */
  condicaoClinicaComplexa?: string | null;
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
  const {
    gestante,
    lactante,
    historicoTranstornoAlimentar,
    imcAbaixoDoPesoComObjetivoEmagrecimento,
    condicaoClinicaComplexa,
  } = condicaoEspecial;

  if (condicaoClinicaComplexa) {
    return {
      valor: tdee,
      avisoSeguranca:
        `Você mencionou "${condicaoClinicaComplexa}" — esse tipo de condição precisa de acompanhamento ` +
        "nutricional presencial, com cálculos individualizados que este app não tem como fazer com segurança " +
        "(ex: pós-bariátrica exige volumes de porção muito específicos; algumas condições exigem restrição de " +
        "líquidos, o oposto da meta de água calculada aqui). Por segurança, ajustamos sua meta para manutenção — " +
        "procure um nutricionista ou seu médico antes de seguir qualquer plano alimentar.",
    };
  }

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
 * moderado ou superior (perda extra por suor), +300ml se gestante e
 * +800ml se lactante (referência clínica usual: gestação aumenta a
 * necessidade hídrica moderadamente, e a produção de leite consome
 * bem mais água — lactante tem prioridade se os dois estiverem marcados,
 * o que não deveria acontecer na prática).
 */
export function calcularAguaRecomendada(
  pesoKg: number,
  nivelAtividade: NivelAtividade,
  condicaoEspecial: { gestante?: boolean; lactante?: boolean } = {}
): number {
  const base = pesoKg * 35;
  const extraAtividade = ["moderado", "intenso", "atleta"].includes(nivelAtividade) ? 500 : 0;
  const extraFase = condicaoEspecial.lactante ? 800 : condicaoEspecial.gestante ? 300 : 0;
  return arredondar(base + extraAtividade + extraFase, 0);
}

const CONDICOES_COMPLEXAS_NAO_COBERTAS: { termos: string[]; rotulo: string }[] = [
  {
    termos: ["bariatrica", "bypass gastrico", "sleeve gastrico", "gastrectomia"],
    rotulo: "cirurgia bariátrica",
  },
  {
    termos: ["insuficiencia cardiaca", "dialise", "hemodialise"],
    rotulo: "uma condição que exige restrição de líquidos e acompanhamento médico próximo",
  },
  {
    termos: ["quimioterapia", "radioterapia", "oncologico", "oncologica", "cancer"],
    rotulo: "tratamento oncológico",
  },
  {
    termos: ["crohn", "retocolite", "colite ulcerativa"],
    rotulo: "uma doença inflamatória intestinal",
  },
  {
    termos: ["transplante"],
    rotulo: "histórico de transplante",
  },
];

/**
 * Escaneia o campo de texto livre "outra condição não listada" atrás de
 * termos que indicam uma condição clínica complexa demais para este app
 * calcular com segurança (cirurgia bariátrica, insuficiência cardíaca,
 * tratamento oncológico, doença inflamatória intestinal, transplante...).
 * Mesma lógica de defesa em profundidade já usada pra alergia em
 * receitaMatching.ts::textoContemAlergiaDoUsuario: não confiar só na
 * pessoa saber que precisa buscar ajuda presencial — o app precisa
 * reconhecer isso sozinho e reagir (ver calcularMetaCalorica).
 */
export function identificarCondicaoClinicaComplexa(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const normalizado = normalizar(texto);
  for (const grupo of CONDICOES_COMPLEXAS_NAO_COBERTAS) {
    if (grupo.termos.some((termo) => normalizado.includes(termo))) {
      return grupo.rotulo;
    }
  }
  return null;
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
export function avaliarSonoEEstresse(
  qualidadeSono: number | null,
  nivelEstresse: number | null,
  insonia: boolean = false
): string[] {
  const avisos: string[] = [];
  if (qualidadeSono != null && qualidadeSono <= 2) {
    avisos.push(
      "Sua qualidade de sono está baixa. Sono ruim está associado a mais fome ao longo do dia e mais dificuldade " +
        "para perder peso — melhorar isso pode ajudar tanto quanto ajustar a dieta."
    );
  }
  if (insonia) {
    avisos.push(
      "Você relatou insônia. Sono insuficiente ou fragmentado interfere bastante no apetite e na composição " +
        "corporal — vale investigar isso com um profissional se persistir."
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
 * Avisos nutricionais para dietas restritivas informadas em texto livre
 * (vegetariano/vegano) — nutrientes que exigem atenção extra nesses casos
 * e que um nutricionista sempre comenta na consulta. Reaproveita o mesmo
 * `normalizar` usado pra casar receitas por tag de dieta, então reconhece
 * "vegano", "vegana", "vegetariano", "vegetariana" com ou sem acento.
 */
export function avaliarDietaRestritiva(restricoesAlimentares: string[]): string[] {
  const normalizadas = restricoesAlimentares.map(normalizar);
  const eVegano = normalizadas.some((r) => r.includes("vegan"));
  const eVegetariano = !eVegano && normalizadas.some((r) => r.includes("vegetarian"));

  if (eVegano) {
    return [
      "Como sua dieta é vegana, fique atento à vitamina B12 (não existe em fontes vegetais — geralmente precisa de " +
        "suplementação), além de ferro, cálcio, zinco e ômega-3, que exigem mais planejamento nesse tipo de dieta. " +
        "Vale conversar com um nutricionista sobre suplementação.",
    ];
  }
  if (eVegetariano) {
    return [
      "Como sua dieta é
