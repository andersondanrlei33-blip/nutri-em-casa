// ============================================================================
// types.ts
// Schema canônico de avaliação física + tipos de apoio do motor de
// interpretação. Baseado em spec_motor_avaliacao_fisica.md (Seções 3 e 4).
//
// Qualquer aparelho (InBody, DEXA, adipômetro, balança de bioimpedância
// simples...) deve ser convertido para este formato antes de chegar
// nas regras. Campo que o aparelho não mede = null, nunca omitido.
// ============================================================================

export type Categoria = "abaixo" | "normal" | "acima" | null;

/**
 * As 6 categorias do Módulo 1 (IMC) da Biblioteca Clínica — mais granulares
 * que o `Categoria` de 3 níveis usado nas regras (Seção 5.4 da spec).
 * Usadas pelo fallback do Resumo Geral quando não há avaliação física, ou
 * quando há avaliação física mas nenhuma regra "manchete" disparou.
 */
export type CategoriaImcDetalhada =
  | "BAIXO"
  | "NORMAL"
  | "SOBREPESO"
  | "OBI"
  | "OBII"
  | "OBIII";

export interface FaixaComReferencia {
  valor: number | null;
  refMin?: number | null;
  refMax?: number | null;
}

export interface SegmentoCorporal {
  kg: number | null;
  percentualPadrao: number | null;
  categoria: Categoria;
}

export interface SegmentarCorpo {
  bracoEsquerdo: SegmentoCorporal;
  bracoDireito: SegmentoCorporal;
  tronco: SegmentoCorporal;
  pernaEsquerda: SegmentoCorporal;
  pernaDireita: SegmentoCorporal;
}

export interface AvaliacaoFisicaNormalizada {
  meta: {
    tipoAvaliacao:
      | "inbody"
      | "bioimpedancia_simples"
      | "dexa"
      | "adipometro"
      | "antropometria_manual"
      | "outro";
    aparelhoModelo: string | null;
    dataAvaliacao: string; // ISO-8601, ex: "2025-12-17"
    fonte: "pdf" | "foto";
  };

  pacienteSnapshot: {
    alturaCm: number | null;
    idade: number | null;
    sexo: "M" | "F" | null;
    pesoKg: number | null;
  };

  composicaoCorporal: {
    aguaCorporalTotalL: FaixaComReferencia;
    proteinaKg: FaixaComReferencia;
    mineraisKg: FaixaComReferencia;
    massaGorduraKg: FaixaComReferencia;
    pesoKg: FaixaComReferencia;
  };

  musculoGordura: {
    pesoCategoria: Categoria;
    massaMuscularEsqueleticaKg: FaixaComReferencia;
    massaMuscularCategoria: Categoria;
    massaGorduraCategoria: Categoria;
  };

  obesidade: {
    imc: { valor: number | null };
    imcCategoria: Categoria;
    /**
     * Classificação de 6 níveis (Seção 5.4 da spec), derivada de `imc.valor`
     * via `classificarImcDetalhado` (ver util.ts). Independente de
     * `imcCategoria` (3 níveis) — as regras R1/R6/R7/R10 continuam usando
     * `imcCategoria`; só o fallback do Resumo Geral usa este campo.
     */
    imcCategoriaDetalhada: CategoriaImcDetalhada | null;
    percentualGordura: { valor: number | null }; // PGC
    percentualGorduraCategoria: Categoria;
  };

  segmentar: {
    // null inteiro quando o aparelho não faz análise segmentar
    massaMagra: SegmentarCorpo | null;
    massaGordura: SegmentarCorpo | null;
  };

  dadosAdicionais: {
    pontuacaoGeral: { valor: number | null; max: number | null };
    pesoIdealKg: number | null;
    controlePesoKg: number | null;
    controleGorduraKg: number | null;
    controleMuscularKg: number | null;
    taxaMetabolicaBasalKcal: number | null;
    relacaoCinturaQuadril: FaixaComReferencia;
    nivelGorduraVisceral: FaixaComReferencia;
    grauObesidadePercentual: FaixaComReferencia;
  };
}

export type Objetivo =
  | "emagrecimento"
  | "hipertrofia"
  | "manutencao"
  | "reeducacao_alimentar"
  | "saude"
  | "performance";

export interface PerfilPaciente {
  id: string;
  objetivo: Objetivo | null;
  sexo: "M" | "F";
  idade: number;
  nivelAtividadeFisica:
    | "sedentario"
    | "pouco_ativo"
    | "moderadamente_ativo"
    | "muito_ativo"
    | "atleta"
    | null;
  condicoesClinicas: string[];
}

/**
 * Um "achado" detectado por uma regra clínica. `codigoBibliotecaSugerido`
 * aponta para a categoria da Biblioteca Clínica que deve ser usada para
 * gerar o texto (ex: "AVALFISICA-IMC-MASCARADO-MUSCULO"), ou o literal
 * "ELOGIO" quando o insight deve puxar do Módulo 16 em vez de uma
 * categoria de cenário.
 */
export interface Insight {
  codigoRegra: string;
  prioridade: number; // 1 = mais importante, aparece primeiro na consulta
  codigoBibliotecaSugerido: string;
  /** Insights com a mesma tag são fundidos em um único bloco de texto (ver motor.ts) */
  tagTematica?: string;
  /**
   * true = essa regra pode reescrever a frase de abertura do Resumo Geral
   * do relatório (R1, R6, R7, R10, R12 — Seção 5.4 da spec). false = insight
   * de detalhe, só aparece no card de Composição Corporal.
   */
  usoNoResumo: boolean;
  variaveis: Record<string, string | number | null | undefined>;
}
