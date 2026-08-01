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
// Rotação: escolhe sempre a PRÓXIMA variante da lista pra aquele paciente
// naquela categoria, e quando chega no fim, volta pra primeira — mesmo
// mecanismo já usado em calculations.ts::escolherVariante pro resto do app
// (sono, estresse, elogios da anamnese etc.), reaproveitado aqui pra ficar
// consistente. Índice = hash(código da categoria) + (número da consulta - 1),
// módulo a quantidade de variantes. Isso dá as mesmas garantias de lá:
//   - nunca repete a variante anterior pro mesmo paciente na mesma categoria
//     (a menos que a lista tenha só 1 variante);
//   - quando esgota a lista, recomeça do início, sem quebrar nem travar;
//   - categorias diferentes não ficam "sincronizadas" mostrando sempre o
//     texto de mesmo índice ao mesmo tempo, graças ao hash do código;
//   - determinístico: mesmo paciente + mesma categoria + mesmo número de
//     consulta sempre dá o mesmo texto, fácil de testar.
// Isso NÃO é a mesma coisa que o "nunca repetir dentro de X dias" descrito
// no Apêndice da Biblioteca Clínica (que pensa em janela de tempo, não em
// número de consulta) — na prática o resultado é equivalente pro caso de
// uso real (consultas não se repetem no mesmo dia), e evita ter que guardar
// histórico novo no banco, mesma decisão de design já usada em todo o resto
// do app.
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
   *
   * `numeroConsulta`: número sequencial da consulta do paciente (1ª, 2ª,
   * 3ª...) — usado pra rotacionar as variantes (ver comentário no topo do
   * arquivo). Se não vier informado, assume 1 (sempre a primeira variante).
   */
  selecionarInterpretacao(params: {
    codigoCategoria: string;
    pacienteId: string;
    janelaDias?: number;
    formato?: "curto" | "longo";
    numeroConsulta?: number;
  }): Promise<string>;

  selecionarElogio(params: { pacienteId: string; janelaDias?: number; numeroConsulta?: number }): Promise<string>;

  selecionarMotivacional(params: { pacienteId: string; janelaDias?: number; numeroConsulta?: number }): Promise<string>;

  /** Curiosidade educativa opcional (Módulo 18), relacionada a um tema. */
  selecionarEducativa?(params: { tema?: string }): Promise<string>;
}

/** Idêntico em espírito ao calculations.ts::escolherVariante — mesma conta
 *  (hash da chave + número da consulta, módulo o tamanho da lista) — só
 *  reimplementado aqui pra não criar uma dependência cruzada entre
 *  lib/avaliacaoFisica/ e lib/nutrition/calculations.ts (módulos com
 *  responsabilidades separadas, ver nota no topo do arquivo). */
function escolherRotativo(opcoes: string[], chave: string, numeroConsulta: number): string {
  if (opcoes.length === 0) return "";
  let hash = 0;
  for (let i = 0; i < chave.length; i++) hash = (hash * 31 + chave.charCodeAt(i)) % 997;
  const indice = (hash + Math.max(0, numeroConsulta - 1)) % opcoes.length;
  return opcoes[indice];
}

/**
 * Implementação real, com os textos oficiais da Biblioteca Clínica
 * (biblioteca_clinica_nutri_em_casa.md — Módulos 1, 16, 17 e 19).
 */
export class BibliotecaClinicaReal implements BibliotecaClinica {
  async selecionarInterpretacao({
    codigoCategoria,
    formato = "longo",
    numeroConsulta = 1,
  }: {
    codigoCategoria: string;
    pacienteId: string;
    janelaDias?: number;
    formato?: "curto" | "longo";
    numeroConsulta?: number;
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
    // chave inclui o formato pra que "curto" e "longo" da mesma categoria
    // rotacionem de forma independente (senão os dois "andariam juntos").
    return escolherRotativo(opcoes, `${codigoCategoria}-${formato}`, numeroConsulta);
  }

  async selecionarElogio({ numeroConsulta = 1 }: { pacienteId: string; janelaDias?: number; numeroConsulta?: number }): Promise<string> {
    return escolherRotativo(ELOGIOS, "elogio-avalfisica", numeroConsulta);
  }

  async selecionarMotivacional({ numeroConsulta = 1 }: { pacienteId: string; janelaDias?: number; numeroConsulta?: number }): Promise<string> {
    return escolherRotativo(MOTIVACIONAIS, "motivacional-avalfisica", numeroConsulta);
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
