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

/** Variantes da frase de abertura do cartão de Composição Corporal — antes
 *  era um texto único fixo (só a data mudava), então em consultas seguidas
 *  a IA sempre "começava igual", mesmo com todo o resto do texto rotacionando
 *  (achado real: usuária percebeu a repetição comparando duas consultas
 *  lado a lado). Cada `{data}` é substituído pela data do exame. */
const VARIANTES_ABERTURA = [
  "Dando uma olhada com calma nos números do seu exame de {data}, alguns pontos merecem destaque.",
  "Vamos conversar sobre o que o seu exame de {data} mostrou — com calma, ponto por ponto.",
  "Analisando os dados do seu exame de {data}, alguns detalhes valem ser destacados agora.",
  "Com base no exame de {data}, separei os pontos que fazem mais diferença pra você entender seu corpo hoje.",
  "Olhando de perto os resultados do seu exame de {data}, quero te mostrar o que eles realmente significam.",
  "O seu exame de {data} trouxe informações importantes — vamos passar por elas com atenção.",
];

/** Idêntico em espírito ao bibliotecaSelector.ts::escolherRotativo (hash da
 *  chave + número da consulta, módulo o tamanho da lista) — reimplementado
 *  aqui pra não criar uma dependência entre este arquivo e bibliotecaSelector.ts,
 *  mesmo princípio de separação já documentado lá. */
function escolherRotativo(opcoes: string[], chave: string, numeroConsulta: number): string {
  let hash = 0;
  for (let i = 0; i < chave.length; i++) hash = (hash * 31 + chave.charCodeAt(i)) % 997;
  const indice = (hash + Math.max(0, numeroConsulta - 1)) % opcoes.length;
  return opcoes[indice];
}

function gerarAbertura(dados: AvaliacaoFisicaNormalizada, pacienteId: string, numeroConsulta: number): string {
  // Formata a data manualmente a partir da string ISO (ex: "2025-12-17"),
  // sem passar por new Date(...).toLocaleDateString(), que interpreta a
  // string como UTC e pode exibir o dia anterior dependendo do fuso
  // horário do servidor (bug real encontrado ao testar este arquivo).
  const [ano, mes, dia] = dados.meta.dataAvaliacao.split("-");
  const data = ano && mes && dia ? `${dia}/${mes}/${ano}` : dados.meta.dataAvaliacao;
  const template = escolherRotativo(VARIANTES_ABERTURA, `abertura-avalfisica-${pacienteId}`, numeroConsulta);
  return template.replace("{data}", data);
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
  const blocos: string[] = [gerarAbertura(dados, perfil.id, numeroConsulta)];

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
