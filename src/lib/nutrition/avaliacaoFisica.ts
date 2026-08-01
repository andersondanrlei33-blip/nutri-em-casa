import { getAnthropicClient, NUTRI_MODEL_VISAO } from "@/lib/ai/anthropicClient";
import type {
  AvaliacaoFisicaExtraida,
  ComposicaoCorporalResultado,
  Genero,
  SegmentoCorporalExtraido,
} from "@/types/domain";

/** Tipos de imagem aceitos pelo upload — restrito a imagem (não PDF) porque
 *  a versão do SDK da Anthropic usada neste projeto (^0.27.3) não suporta
 *  blocos de conteúdo "document" (PDF), só "image". Pedimos uma foto do
 *  relatório em vez do arquivo original em PDF. */
export const TIPOS_IMAGEM_ACEITOS = ["image/jpeg", "image/png", "image/webp"] as const;
export type TipoImagemAceito = (typeof TIPOS_IMAGEM_ACEITOS)[number];

/** Schema de uma "parte" da análise segmentar (braço/tronco/perna) — usado
 *  duas vezes dentro do schema principal (massaMagra e massaGordura). */
const SCHEMA_PARTE_SEGMENTO = {
  type: "object",
  properties: {
    kg: { type: ["number", "null"] },
    percentualPadrao: {
      type: ["number", "null"],
      description:
        "% em relação ao padrão/ideal do aparelho pra esse segmento (coluna comum em laudos mais completos, ex: \"% padrão\" ou \"% ideal\").",
    },
  },
  required: ["kg", "percentualPadrao"],
};

const SCHEMA_SEGMENTAR = {
  type: ["object", "null"],
  description:
    "SÓ preencha se o documento trouxer uma tabela de análise por segmento corporal (braço esquerdo/direito, tronco, " +
    "perna esquerda/direita) — comum em laudos de bioimpedância mais completos. Preencha só os segmentos que " +
    "aparecerem (os demais como null nos campos internos). Se o documento não tiver essa tabela, use null.",
  properties: {
    bracoEsquerdo: SCHEMA_PARTE_SEGMENTO,
    bracoDireito: SCHEMA_PARTE_SEGMENTO,
    tronco: SCHEMA_PARTE_SEGMENTO,
    pernaEsquerda: SCHEMA_PARTE_SEGMENTO,
    pernaDireita: SCHEMA_PARTE_SEGMENTO,
  },
  required: ["bracoEsquerdo", "bracoDireito", "tronco", "pernaEsquerda", "pernaDireita"],
};

/**
 * Schema da "ferramenta" que a IA é obrigada a preencher (ver tool_choice em
 * extrairAvaliacaoFisica, abaixo). Isso substitui o formato antigo (pedir um
 * bloco de texto em JSON e fazer JSON.parse nele), que quebrava sempre que a
 * IA produzia um JSON tecnicamente inválido (vírgula/chave faltando, aspas
 * não escapadas dentro de um texto livre etc. — erro real visto em produção:
 * "SyntaxError: Expected ',' or '}'..."). Com tool use, a API Anthropic
 * obriga a resposta a seguir esse formato, então essa classe de erro deixa
 * de existir.
 */
