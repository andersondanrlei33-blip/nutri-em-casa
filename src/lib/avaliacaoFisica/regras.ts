// ============================================================================
// regras.ts
// As 12 regras clínicas descritas na Seção 5 da spec. Cada regra é uma
// função pura: (dados, perfil, anterior) => Insight | null.
//
// Regra de ouro (Seção 5.1 da spec): se faltar um campo necessário, a
// regra retorna null silenciosamente — nunca lança erro, nunca gera
// insight de "dado ausente" pro paciente ver.
// ============================================================================

import { AvaliacaoFisicaNormalizada, PerfilPaciente, Insight } from "./types";

type Regra = (
  dados: AvaliacaoFisicaNormalizada,
  perfil: PerfilPaciente,
  anterior: AvaliacaoFisicaNormalizada | null
) => Insight | null;

/** R1 — IMC elevado mascarado por massa muscular alta (não é gordura) */
export const r1ImcMascaradoPorMusculo: Regra = (dados) => {
  const imcCat = dados.obesidade.imcCategoria;
  const pgcCat = dados.obesidade.percentualGorduraCategoria;
  const muscCat = dados.musculoGordura.massaMuscularCategoria;

  if (imcCat === null || pgcCat === null || muscCat === null) return null;

  if (imcCat === "acima" && (pgcCat === "abaixo" || pgcCat === "normal") && muscCat === "acima") {
    return {
      codigoRegra: "R1",
      prioridade: 1,
      codigoBibliotecaSugerido: "AVALFISICA-IMC-MASCARADO-MUSCULO",
      usoNoResumo: true, // manchete — reescreve a frase de abertura do Resumo Geral (Seção 5.4)
      variaveis: {
        imc: dados.obesidade.imc.valor,
        pgc: dados.obesidade.percentualGordura.valor,
      },
    };
  }
  return null;
};

/** R2 — Gordura concentrada no tronco apesar de PGC geral normal */
export const r2GorduraConcentradaTronco: Regra = (dados) => {
  const pgcCat = dados.obesidade.percentualGorduraCategoria;
  const seg = dados.segmentar.massaGordura;
  if (pgcCat !== "normal" || !seg) return null;

  const troncoPct = seg.tronco.percentualPadrao;
  if (troncoPct === null || troncoPct < 140) return null;

  const algumMembroAbaixoDeCem =
    (seg.bracoEsquerdo.percentualPadrao ?? 999) < 100 ||
    (seg.bracoDireito.percentualPadrao ?? 999) < 100 ||
    (seg.pernaEsquerda.percentualPadrao ?? 999) < 100 ||
    (seg.pernaDireita.percentualPadrao ?? 999) < 100;

  if (!algumMembroAbaixoDeCem) return null;

  return {
    codigoRegra: "R2",
    prioridade: 2,
    codigoBibliotecaSugerido: "AVALFISICA-GORDURA-CONCENTRADA-TRONCO",
    tagTematica: "gordura_abdominal",
    usoNoResumo: false, // detalhe — só aparece no card de Composição Corporal
    variaveis: { gorduraTroncoPct: troncoPct },
  };
};

/** R3 — Relação cintura-quadril acima da faixa de referência (mesma tag de R2 → serão fundidas) */
export const r3RelacaoCinturaQuadrilElevada: Regra = (dados) => {
  const rcq = dados.dadosAdicionais.relacaoCinturaQuadril;
  if (rcq.valor === null || rcq.refMax === undefined || rcq.refMax === null) return null;
  if (rcq.valor <= rcq.refMax) return null;

  return {
    codigoRegra: "R3",
    prioridade: 2,
    codigoBibliotecaSugerido: "AVALFISICA-GORDURA-CONCENTRADA-TRONCO",
    tagTematica: "gordura_abdominal",
    usoNoResumo: false,
    variaveis: { rcq: rcq.valor, rcqRefMax: rcq.refMax },
  };
};

