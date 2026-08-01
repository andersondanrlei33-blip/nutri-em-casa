// ============================================================================
// montarConsulta.ts
// Parte 3 do pipeline: pega os insights já priorizados (motor.ts) e monta
// o texto final de consulta, na ordem definida na Seção 6 da spec:
// abertura → insights (até 4) → elogio (se houver algo positivo) → encerramento.
// ============================================================================

import { AvaliacaoFisicaNormalizada, Insight, PerfilPaciente } from "./types";
import { BibliotecaClinica } from "./bibliotecaSelector";

/**
 * Se os textos da Biblioteca Clínica usarem marcadores tipo {{pgc}}, troque
 * esta função por uma interpolação real. Hoje os textos de exemplo em
 * bibliotecaSelector.ts já vêm prontos, então isto é um passthrough —
 * mantido como ponto de extensão explícito para quando os textos reais
 * (Módulo 19) forem escritos com variáveis embutidas.
 */
function preencherVariaveis(texto: string, _variaveis: Insight["variaveis"]): string {
  return texto;
}

function gerarAbertura(dados: AvaliacaoFisicaNormalizada): string {
  // Formata a data manualmente a partir da string ISO (ex: "2025-12-17"),
  // sem passar por new Date(...).toLocaleDateString(), que interpreta a
  // string como UTC e pode exibir o dia anterior dependendo do fuso
  // horário do servidor (bug real encontrado ao testar este arquivo).
  const [ano, mes, dia] = dados.meta.dataAvaliacao.split("-");
  const data = ano && mes && dia ? `${dia}/${mes}/${ano}` : dados.meta.dataAvaliacao;
  return `Dando uma olhada com calma nos números do seu exame de ${data}, alguns pontos merecem destaque.`;
}

/** Define se cabe puxar um elogio (Módulo 16) no fechamento da consulta. */
function algumInsightPositivo(insights: Insight[]): boolean {
  return insights.some((i) => {
    if (i.codigoRegra === "R7" || i.codigoRegra === "R8") return true;
    if (i.codigoRegra === "R12") return i.variaveis["tendencia"] !== "atencao";
    return false;
  });
}

export async function montarConsultaAvaliacaoFisica(
  insights: Insight[],
  dados: AvaliacaoFisicaNormalizada,
  perfil: PerfilPaciente,
  biblioteca: BibliotecaClinica,
  /** Número sequencial da consulta do paciente (1ª, 2ª, 3ª...) — repassado
   *  pra biblioteca pra rotacionar as variantes (ver bibliotecaSelector.ts).
   *  Se não vier informado, assume 1. */
  numeroConsulta: number = 1
): Promise<string> {
  const blocos: string[] = [gerarAbertura(dados)];

  for (const insight of insights) {
    if (insight.codigoBibliotecaSugerido === "ELOGIO") continue; // tratado separadamente abaixo
    const texto = await biblioteca.selecionarInterpretacao({
      codigoCategoria: insight.codigoBibliotecaSugerido,
      pacienteId: perfil.id,
      janelaDias: 90,
      numeroConsulta,
    });
    blocos.push(preencherVariaveis(texto, insight.variaveis));
  }

  if (algumInsightPositivo(insights)) {
    blocos.push(await biblioteca.selecionarElogio({ pacienteId: perfil.id, janelaDias: 90, numeroConsulta }));
  }

  blocos.push(await biblioteca.selecionarMotivacional({ pacienteId: perfil.id, janelaDias: 90, numeroConsulta }));

  return blocos.join("\n\n");
}