const FERRAMENTA_EXTRACAO_AVALIACAO_FISICA = {
  name: "registrar_avaliacao_fisica",
  description: "Registra os dados encontrados no documento de avaliação física do paciente.",
  input_schema: {
    type: "object",
    properties: {
      dataAvaliacao: {
        type: ["string", "null"],
        description:
          "Data do exame em AAAA-MM-DD, ou null se não encontrar. Procure por rótulos como \"Data\", \"Data do " +
          "exame\", \"Data da avaliação\" ou \"Emitido em\"; o documento costuma trazer a data em DD/MM/AAAA — " +
          "converta pra AAAA-MM-DD.",
      },
      metodo: {
        type: ["string", "null"],
        description: "Ex: bioimpedância, dobras cutâneas (protocolo de Pollock 7 dobras), DEXA — ou null.",
      },
      percentualGordura: {
        type: ["number", "null"],
        description:
          "% de gordura corporal (PGC) — SEM o sinal de %. ATENÇÃO: IMC e % de gordura são DUAS medidas " +
          "diferentes que aparecem perto uma da outra no documento e costumam ter valores numéricos parecidos " +
          "(ex: IMC 27.3 e % de gordura 17.9 no mesmo laudo) — nunca copie o valor de uma pra outra. Confirme o " +
          "rótulo exato ao lado do número: \"% de gordura\", \"gordura corporal\", \"gordura corp.\" ou \"PGC\" " +
          "vai aqui; \"IMC\"/\"Índice de Massa Corporal\" NÃO vai aqui (não tem campo próprio pra IMC, o app já " +
          "calcula isso separadamente — inclua no resumoTexto se quiser registrar).",
      },
      massaGordaKg: { type: ["number", "null"] },
      massaMagraKg: { type: ["number", "null"] },
      aguaCorporalPercentual: { type: ["number", "null"] },
      tmbMedidoKcal: { type: ["number", "null"] },
      idadeMetabolica: { type: ["number", "null"] },
      dobrasCutaneasMm: {
        type: ["object", "null"],
        description: "Mapa \"local em português\" -> número em mm, ou null.",
        additionalProperties: { type: "number" },
      },
      circunferenciasCm: {
        type: ["object", "null"],
        description: "Mapa \"local em português\" -> número em cm, ou null.",
        additionalProperties: { type: "number" },
      },
      classificacaoAvaliador: {
        type: ["string", "null"],
        description: "Classificação que o próprio documento usa (ex: \"Atlético\"), ou null.",
      },
      observacoesAvaliador: {
        type: ["string", "null"],
        description: "Observações escritas no documento pelo profissional, ou null.",
      },
      nivelGorduraVisceral: {
        type: ["number", "null"],
        description: "Nível/índice de gordura visceral (comum em bioimpedância, escala tipicamente 1-20).",
      },
      relacaoCinturaQuadril: {
        type: ["number", "null"],
        description: "Relação cintura-quadril/RCQ/WHR (ex: 0.92) — só se o documento já trouxer esse número calculado.",
      },
      pesoIdealKg: {
        type: ["number", "null"],
        description: "Peso \"ideal\" calculado pelo próprio aparelho/documento — não é meta de peso do paciente.",
      },
      pesoCategoria: {
        type: ["string", "null"],
        enum: ["abaixo", "normal", "acima", null],
        description:
          "Preencha se o documento indicar, de QUALQUER forma explícita, se o peso está abaixo, dentro ou acima " +
          "da faixa de referência do aparelho: pode ser um gráfico/barra/faixa visual, OU uma etiqueta de texto " +
          "ao lado do valor (ex: \"Baixo\"/\"Padrão\"/\"Alto\", \"Abaixo\"/\"Normal\"/\"Acima\" — \"Excelente\" " +
          "conta como \"acima\"). Mapeie o rótulo do documento pra um destes 3 valores. Null se não houver " +
          "NENHUMA indicação explícita — nunca deduza isso só a partir do número cru.",
      },
      massaMuscularCategoria: {
        type: ["string", "null"],
        enum: ["abaixo", "normal", "acima", null],
        description: "Mesma lógica de pesoCategoria, mas para a massa muscular (esquelética).",
      },
      segmentar: SCHEMA_SEGMENTAR,
      resumoTexto: {
        type: "string",
        description:
          "Resumo em texto corrido (3-5 frases) de tudo que você encontrou no documento, incluindo qualquer " +
          "dado relevante que não coube nos campos acima (ex: o valor de IMC do documento, se houver).",
      },
    },
    required: [
      "dataAvaliacao",
      "metodo",
      "percentualGordura",
      "massaGordaKg",
      "massaMagraKg",
      "aguaCorporalPercentual",
      "tmbMedidoKcal",
      "idadeMetabolica",
      "dobrasCutaneasMm",
      "circunferenciasCm",
      "classificacaoAvaliador",
      "observacoesAvaliador",
      "nivelGorduraVisceral",
      "relacaoCinturaQuadril",
      "pesoIdealKg",
      "pesoCategoria",
      "massaMuscularCategoria",
      "segmentar",
      "resumoTexto",
    ],
  },
} as const;

