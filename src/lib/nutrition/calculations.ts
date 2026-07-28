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

import type { Genero, NivelAtividade, ObjetivoNutricional } from "../../types/domain.ts";

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
 * Ajuste calórico por objetivo. Déficit/superávit conservadores e
 * seguros (evitando restrições agressivas), alinhados a diretrizes de
 * emagrecimento/ganho de massa saudáveis (~0.5-1% do peso corporal/semana).
 */
export function calcularMetaCalorica(tdee: number, objetivo: ObjetivoNutricional): number {
  switch (objetivo) {
    case "emagrecimento":
      return arredondar(tdee * 0.8, 0); // déficit de ~20%
    case "ganho_massa":
      return arredondar(tdee * 1.12, 0); // superávit de ~12%
    case "performance_esportiva":
      return arredondar(tdee * 1.08, 0);
    case "manutencao":
    case "saude_geral":
    default:
      return tdee;
  }
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
 */
export function calcularMacros(
  metaCalorica: number,
  pesoKg: number,
  objetivo: ObjetivoNutricional
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

export interface ResultadoAvaliacao {
  imc: number;
  classificacaoImc: string;
  tmb: number;
  tdee: number;
  metaCalorica: number;
  macros: Macros;
  aguaMl: number;
}

/** Executa a bateria completa de cálculos a partir dos dados da consulta. */
export function gerarResultadoAvaliacao(
  dados: DadosAntropometricos & { nivelAtividade: NivelAtividade; objetivo: ObjetivoNutricional }
): ResultadoAvaliacao {
  const imc = calcularIMC(dados);
  const classificacaoImc = classificarIMC(imc);
  const tmb = calcularTMB(dados);
  const tdee = calcularTDEE(tmb, dados.nivelAtividade);
  const metaCalorica = calcularMetaCalorica(tdee, dados.objetivo);
  const macros = calcularMacros(metaCalorica, dados.pesoKg, dados.objetivo);
  const aguaMl = calcularAguaRecomendada(dados.pesoKg, dados.nivelAtividade);

  return { imc, classificacaoImc, tmb, tdee, metaCalorica, macros, aguaMl };
}

function arredondar(valor: number, casas: number): number {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}
