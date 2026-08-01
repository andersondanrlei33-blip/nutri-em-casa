// ============================================================================
// bibliotecaSelector.ts
// Porta de acesso à Biblioteca Clínica. Implementação real (BibliotecaClinicaReal,
// abaixo) — os textos vêm de bibliotecaClinicaDados.ts, extraído diretamente de
// biblioteca_clinica_nutri_em_casa.md (Módulos 1, 16, 17 e 19).
//
// O motor de regras e o montador de consulta não sabem ONDE a biblioteca está
// guardada — só chamam esta interface. Isso deixa aberto trocar a fonte no
// futuro (ex: mover pra uma tabela no Supabase) sem mexer em regras.ts,
// motor.ts, montarConsulta.ts nem resumoGeral.ts.
//
// Escopo: cobre só o que a funcionalidade de avaliação física usa (Módulo 1 —
// IMC, Módulo 16 — elogios, Módulo 17 — motivacionais, Módulo 19 — avaliação
// física). Os Módulos 2-15 e 18 (objetivo, atividade física, sono, estresse,
// água, álcool, tabagismo, mastigação, condições clínicas, combinações,
// curiosidades educativas) ainda não estão aqui — são o trabalho mais amplo já
// em andamento nas tarefas de "Biblioteca clínica de interpretações com
// variantes" / "Integrar Módulos 1-9", que mexe em calculations.ts, não neste
// arquivo. Não duplicado aqui pra não ter duas fontes de verdade.
//
// Rotação: seleciona um texto aleatório entre as variantes disponíveis de
// cada categoria (15-18 por categoria). Isso NÃO é a mesma coisa que o
// "nunca repetir dentro de X dias pro mesmo paciente" descrito no Apêndice da
// Biblioteca Clínica — aquilo exigiria guardar histórico de qual texto cada
// paciente já viu (uma tabela nova no banco), o que é trabalho de escopo
// maior, também correspondente às tarefas de variantes citadas acima. Com
// 15-18 variantes por categoria escolhidas ao acaso, a chance de repetição
// entre duas consultas seguidas do mesmo paciente já é baixa na prática.
// ============================================================================

import { INTERPRETACOES, ELOGIOS, MOTIVACIONAIS } from "./bibliotecaClinicaDados";

export interface BibliotecaClinica {
  /**
   * Retorna um texto de interpretação de uma categoria específica (ex:
   * "AVALFISICA-IMC-MASCARADO-MUSCULO" ou "IMC-SOBREPESO", do Módulo 1).
   *
   * `formato`: "longo" (padrão) é usado no card de Composição Corporal;
   * "curto" é usado no Resumo Geral (Seção 5.4 da spec) — 1-2 frases,
   * sem repetir a explicação completa que já aparece no card detalhado.
   */
  selecionarInterpretacao(params: {
    codigoCategoria: string;
    pacienteId: string;
    janelaDias?: number;
    formato?: "curto" | "longo";
  }): Promise<string>;

  selecionarElogio(params: { pacienteId: string; janelaDias?: number }): Promise<string>;

  selecionarMotivacional(params: { pacienteId: string; janelaDias?: number }): Promise<string>;

  /** Curiosidade educativa opcional (Módulo 18), relacionada a um tema. */
  selecionarEducativa?(params: { tema?: string }): Promise<string>;
}

function escolherAoAcaso(opcoes: string[]): string {
  return opcoes[Math.floor(Math.random() * opcoes.length)];
}

/**
 * Implementação real, com os textos oficiais da Biblioteca Clínica
 * (biblioteca_clinica_nutri_em_casa.md — Módulos 1, 16, 17 e 19).
 */
export class BibliotecaClinicaReal implements BibliotecaClinica {
  async selecionarInterpretacao({
    codigoCategoria,
    formato = "longo",
  }: {
    codigoCategoria: string;
    pacienteId: string;
    janelaDias?: number;
    formato?: "curto" | "longo";
  }): Promise<string> {
    const entrada = INTERPRETACOES[codigoCategoria];
    if (!entrada) {
      return `[Sem interpretação cadastrada para "${codigoCategoria}" — adicionar na Biblioteca Clínica, Módulo 19]`;
    }

    // fallback: se pediram "curto" mas só existe "longo" (ou vice-versa),
    // usa o que tiver disponível em vez de falhar — melhor um texto no
    // formato "errado" do que nenhum texto. Algumas categorias do Módulo 19
    // só têm formato longo mesmo (as que não são regra "manchete" — ver
    // regras.ts, campo usoNoResumo).
    const opcoes = entrada[formato] ?? entrada.longo ?? entrada.curto;
    if (!opcoes || opcoes.length === 0) {
      return `[Sem interpretação em formato "${formato}" para "${codigoCategoria}"]`;
    }
    return escolherAoAcaso(opcoes);
  }

  async selecionarElogio(): Promise<string> {
    return escolherAoAcaso(ELOGIOS);
  }

  async selecionarMotivacional(): Promise<string> {
    return escolherAoAcaso(MOTIVACIONAIS);
  }

  /**
   * Módulo 18 (curiosidades educativas) ainda não foi extraído pro arquivo
   * de dados — tem 21 subtemas (19.1 a 19.21 no .md) que pedem um mapeamento
   * de `tema` pra subtema, mais trabalhoso que os outros 4 módulos e não
   * usado hoje por nenhum fluxo da avaliação física. Mantido um fallback
   * genérico por enquanto; migrar quando o Módulo 18 for necessário de fato.
   */
  async selecionarEducativa(): Promise<string> {
    return "A hidratação adequada influencia praticamente todos os processos do organismo.";
  }
}