const TEXTO_INSTRUCAO_EXTRACAO =
  "Esta é a foto de um documento de avaliação física de um paciente (bioimpedância, dobras cutâneas, " +
  "antropometria ou similar, feito por um educador físico, personal trainer ou nutricionista). Leia com atenção " +
  "e registre os dados encontrados usando a ferramenta disponível. Use null em qualquer campo que o documento " +
  "não trouxer — NUNCA invente ou estime um valor que não está escrito. Números devem vir sem unidade (ex: " +
  "18.5, não \"18.5%\").\n\n" +
  "Antes de responder, releia o que você vai registrar e confirme: o valor de percentualGordura é realmente o " +
  "que está escrito ao lado do rótulo de gordura corporal, e não o valor de IMC, peso ou de outro indicador " +
  "parecido? (Veja a descrição do campo percentualGordura pra mais detalhes sobre esse erro comum.)";

/**
 * Lê uma foto de um documento de avaliação física com a IA e extrai os
 * dados num formato estruturado. A IA só faz leitura/organização do que
 * está na imagem — nunca decide o que fazer com os números (isso é
 * avaliarComposicaoCorporal, abaixo, 100% determinístico). Em qualquer
 * falha (imagem ilegível, erro de rede), retorna null — a consulta segue
 * normalmente sem os dados extras, nunca trava por causa disso (mesmo
 * princípio de resiliência já usado em
 * mealPlanGenerator.ts::classificarCondicaoLivre).
 *
 * Usa "tool use" (ver FERRAMENTA_EXTRACAO_AVALIACAO_FISICA acima) em vez de
 * pedir um bloco de texto em JSON solto — a API Anthropic obriga a resposta
 * a seguir o schema definido, o que elimina os erros de "JSON malformado"
 * que apareciam esporadicamente com o formato antigo (texto livre +
 * JSON.parse manual).
 */
