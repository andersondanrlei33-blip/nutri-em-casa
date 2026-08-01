// ============================================================================
// ponte.ts
// Traduz o que o app já extrai hoje de uma foto de avaliação física
// (AvaliacaoFisicaExtraida, formato simples — ver lib/nutrition/avaliacaoFisica.ts)
// para o schema rico que o motor de interpretação espera (AvaliacaoFisicaNormalizada).
//
// Não existe aqui é a implementação da IA de leitura, só a tradução/adaptação
// de formato — sem nenhuma decisão clínica (isso continua sendo trabalho do
// motor, em regras.ts). Qualquer campo que o app não tem hoje entra como
// null: pela "regra de ouro" do motor (ver regras.ts), a regra que precisar
// desse campo simplesmente não dispara, em vez de dar erro ou inventar valor.
// ============================================================================

import type {
  AvaliacaoFisicaExtraida,
  Genero,
  NivelAtividade,
  ObjetivoNutricional,
  CondicaoSaude,
  SegmentoCorporalExtraido,
} from "@/types/domain";
import { classificarPercentualGordura } from "@/lib/nutrition/avaliacaoFisica";
import { processarAvaliacao } from "./motor";
import { montarConsultaAvaliacaoFisica } from "./montarConsulta";
import { BibliotecaClinicaReal } from "./bibliotecaSelector";
import { classificarImcDetalhado } from "./util";
import type { AvaliacaoFisicaNormalizada, Categoria, Objetivo, PerfilPaciente, SegmentarCorpo } from "./types";
// Nota: importa direto de ./motor, ./montarConsulta e ./util (não de
// ./index) pra evitar import circular, já que index.ts reexporta este arquivo.

function mapObjetivo(objetivo: ObjetivoNutricional): Objetivo {
  switch (objetivo) {
    case "emagrecimento":
      return "emagrecimento";
    case "ganho_massa":
      return "hipertrofia";
    case "saude_geral":
      return "saude";
    case "performance_esportiva":
      return "performance";
    case "manutencao":
    default:
      return "manutencao";
  }
}

function mapNivelAtividade(nivel: NivelAtividade): PerfilPaciente["nivelAtividadeFisica"] {
  switch (nivel) {
    case "sedentario":
      return "sedentario";
    case "leve":
      return "pouco_ativo";
    case "moderado":
      return "moderadamente_ativo";
    case "intenso":
      return "muito_ativo";
    case "atleta":
      return "atleta";
    default:
      return null;
  }
}

/** O motor só conhece "M"/"F" (nenhuma regra hoje usa esse campo, mas fica
 *  documentado o critério pra quando alguma regra passar a usar). */
function mapSexo(genero: Genero): "M" | "F" {
  return genero === "feminino" ? "F" : "M";
}

/** Traduz a classificação de 6 níveis já usada no resto do app (Abaixo do
 *  peso / Peso normal / Sobrepeso / Obesidade grau I/II/III) pros 3 níveis
 *  que o motor entende. */
function classificacaoImcParaCategoria(classificacaoImc: string): Categoria {
  if (classificacaoImc === "Abaixo do peso") return "abaixo";
  if (classificacaoImc === "Peso normal") return "normal";
  if (
    classificacaoImc === "Sobrepeso" ||
    classificacaoImc === "Obesidade grau I" ||
    classificacaoImc === "Obesidade grau II" ||
    classificacaoImc === "Obesidade grau III"
  ) {
    return "acima";
  }
  return null;
}

/** Reaproveita a MESMA classificação de % de gordura já usada e exibida em
 *  outras partes do app (classificarPercentualGordura, Essencial/Atlético/
 *  Fitness/Aceitável/Acima do recomendado) — nunca uma segunda fonte de
 *  verdade divergente — só reduz pros 3 níveis que o motor entende. */
function classificacaoGorduraParaCategoria(percentual: number, genero: Genero): Categoria {
  const rotulo = classificarPercentualGordura(percentual, genero);
  if (rotulo === "Essencial" || rotulo === "Atlético") return "abaixo";
  if (rotulo === "Fitness" || rotulo === "Aceitável") return "normal";
  return "acima"; // "Acima do recomendado"
}

/** Traduz o formato simples de segmento extraído da foto (kg +
 *  percentualPadrao) pro formato rico que o motor espera (SegmentarCorpo),
 *  que também tem um campo `categoria` por segmento — hoje não extraído da
 *  foto (nenhuma regra atual usa a categoria por segmento, só o
 *  percentualPadrao — ver R2/R9 em regras.ts), então fica sempre null. */
function paraSegmentarCorpo(seg: SegmentoCorporalExtraido | null): SegmentarCorpo | null {
  if (!seg) return null;
  const partes = ["bracoEsquerdo", "bracoDireito", "tronco", "pernaEsquerda", "pernaDireita"] as const;
  const resultado = {} as SegmentarCorpo;
  for (const parte of partes) {
    resultado[parte] = { kg: seg[parte].kg, percentualPadrao: seg[parte].percentualPadrao, categoria: null };
  }
  return resultado;
}

