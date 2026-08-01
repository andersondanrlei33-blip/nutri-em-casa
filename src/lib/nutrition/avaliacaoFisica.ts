import { getAnthropicClient, NUTRI_MODEL } from "@/lib/ai/anthropicClient";
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

/**
 * Lê uma foto de um documento de avaliação física com a IA e extrai os
 * dados num formato estruturado. A IA só faz leitura/organização do que
 * está na imagem — nunca decide o que fazer com os números (isso é
 * avaliarComposicaoCorporal, abaixo, 100% determinístico). Em qualquer
 * falha (imagem ilegível, resposta fora do formato, erro de rede), retorna
 * null — a consulta segue normalmente sem os dados extras, nunca trava por
 * causa disso (mesmo princípio de resiliência já usado em
 * mealPlanGenerator.ts::classificarCondicaoLivre).
 */
export async function extrairAvaliacaoFisica(
  base64: string,
  mediaType: TipoImagemAceito
): Promise<AvaliacaoFisicaExtraida | null> {
  const anthropic = getAnthropicClient();
  if (!anthropic) return null;

  try {
    const resposta = await anthropic.messages.create({
      model: NUTRI_MODEL,
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            {
              type: "text",
              text:
                "Esta é a foto de um documento de avaliação física de um paciente (bioimpedância, dobras " +
                "cutâneas, antropometria ou similar, feito por um educador físico, personal trainer ou " +
                "nutricionista). Leia com atenção e extraia os dados encontrados no seguinte formato JSON. Use " +
                "null em qualquer campo que o documento não trouxer — NUNCA invente ou estime um valor que não " +
                "está escrito. Números devem vir sem unidade (ex: 18.5, não \"18.5%\"). Datas em formato ISO " +
                "(AAAA-MM-DD).\n\n" +
                "ATENÇÃO — dois erros comuns que você deve evitar:\n" +
                "1. IMC e % de gordura corporal são DUAS medidas diferentes que aparecem perto uma da outra " +
                "no documento e têm valores numéricos parecidos (ex: IMC 27.3 e % de gordura 17.9 no mesmo " +
                "laudo). NUNCA copie o valor de uma pra outra. Confirme o rótulo exato ao lado de cada número " +
                "antes de preencher: \"IMC\" ou \"Índice de Massa Corporal\" vai no resumoTexto (não existe " +
                "campo próprio pra IMC aqui, o app já calcula isso separadamente); \"% de gordura\", \"gordura " +
                "corporal\", \"gordura corp.\" ou \"PGC\" vai em percentualGordura.\n" +
                "2. Antes de responder, releia o JSON que você montou e confira: o valor de percentualGordura é " +
                "realmente o que está escrito ao lado do rótulo de gordura corporal, e não o valor de IMC, " +
                "peso ou de outro indicador?\n\n" +
                "{\n" +
                '  "dataAvaliacao": "AAAA-MM-DD ou null — procure por rótulos como \\"Data\\", \\"Data do ' +
                'exame\\", \\"Data da avaliação\\" ou \\"Emitido em\\"; datas no documento costumam vir em ' +
                'DD/MM/AAAA, converta pra AAAA-MM-DD",\n' +
                '  "metodo": "ex: bioimpedância, dobras cutâneas (protocolo de Pollock 7 dobras), DEXA — ou null",\n' +
                '  "percentualGordura": número ou null — ver aviso acima, não confunda com IMC,\n' +
                '  "massaGordaKg": número ou null,\n' +
                '  "massaMagraKg": número ou null,\n' +
                '  "aguaCorporalPercentual": número ou null,\n' +
                '  "tmbMedidoKcal": número ou null,\n' +
                '  "idadeMetabolica": número ou null,\n' +
                '  "dobrasCutaneasMm": { "local em português": número, ... } ou null,\n' +
                '  "circunferenciasCm": { "local em português": número, ... } ou null,\n' +
                '  "classificacaoAvaliador": "classificação que o próprio documento usa (ex: Atlético) ou null",\n' +
                '  "observacoesAvaliador": "observações escritas no documento pelo profissional, ou null",\n' +
                '  "nivelGorduraVisceral": número ou null — nível/índice de gordura visceral (comum em ' +
                'bioimpedância, escala tipicamente 1-20),\n' +
                '  "relacaoCinturaQuadril": número ou null — relação cintura-quadril/RCQ/WHR (ex: 0.92), só se ' +
                'o documento já trouxer esse número calculado,\n' +
                '  "pesoIdealKg": número ou null — peso "ideal" calculado pelo próprio aparelho/documento ' +
                '(não é meta de peso do paciente),\n' +
                '  "pesoCategoria": "abaixo" | "normal" | "acima" | null — preencha se o documento indicar, de ' +
                'QUALQUER forma explícita, se o peso está abaixo, dentro ou acima da faixa de referência do ' +
                'aparelho: pode ser um gráfico/barra/faixa visual, OU uma etiqueta de texto ao lado do valor ' +
                '(ex: "Baixo"/"Padrão"/"Alto", "Abaixo"/"Normal"/"Acima", "Excelente" conta como "acima"). ' +
                "Mapeie o rótulo do documento pra um destes 3 valores. Só use null se não houver NENHUMA " +
                "indicação explícita (nem gráfico, nem etiqueta) — nunca deduza isso só a partir do número cru.\n" +
                '  "massaMuscularCategoria": "abaixo" | "normal" | "acima" | null — mesma lógica do campo ' +
                "acima (gráfico/barra/faixa OU etiqueta de texto), mas para a massa muscular (esquelética).\n" +
                '  "segmentar": {\n' +
                '    "massaMagra": { "bracoEsquerdo": {"kg": número|null, "percentualPadrao": número|null}, ' +
                '"bracoDireito": {...}, "tronco": {...}, "pernaEsquerda": {...}, "pernaDireita": {...} } | null,\n' +
                '    "massaGordura": { mesma estrutura de massaMagra } | null\n' +
                '  } — SÓ preencha se o documento trouxer uma tabela de análise por segmento corporal (braço ' +
                'esquerdo/direito, tronco, perna esquerda/direita), comum em laudos de bioimpedância mais ' +
                'completos. "percentualPadrao" é a coluna de % em relação ao padrão/ideal do aparelho pra ' +
                "aquele segmento, se existir (ex: \"% padrão\", \"% ideal\"). Preencha só os segmentos que " +
                "aparecerem, com null nos que faltarem. Se o documento não tiver essa tabela, use null pro " +
                "objeto inteiro (massaMagra e/ou massaGordura), não invente valores.\n" +
                '  "resumoTexto": "resumo em texto corrido (3-5 frases) de tudo que você encontrou no documento, ' +
                'incluindo qualquer dado relevante que não coube nos campos acima"\n' +
                "}\n\n" +
                "Responda APENAS com o JSON, sem nenhuma explicação antes ou depois.",
            },
          ],
        },
      ],
    });

    const texto = resposta.content
      .filter((bloco) => bloco.type === "text")
      .map((bloco) => (bloco as { text: string }).text)
      .join("\n");
    const jsonMatch = texto.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const bruto = JSON.parse(jsonMatch[0]);

    // Nunca confia cegamente no shape devolvido pela IA — normaliza campo a
    // campo, com null como padrão seguro pra qualquer coisa fora do
    // esperado (mesmo princípio usado em mealPlanGenerator.ts).
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
    const bruteSegmentar = bruto.segmentar && typeof bruto.segmentar === "object" ? bruto.segmentar : null;
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