export async function extrairAvaliacaoFisica(
  base64: string,
  mediaType: TipoImagemAceito
): Promise<AvaliacaoFisicaExtraida | null> {
  const anthropic = getAnthropicClient();
  if (!anthropic) return null;

  try {
    const resposta = await anthropic.messages.create({
      model: NUTRI_MODEL_VISAO,
      // Schema exigido é grande (segmentar tem até 10 sub-campos, mais
      // dobrasCutaneasMm/circunferenciasCm, mais resumoTexto) — um limite
      // baixo aqui corta a resposta da IA no meio da estrutura, o que quebra
      // a montagem do JSON internamente no SDK (erro real visto em
      // produção com max_tokens: 2000: "SyntaxError: Expected ',' or '}'").
      // Margem generosa pra nunca mais cortar no meio.
      max_tokens: 4096,
      tools: [FERRAMENTA_EXTRACAO_AVALIACAO_FISICA],
      tool_choice: { type: "tool", name: "registrar_avaliacao_fisica" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: TEXTO_INSTRUCAO_EXTRACAO },
          ],
        },
      ],
    });

    // Se a resposta foi cortada por falta de espaço, o bloco de tool_use
    // pode vir com um JSON incompleto (e o SDK pode falhar ao montar
    // `input` a partir disso) — melhor detectar isso explicitamente aqui,
    // com uma mensagem clara no log, do que deixar estourar como um erro
    // genérico de JSON mais abaixo.
    if ((resposta as { stop_reason?: string }).stop_reason === "max_tokens") {
      console.error(
        "Falha ao extrair avaliação física: resposta da IA cortada por max_tokens — aumentar o limite."
      );
      return null;
    }

    const blocoFerramenta = resposta.content.find((bloco) => bloco.type === "tool_use") as
      | { type: "tool_use"; input: unknown }
      | undefined;
    if (!blocoFerramenta || !blocoFerramenta.input || typeof blocoFerramenta.input !== "object") return null;
    const bruto = blocoFerramenta.input as Record<string, unknown>;

    // Mesmo com tool use (que já obriga o formato), continua validando campo
    // a campo antes de confiar no valor — defesa em profundidade, mesmo
    // princípio usado em mealPlanGenerator.ts pra qualquer resposta de IA.
    const numeroOuNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const textoOuNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
    const mapaOuNull = (v: unknown): Record<string, number> | null => {
      if (!v || typeof v !== "object") return null;
      const entradas = Object.entries(v as Record<string, unknown>).filter(
        (par): par is [string, number] => typeof par[1] === "number" && Number.isFinite(par[1])
      );
      return entradas.length > 0 ? Object.fromEntries(entradas) : null;
    };
    const categoriaOuNull = (v: unknown): "abaixo" | "normal" | "acima" | null =>
      v === "abaixo" || v === "normal" || v === "acima" ? v : null;
    const segmentoOuNull = (v: unknown): SegmentoCorporalExtraido | null => {
      if (!v || typeof v !== "object") return null;
      const partes = ["bracoEsquerdo", "bracoDireito", "tronco", "pernaEsquerda", "pernaDireita"] as const;
      const objeto = v as Record<string, unknown>;
      const resultado = {} as SegmentoCorporalExtraido;
      let algumPreenchido = false;
      for (const parte of partes) {
        const bruto = objeto[parte];
        const kg = bruto && typeof bruto === "object" ? numeroOuNull((bruto as Record<string, unknown>).kg) : null;
        const percentualPadrao =
          bruto && typeof bruto === "object"
            ? numeroOuNull((bruto as Record<string, unknown>).percentualPadrao)
            : null;
        if (kg !== null || percentualPadrao !== null) algumPreenchido = true;
        resultado[parte] = { kg, percentualPadrao };
      }
      return algumPreenchido ? resultado : null;
    };
    const bruteSegmentar =
      bruto.segmentar && typeof bruto.segmentar === "object"
        ? (bruto.segmentar as Record<string, unknown>)
        : null;
    const massaMagraSegmentar = bruteSegmentar ? segmentoOuNull(bruteSegmentar.massaMagra) : null;
    const massaGorduraSegmentar = bruteSegmentar ? segmentoOuNull(bruteSegmentar.massaGordura) : null;

    return {
      dataAvaliacao: textoOuNull(bruto.dataAvaliacao),
      metodo: textoOuNull(bruto.metodo),
      percentualGordura: numeroOuNull(bruto.percentualGordura),
      massaGordaKg: numeroOuNull(bruto.massaGordaKg),
      massaMagraKg: numeroOuNull(bruto.massaMagraKg),
      aguaCorporalPercentual: numeroOuNull(bruto.aguaCorporalPercentual),
      tmbMedidoKcal: numeroOuNull(bruto.tmbMedidoKcal),
      idadeMetabolica: numeroOuNull(bruto.idadeMetabolica),
      dobrasCutaneasMm: mapaOuNull(bruto.dobrasCutaneasMm),
      circunferenciasCm: mapaOuNull(bruto.circunferenciasCm),
      classificacaoAvaliador: textoOuNull(bruto.classificacaoAvaliador),
      observacoesAvaliador: textoOuNull(bruto.observacoesAvaliador),
      pesoCategoria: categoriaOuNull(bruto.pesoCategoria),
      massaMuscularCategoria: categoriaOuNull(bruto.massaMuscularCategoria),
      nivelGorduraVisceral: numeroOuNull(bruto.nivelGorduraVisceral),
      relacaoCinturaQuadril: numeroOuNull(bruto.relacaoCinturaQuadril),
      pesoIdealKg: numeroOuNull(bruto.pesoIdealKg),
      segmentar:
        massaMagraSegmentar || massaGorduraSegmentar
          ? { massaMagra: massaMagraSegmentar, massaGordura: massaGorduraSegmentar }
          : null,
      resumoTexto: textoOuNull(bruto.resumoTexto) ?? "Não foi possível resumir o conteúdo do documento.",
    };
  } catch (erro) {
    console.error("Falha ao extrair avaliação física, seguindo sem esses dados:", erro);
    return null;
  }
}

