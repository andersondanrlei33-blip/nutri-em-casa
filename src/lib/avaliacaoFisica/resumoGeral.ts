// ============================================================================
// resumoGeral.ts
// Gera a frase de abertura do relatório ("Resumo Geral"), que é DIFERENTE
// do texto do card de Composição Corporal (montarConsulta.ts). Implementa a
// lógica de decisão da Seção 5.4 da spec:
//
//   1. Sem avaliação física (ex: primeira consulta) → Módulo 1 (IMC), curto.
//   2. Com avaliação física + insight "manchete" disparou → esse insight, curto.
//   3. Com avaliação física, mas nenhuma manchete disparou → Módulo 1 (IMC)
//      calculado a partir do próprio exame, curto (fallback neutro).
// ============================================================================

import {
  AvaliacaoFisicaNormalizada,
  Objetivo,
  PerfilPaciente,
} from "./types";
import { processarAvaliacao } from "./motor";
import { BibliotecaClinica } from "./bibliotecaSelector";
import { classificarImcDetalhado, calcularImc } from "./util";

const TEXTO_OBJETIVO: Record<Objetivo, string> = {
  emagrecimento: "emagrecer",
  hipertrofia: "ganhar massa muscular",
  manutencao: "manter os resultados atuais",
  reeducacao_alimentar: "reconstruir hábitos alimentares",
  saude: "melhorar a saúde geral",
  performance: "melhorar a performance física",
};

function montarFechamento(objetivo: Objetivo | null, metaCaloricaKcal: number): string {
  const objetivoTexto = objetivo ? TEXTO_OBJETIVO[objetivo] : "alcançar seus objetivos";
  return `Considerando seus hábitos e seu objetivo de ${objetivoTexto}, sua meta calórica foi definida em ${metaCaloricaKcal} kcal por dia, buscando um resultado gradual e seguro.`;
}

export interface DadosAutodeclarados {
  pesoKg: number;
  alturaCm: number;
}

/**
 * Gera o texto do "Resumo Geral" — a frase de abertura do relatório de
 * consulta. Não confundir com `montarConsultaAvaliacaoFisica` (que gera o
 * texto do card de Composição Corporal); as duas funções existem porque
 * atendem a lugares diferentes da tela, com formatos diferentes (curto vs
 * longo) e fontes de dado diferentes (autodeclarado vs exame).
 *
 * NOTA: esta função não é chamada diretamente no fluxo da consulta hoje —
 * calculations.ts::montarResumoGeral usa só a "manchete" (via ponte.ts::
 * gerarInterpretacoesAvaliacaoFisica), pra preservar o aviso de segurança
 * (gestante/lactante/histórico de transtorno alimentar/condição clínica
 * complexa/piso calórico) que esta função não trata. Fica disponível pronta
 * pra uso caso o fluxo mude no futuro.
 */
export async function gerarResumoGeral(params: {
  avaliacaoMaisRecente: AvaliacaoFisicaNormalizada | null;
  avaliacaoAnterior?: AvaliacaoFisicaNormalizada | null;
  dadosAutodeclarados: DadosAutodeclarados;
  perfil: PerfilPaciente;
  metaCaloricaKcal: number;
  biblioteca: BibliotecaClinica;
}): Promise<string> {
  const {
    avaliacaoMaisRecente,
    avaliacaoAnterior = null,
    dadosAutodeclarados,
    perfil,
    metaCaloricaKcal,
    biblioteca,
  } = params;

  let fraseImc: string;

  if (avaliacaoMaisRecente === null) {
    // Caso 1 — primeira consulta / paciente nunca fez avaliação física.
    // Só temos peso e altura autodeclarados, sem % de gordura nem massa
    // muscular, então nenhuma regra do motor teria dado suficiente pra
    // disparar (Seção 5.1 da spec) — nem vale a pena chamar processarAvaliacao aqui.
    const imc = calcularImc(dadosAutodeclarados.pesoKg, dadosAutodeclarados.alturaCm);
    const categoria = classificarImcDetalhado(imc);
    fraseImc = await biblioteca.selecionarInterpretacao({
      codigoCategoria: `IMC-${categoria}`,
      pacienteId: perfil.id,
      formato: "curto",
    });
  } else {
    // Caso 2 e 3 — existe avaliação física (mesmo que reaproveitada de uma
    // consulta anterior). Roda o motor completo e procura um insight manchete.
    const insights = processarAvaliacao(avaliacaoMaisRecente, perfil, avaliacaoAnterior);
    const manchete = insights.find((i) => i.usoNoResumo);

    if (manchete) {
      // Caso 2 — um insight manchete disparou (ex: R1, IMC mascarado por músculo)
      fraseImc = await biblioteca.selecionarInterpretacao({
        codigoCategoria: manchete.codigoBibliotecaSugerido,
        pacienteId: perfil.id,
        formato: "curto",
      });
    } else {
      // Caso 3 — tem exame, mas nada de especial disparou sobre o IMC.
      // Cai no Módulo 1 (IMC) mesmo, como fallback neutro, usando o IMC do
      // próprio exame (não o autodeclarado, já que o exame é mais preciso).
      const imcExame = avaliacaoMaisRecente.obesidade.imc.valor;
      const categoria =
        avaliacaoMaisRecente.obesidade.imcCategoriaDetalhada ??
        (imcExame !== null ? classificarImcDetalhado(imcExame) : "NORMAL");
      fraseImc = await biblioteca.selecionarInterpretacao({
        codigoCategoria: `IMC-${categoria}`,
        pacienteId: perfil.id,
        formato: "curto",
      });
    }
  }

  return `${fraseImc} ${montarFechamento(perfil.objetivo, metaCaloricaKcal)}`;
}
