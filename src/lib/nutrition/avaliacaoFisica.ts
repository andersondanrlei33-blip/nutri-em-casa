import { getAnthropicClient, NUTRI_MODEL } from "@/lib/ai/anthropicClient";
import type { AvaliacaoFisicaExtraida, ComposicaoCorporalResultado, Genero } from "@/types/domain";

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
                "{\n" +
                '  "dataAvaliacao": "AAAA-MM-DD ou null",\n' +
                '  "metodo": "ex: bioimpedância, dobras cutâneas (protocolo de Pollock 7 dobras), DEXA — ou null",\n' +
                '  "percentualGordura": número ou null,\n' +
                '  "massaGordaKg": número ou null,\n' +
                '  "massaMagraKg": número ou null,\n' +
                '  "aguaCorporalPercentual": número ou null,\n' +
                '  "tmbMedidoKcal": número ou null,\n' +
                '  "idadeMetabolica": número ou null,\n' +
                '  "dobrasCutaneasMm": { "local em português": número, ... } ou null,\n' +
                '  "circunferenciasCm": { "local em português": número, ... } ou null,\n' +
                '  "classificacaoAvaliador": "classificação que o próprio documento usa (ex: Atlético) ou null",\n' +
                '  "observacoesAvaliador": "observações escritas no documento pelo profissional, ou null",\n' +
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

function classificarPercentualGordura(percentual: number, genero: Genero): string {
  const faixa = FAIXAS_GORDURA[genero].find((f) => percentual <= f.ate);
  return faixa?.rotulo ?? "Aceitável";
}

/** Posição ordinal de cada classificação (0 = mais "magro", 4 = mais
 *  "gordo") — usada só pra comparar com a posição ordinal do IMC e
 *  detectar divergência, nunca exibida diretamente. */
const ORDEM_GORDURA = ["Essencial", "Atlético", "Fitness", "Aceitável", "Acima do recomendado"];
const ORDEM_IMC = [
  "Abaixo do peso",
  "Peso normal",
  "Sobrepeso",
  "Obesidade grau I",
  "Obesidade grau II",
  "Obesidade grau III",
];

/**
 * Cruza o % de gordura real (quando o paciente anexou avaliação física)
 * com a classificação de IMC já calculada — nunca substitui o IMC (ele
 * continua sendo calculado e exibido normalmente em todo o resto do app,
 * incluindo Dashboard e Evolução), só adiciona contexto no relatório da
 * consulta quando os dois indicadores contam histórias muito diferentes,
 * que é exatamente onde o IMC sozinho mais erra:
 *
 *  - IMC alto (sobrepeso ou mais) mas gordura baixa (fitness/atlético) →
 *    provável alta massa muscular, não excesso de gordura — evita alarmar
 *    à toa uma pessoa musculosa.
 *  - IMC normal (ou abaixo) mas gordura alta (aceitável no topo da faixa
 *    ou acima) → "peso normal com composição desfavorável" (às vezes
 *    chamado de obesidade sarcopênica/"skinny fat") — o IMC sozinho não
 *    pegaria isso.
 *
 * Quando os dois concordam, ou não há avaliação física com % de gordura
 * legível, retorna só os números (ou null) — sem texto de divergência.
 */
export function avaliarComposicaoCorporal(
  dados: AvaliacaoFisicaExtraida | null,
  classificacaoImc: string,
  genero: Genero
): ComposicaoCorporalResultado | null {
  if (!dados || dados.percentualGordura == null) return null;

  const classificacaoGordura = classificarPercentualGordura(dados.percentualGordura, genero);
  const posicaoGordura = ORDEM_GORDURA.indexOf(classificacaoGordura);
  const posicaoImc = ORDEM_IMC.indexOf(classificacaoImc);

  let textoComparativo: string | null = null;
  if (posicaoImc >= 2 && posicaoGordura >= 0 && posicaoGordura <= 1) {
    textoComparativo =
      `Seu IMC está na faixa de ${classificacaoImc.toLowerCase()}, mas o percentual de gordura da sua ` +
      `avaliação física (${dados.percentualGordura}%, classificado como ${classificacaoGordura.toLowerCase()}) ` +
      "sugere um quadro mais favorável do que o IMC isolado indicaria — provavelmente por uma massa muscular " +
      "mais alta. O IMC sozinho não diferencia peso de músculo e peso de gordura, então nesse caso a composição " +
      "corporal real conta uma história mais precisa do que o número da balança.";
  } else if (posicaoImc >= 0 && posicaoImc <= 1 && posicaoGordura >= 3) {
    textoComparativo =
      `Seu IMC está na faixa de ${classificacaoImc.toLowerCase()}, mas o percentual de gordura da sua ` +
      `avaliação física (${dados.percentualGordura}%, classificado como ${classificacaoGordura.toLowerCase()}) ` +
      "pede atenção mesmo assim — é possível ter um peso considerado normal e, ainda assim, uma proporção de " +
      "gordura corporal acima do ideal (às vezes chamado de composição corporal desfavorável apesar do peso " +
      "normal). Vale considerar isso ao lado do IMC, não só o número da balança.";
  }

  return {
    percentualGordura: dados.percentualGordura,
    massaMagraKg: dados.massaMagraKg,
    massaGordaKg: dados.massaGordaKg,
    classificacaoPercentualGordura: classificacaoGordura,
    textoComparativo,
  };
}