/** Faixas de referência gerais de % de gordura corporal (categorias
 *  amplamente usadas, ex: American Council on Exercise) — não substituem
 *  uma avaliação profissional individualizada, só dão contexto pra
 *  comparar com a classificação de IMC. */
const FAIXAS_GORDURA: Record<Genero, { ate: number; rotulo: string }[]> = {
  masculino: [
    { ate: 5, rotulo: "Essencial" },
    { ate: 13, rotulo: "Atlético" },
    { ate: 17, rotulo: "Fitness" },
    { ate: 24, rotulo: "Aceitável" },
    { ate: Infinity, rotulo: "Acima do recomendado" },
  ],
  feminino: [
    { ate: 13, rotulo: "Essencial" },
    { ate: 20, rotulo: "Atlético" },
    { ate: 24, rotulo: "Fitness" },
    { ate: 31, rotulo: "Aceitável" },
    { ate: Infinity, rotulo: "Acima do recomendado" },
  ],
  // Sem corte padronizado — usa uma média dos dois, mesmo princípio já
  // usado em calculations.ts::calcularRCQ para gênero "outro".
  outro: [
    { ate: 9, rotulo: "Essencial" },
    { ate: 16, rotulo: "Atlético" },
    { ate: 20, rotulo: "Fitness" },
    { ate: 27, rotulo: "Aceitável" },
    { ate: Infinity, rotulo: "Acima do recomendado" },
  ],
};

/** Exportada porque lib/avaliacaoFisica/ponte.ts reaproveita esta MESMA
 *  classificação (nunca uma segunda fonte de verdade divergente) pra
 *  traduzir o % de gordura pros 3 níveis que o motor de interpretação
 *  entende (abaixo/normal/acima). */
export function classificarPercentualGordura(percentual: number, genero: Genero): string {
  const faixa = FAIXAS_GORDURA[genero].find((f) => percentual <= f.ate);
  return faixa?.rotulo ?? "Aceitável";
}

/**
 * Monta os números da composição corporal pra exibição (% de gordura,
 * massa magra, massa gorda) e o texto comparativo com o IMC.
 *
 * O texto comparativo (`textoComparativo`) vem do motor de interpretação
 * novo em lib/avaliacaoFisica/ (ver ponte.ts::gerarTextoInterpretacaoAvaliacaoFisica),
 * que substitui a heurística antiga que só comparava duas faixas fixas —
 * essa heurística antiga tinha um bug real: a categoria "Fitness" (ex: 14,1%
 * num homem) ficava de fora do teste de "gordura baixa" (só reconhecia
 * Essencial/Atlético), então o app deixava de explicar que um IMC alto era
 * por massa muscular exatamente nos casos mais comuns. `textoMotor` já vem
 * pronto (calculado antes, de forma assíncrona, em route.ts) — esta função
 * só recebe o texto já pronto porque o resto de calculations.ts é
 * deliberadamente síncrono/puro, sem chamadas a serviço externo.
 *
 * Quando não há avaliação física com % de gordura legível, retorna null —
 * sem card de composição corporal.
 */
export function avaliarComposicaoCorporal(
  dados: AvaliacaoFisicaExtraida | null,
  classificacaoImc: string,
  genero: Genero,
  textoMotor: string | null = null
): ComposicaoCorporalResultado | null {
  if (!dados || dados.percentualGordura == null) return null;

  const classificacaoGordura = classificarPercentualGordura(dados.percentualGordura, genero);

  return {
    percentualGordura: dados.percentualGordura,
    massaMagraKg: dados.massaMagraKg,
    massaGordaKg: dados.massaGordaKg,
    classificacaoPercentualGordura: classificacaoGordura,
    textoComparativo: textoMotor,
  };
}