/** R4 — Gordura visceral no terço superior da faixa normal (ou acima dela) */
export const r4GorduraVisceralAtencao: Regra = (dados) => {
  const nivel = dados.dadosAdicionais.nivelGorduraVisceral;
  if (nivel.valor === null) return null;

  const refMax = nivel.refMax ?? 9; // faixa padrão de referência usada pelo InBody: 1-9
  const limiarAtencao = refMax - 2; // terço superior aproximado da faixa "normal"

  if (nivel.valor < limiarAtencao) return null;

  return {
    codigoRegra: "R4",
    prioridade: 2,
    codigoBibliotecaSugerido: "AVALFISICA-GORDURA-VISCERAL-ATENCAO",
    usoNoResumo: false,
    variaveis: { nivelGorduraVisceral: nivel.valor, refMax },
  };
};

/** R5 — Massa muscular abaixo do ideal para quem busca hipertrofia */
export const r5MassaMuscularAbaixoHipertrofia: Regra = (dados, perfil) => {
  if (perfil.objetivo !== "hipertrofia") return null;
  const muscCat = dados.musculoGordura.massaMuscularCategoria;
  if (muscCat === null || (muscCat !== "abaixo" && muscCat !== "normal")) return null;

  return {
    codigoRegra: "R5",
    prioridade: 1,
    codigoBibliotecaSugerido: "AVALFISICA-MASSA-MUSCULAR-ABAIXO-HIPERTROFIA",
    usoNoResumo: false,
    variaveis: { massaMuscularKg: dados.musculoGordura.massaMuscularEsqueleticaKg.valor },
  };
};

/** R6 — Percentual de gordura acima do ideal para quem busca emagrecimento */
export const r6PercentualGorduraAcimaEmagrecimento: Regra = (dados, perfil) => {
  if (perfil.objetivo !== "emagrecimento") return null;
  if (dados.obesidade.percentualGorduraCategoria !== "acima") return null;

  return {
    codigoRegra: "R6",
    prioridade: 1,
    codigoBibliotecaSugerido: "AVALFISICA-PERCENTUAL-GORDURA-ACIMA-EMAGRECIMENTO",
    usoNoResumo: true,
    variaveis: { pgc: dados.obesidade.percentualGordura.valor },
  };
};

/** R7 — Cenário favorável para recomposição corporal (não é caso de bulk/cut clássico) */
export const r7RecomposicaoFavoravel: Regra = (dados, perfil) => {
  if (perfil.objetivo !== "hipertrofia" && perfil.objetivo !== "emagrecimento") return null;
  if (dados.obesidade.percentualGorduraCategoria !== "normal") return null;
  if (dados.musculoGordura.massaMuscularCategoria !== "acima") return null;

  return {
    codigoRegra: "R7",
    prioridade: 1,
    codigoBibliotecaSugerido: "AVALFISICA-RECOMPOSICAO-FAVORAVEL",
    usoNoResumo: true,
    variaveis: {},
  };
};

/** R8 — Pontuação geral alta do aparelho, quando esse dado existir (ex: InBody Score) */
export const r8PontuacaoGeralAlta: Regra = (dados) => {
  const p = dados.dadosAdicionais.pontuacaoGeral;
  if (p.valor === null || p.max === null || p.max === 0) return null;
  if (p.valor / p.max < 0.85) return null;

  return {
    codigoRegra: "R8",
    prioridade: 3,
    codigoBibliotecaSugerido: "ELOGIO", // sinaliza pro montador puxar do Módulo 16, não uma categoria de cenário
    usoNoResumo: false,
    variaveis: { pontuacao: p.valor, max: p.max },
  };
};

/** R9 — Assimetria muscular relevante entre lado esquerdo e direito */
export const r9AssimetriaMuscular: Regra = (dados) => {
  const seg = dados.segmentar.massaMagra;
  if (!seg) return null;

  const diffBraco =
    seg.bracoEsquerdo.percentualPadrao !== null && seg.bracoDireito.percentualPadrao !== null
      ? Math.abs(seg.bracoEsquerdo.percentualPadrao - seg.bracoDireito.percentualPadrao)
      : null;
  const diffPerna =
    seg.pernaEsquerda.percentualPadrao !== null && seg.pernaDireita.percentualPadrao !== null
      ? Math.abs(seg.pernaEsquerda.percentualPadrao - seg.pernaDireita.percentualPadrao)
      : null;

  const limiar = 15;
  if ((diffBraco ?? 0) < limiar && (diffPerna ?? 0) < limiar) return null;

  return {
    codigoRegra: "R9",
    prioridade: 3,
    codigoBibliotecaSugerido: "AVALFISICA-ASSIMETRIA-MUSCULAR",
    usoNoResumo: false,
    variaveis: { diffBraco: diffBraco ?? undefined, diffPerna: diffPerna ?? undefined },
  };
};

