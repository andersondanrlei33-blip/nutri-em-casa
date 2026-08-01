// ============================================================================
// util.ts
// Utilitários compartilhados entre motor.ts e resumoGeral.ts.
// ============================================================================

import { CategoriaImcDetalhada } from "./types";

/**
 * Classificação de IMC em 6 níveis (padrão OMS), usada pelo fallback do
 * Resumo Geral (Seção 5.4 da spec) pra buscar no Módulo 1 (IMC) da
 * Biblioteca Clínica — que já usa exatamente essas 6 categorias.
 */
export function classificarImcDetalhado(imc: number): CategoriaImcDetalhada {
  if (imc < 18.5) return "BAIXO";
  if (imc < 25) return "NORMAL";
  if (imc < 30) return "SOBREPESO";
  if (imc < 35) return "OBI";
  if (imc < 40) return "OBII";
  return "OBIII";
}

/** IMC = peso (kg) / altura (m) ao quadrado. */
export function calcularImc(pesoKg: number, alturaCm: number): number {
  const alturaM = alturaCm / 100;
  return pesoKg / (alturaM * alturaM);
}