export interface DadosConhecidosConsulta {
  imc: number;
  classificacaoImc: string;
  genero: Genero;
  idade: number;
  alturaCm: number;
  pesoKg: number;
}

/**
 * Monta o objeto rico que o motor espera a partir do que já temos: os
 * campos extraídos da foto (dados) + os campos que o próprio app já
 * calcula/conhece com certeza (imc, classificacaoImc, idade, altura, peso,
 * gênero — não confiamos nesses vindos da IA, são os mesmos já usados no
 * resto da consulta). Categorias que dependem de faixa de referência do
 * aparelho (ex: massaMuscularCategoria) só vêm preenchidas quando o
 * documento trouxer essa informação explicitamente (ver extrairAvaliacaoFisica) —
 * senão ficam null e as regras que dependem delas simplesmente não disparam.
 */
export function paraAvaliacaoFisicaNormalizada(
  dados: AvaliacaoFisicaExtraida,
  conhecidos: DadosConhecidosConsulta
): AvaliacaoFisicaNormalizada {
  const aguaCorporalTotalL =
    dados.aguaCorporalPercentual != null && conhecidos.pesoKg != null
      ? Math.round(((conhecidos.pesoKg * dados.aguaCorporalPercentual) / 100) * 10) / 10
      : null;

  return {
    meta: {
      tipoAvaliacao: classificarTipoAvaliacao(dados.metodo),
      aparelhoModelo: dados.metodo,
      dataAvaliacao: dados.dataAvaliacao ?? new Date().toISOString().slice(0, 10),
      fonte: "foto",
    },
    pacienteSnapshot: {
      alturaCm: conhecidos.alturaCm,
      idade: conhecidos.idade,
      sexo: mapSexo(conhecidos.genero),
      pesoKg: conhecidos.pesoKg,
    },
    composicaoCorporal: {
      aguaCorporalTotalL: { valor: aguaCorporalTotalL },
      proteinaKg: { valor: null },
      mineraisKg: { valor: null },
      massaGorduraKg: { valor: dados.massaGordaKg },
      pesoKg: { valor: conhecidos.pesoKg },
    },
    musculoGordura: {
      pesoCategoria: dados.pesoCategoria ?? null,
      // "massa magra" é a aproximação mais próxima do que temos hoje pra
      // massa muscular esquelética — o documento pode não separar as duas.
      massaMuscularEsqueleticaKg: { valor: dados.massaMagraKg },
      massaMuscularCategoria: dados.massaMuscularCategoria ?? null,
      massaGorduraCategoria: null,
    },
    obesidade: {
      imc: { valor: conhecidos.imc },
      imcCategoria: classificacaoImcParaCategoria(conhecidos.classificacaoImc),
      imcCategoriaDetalhada: classificarImcDetalhado(conhecidos.imc),
      percentualGordura: { valor: dados.percentualGordura },
      percentualGorduraCategoria:
        dados.percentualGordura != null
          ? classificacaoGorduraParaCategoria(dados.percentualGordura, conhecidos.genero)
          : null,
    },
    segmentar: {
      massaMagra: paraSegmentarCorpo(dados.segmentar?.massaMagra ?? null),
      massaGordura: paraSegmentarCorpo(dados.segmentar?.massaGordura ?? null),
    },
    dadosAdicionais: {
      // O app ainda não extrai a pontuação geral do aparelho (ex: InBody
      // Score) nem os "controles" (quanto falta ganhar/perder de peso,
      // gordura ou músculo) — nenhum dos laudos usados até agora traz esse
      // dado de forma padronizada o bastante pra extrair com segurança.
      pontuacaoGeral: { valor: null, max: null },
      pesoIdealKg: dados.pesoIdealKg ?? null,
      controlePesoKg: null,
      controleGorduraKg: null,
      controleMuscularKg: null,
      taxaMetabolicaBasalKcal: dados.tmbMedidoKcal,
      // refMax da RCQ: usa a que vier do documento (nenhum campo extrai isso
      // hoje) — cai no padrão da regra R3 (ver regras.ts), que já aplica o
      // corte por gênero (0.90 masculino / 0.85 feminino, referência OMS)
      // quando refMax não é informado, mesmo padrão de fallback já usado
      // por R4 pra gordura visceral.
      relacaoCinturaQuadril: { valor: dados.relacaoCinturaQuadril ?? null },
      nivelGorduraVisceral: { valor: dados.nivelGorduraVisceral ?? null },
      grauObesidadePercentual: { valor: null },
    },
  };
}

function classificarTipoAvaliacao(metodo: string | null): AvaliacaoFisicaNormalizada["meta"]["tipoAvaliacao"] {
  if (!metodo) return "outro";
  const normalizado = metodo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (normalizado.includes("inbody")) return "inbody";
  if (normalizado.includes("dexa")) return "dexa";
  if (normalizado.includes("dobra") || normalizado.includes("adipometro") || normalizado.includes("pollock")) {
    return "adipometro";
  }
  if (normalizado.includes("bioimped")) return "bioimpedancia_simples";
  if (normalizado.includes("antropometria")) return "antropometria_manual";
  return "outro";
}