/** R10 — Peso "ideal" calculado pelo aparelho já é ~igual ao atual, mas objetivo é emagrecer */
export const r10PesoIdealNaoEAMeta: Regra = (dados, perfil) => {
  if (perfil.objetivo !== "emagrecimento") return null;
  const pesoAtual = dados.composicaoCorporal.pesoKg.valor;
  const pesoIdeal = dados.dadosAdicionais.pesoIdealKg;
  if (pesoAtual === null || pesoIdeal === null) return null;
  if (Math.abs(pesoAtual - pesoIdeal) >= 1) return null;
  if (dados.obesidade.percentualGorduraCategoria === "acima") return null;

  return {
    codigoRegra: "R10",
    prioridade: 2,
    codigoBibliotecaSugerido: "AVALFISICA-PESO-IDEAL-NAO-E-A-META",
    usoNoResumo: true,
    variaveis: { pesoAtual, pesoIdeal },
  };
};

/** R12 — Evolução em relação à avaliação anterior (requer histórico do paciente) */
export const r12EvolucaoEmRelacaoAAnterior: Regra = (dados, _perfil, anterior) => {
  if (!anterior) return null;

  const pgcAtual = dados.obesidade.percentualGordura.valor;
  const pgcAnterior = anterior.obesidade.percentualGordura.valor;
  const muscAtual = dados.musculoGordura.massaMuscularEsqueleticaKg.valor;
  const muscAnterior = anterior.musculoGordura.massaMuscularEsqueleticaKg.valor;

  if (pgcAtual === null || pgcAnterior === null || muscAtual === null || muscAnterior === null) {
    return null;
  }

  const deltaPgc = pgcAtual - pgcAnterior;
  const deltaMusculo = muscAtual - muscAnterior;

  let tendencia: string;
  if (deltaPgc <= -0.5 && deltaMusculo >= 0.3) tendencia = "recomposicao_positiva";
  else if (deltaPgc <= -0.5) tendencia = "perda_gordura";
  else if (deltaMusculo >= 0.3) tendencia = "ganho_muscular";
  else if (Math.abs(deltaPgc) < 0.5 && Math.abs(deltaMusculo) < 0.3) tendencia = "estavel";
  else tendencia = "atencao";

  return {
    codigoRegra: "R12",
    prioridade: 1,
    // dash, não underscore, pra bater com a convenção de código dos outros módulos
    codigoBibliotecaSugerido: `AVALFISICA-EVOLUCAO-${tendencia.toUpperCase().replace(/_/g, "-")}`,
    usoNoResumo: true,
    variaveis: { deltaPgc, deltaMusculo, tendencia },
  };
};

/**
 * Lista central de regras usada pelo motor. Adicionar uma regra nova ao
 * sistema é: escrever a função seguindo o mesmo formato acima e incluí-la
 * aqui — nada mais precisa mudar em motor.ts.
 */
export const TODAS_AS_REGRAS: Regra[] = [
  r12EvolucaoEmRelacaoAAnterior,
  r1ImcMascaradoPorMusculo,
  r5MassaMuscularAbaixoHipertrofia,
  r6PercentualGorduraAcimaEmagrecimento,
  r7RecomposicaoFavoravel,
  r2GorduraConcentradaTronco,
  r3RelacaoCinturaQuadrilElevada,
  r4GorduraVisceralAtencao,
  r10PesoIdealNaoEAMeta,
  r8PontuacaoGeralAlta,
  r9AssimetriaMuscular,
];