export function paraPerfilPaciente(params: {
  usuarioId: string;
  objetivo: ObjetivoNutricional;
  genero: Genero;
  idade: number;
  nivelAtividade: NivelAtividade;
  condicoesSaude: CondicaoSaude[];
}): PerfilPaciente {
  return {
    id: params.usuarioId,
    objetivo: mapObjetivo(params.objetivo),
    sexo: mapSexo(params.genero),
    idade: params.idade,
    nivelAtividadeFisica: mapNivelAtividade(params.nivelAtividade),
    condicoesClinicas: params.condicoesSaude,
  };
}

export interface InterpretacoesAvaliacaoFisica {
  /** Texto longo pro card de "Composição Corporal" (montarConsultaAvaliacaoFisica). */
  textoCard: string | null;
  /**
   * Texto curto de 1-2 frases (o "manchete") pra usar como abertura do
   * Resumo Geral no lugar da frase genérica de IMC — só vem preenchido
   * quando alguma regra com `usoNoResumo: true` disparou (R1, R6, R7, R10,
   * R12). Null nos demais casos: calculations.ts::montarResumoGeral cai de
   * volta pro texto padrão (com a rotação de variantes já existente) — ver
   * nota em montarRelatorioConsulta sobre por que o aviso de segurança
   * (gestante/lactante/histórico de transtorno alimentar/condição clínica
   * complexa/piso calórico) nunca depende deste campo.
   */
  mancheteResumo: string | null;
}

/**
 * Função de conveniência: junta a tradução de formato (acima) + as duas
 * chamadas ao motor (card + manchete do resumo) numa única chamada pronta
 * pra usar de dentro da rota que gera o resultado da consulta — roda as
 * regras uma vez só e reaproveita pros dois textos. Nunca lança erro —
 * qualquer falha (motor, biblioteca) resulta em { null, null }, e a
 * consulta segue sem esses textos extras, exatamente como já acontece com
 * a própria extração por IA (ver extrairAvaliacaoFisica).
 */
export async function gerarInterpretacoesAvaliacaoFisica(
  dados: AvaliacaoFisicaExtraida | null,
  conhecidos: DadosConhecidosConsulta,
  perfilParams: {
    usuarioId: string;
    objetivo: ObjetivoNutricional;
    nivelAtividade: NivelAtividade;
    condicoesSaude: CondicaoSaude[];
  },
  /** Número sequencial da consulta do paciente (1ª, 2ª, 3ª...) — repassado
   *  pra biblioteca pra rotacionar as variantes em vez de sortear ao acaso
   *  (ver bibliotecaSelector.ts::escolherRotativo). Se não vier informado,
   *  assume 1 (sempre a primeira variante de cada categoria). */
  numeroConsulta: number = 1,
  /** Dados + conhecidos (peso/altura/idade/gênero na época) da avaliação
   *  física anterior do paciente, quando houver — habilita a regra de
   *  evolução (R12) em regras.ts, que compara % de gordura e massa muscular
   *  atuais com os da consulta anterior. Null quando não há avaliação
   *  anterior com dados de avaliação física (ex: primeira consulta), ou
   *  quando a busca falhou — R12 simplesmente não dispara nesse caso, mesmo
   *  comportamento de antes. */
  anterior: { dados: AvaliacaoFisicaExtraida; conhecidos: DadosConhecidosConsulta } | null = null
): Promise<InterpretacoesAvaliacaoFisica> {
  if (!dados || dados.percentualGordura == null) return { textoCard: null, mancheteResumo: null };

  try {
    const normalizado = paraAvaliacaoFisicaNormalizada(dados, conhecidos);
    const normalizadoAnterior = anterior ? paraAvaliacaoFisicaNormalizada(anterior.dados, anterior.conhecidos) : null;
    const perfil = paraPerfilPaciente({
      usuarioId: perfilParams.usuarioId,
      objetivo: perfilParams.objetivo,
      genero: conhecidos.genero,
      idade: conhecidos.idade,
      nivelAtividade: perfilParams.nivelAtividade,
      condicoesSaude: perfilParams.condicoesSaude,
    });
    const biblioteca = new BibliotecaClinicaReal();
    const insights = processarAvaliacao(normalizado, perfil, normalizadoAnterior);

    const textoCard = await montarConsultaAvaliacaoFisica(insights, normalizado, perfil, biblioteca, numeroConsulta);

    const manchete = insights.find((i) => i.usoNoResumo);
    const mancheteResumo = manchete
      ? await biblioteca.selecionarInterpretacao({
          codigoCategoria: manchete.codigoBibliotecaSugerido,
          pacienteId: perfilParams.usuarioId,
          formato: "curto",
          numeroConsulta,
        })
      : null;

    return { textoCard, mancheteResumo };
  } catch (erro) {
    console.error("Falha ao gerar interpretação da avaliação física, seguindo sem esses textos:", erro);
    return { textoCard: null, mancheteResumo: null };
  }
}
