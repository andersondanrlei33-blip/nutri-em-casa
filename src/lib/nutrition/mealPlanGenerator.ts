import { z } from "zod";
import type { AvaliacaoNutricional, CategoriaReceita, CondicaoSaude, DiaSemana, IndicacaoSaudeReceita, Receita } from "@/types/domain";
import { getAnthropicClient, NUTRI_MODEL } from "@/lib/ai/anthropicClient";
import { identificarCondicaoClinicaComplexa } from "./calculations";
import {
  construirFiltro,
  filtrarReceitasCompativeis,
  escolherReceita,
  receitaEhSegura,
  textoContemAlergiaDoUsuario,
  normalizar,
  INDICACOES_SAUDE_VOCABULARIO,
  type FiltroReceitas,
  type MetasRefeicao,
} from "./receitaMatching";
const DIAS: DiaSemana[] = [
  "segunda",
  "terca",
  "quarta",
  "quinta",
  "sexta",
  "sabado",
  "domingo",
];
const RefeicaoGeradaSchema = z.object({
  dia_semana: z.enum(["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"]),
  nome_refeicao: z.string(),
  horario: z.string(),
  categoria: z.enum([
    "cafe_da_manha",
    "almoco",
    "jantar",
    "lanche",
    "sobremesa",
    "pre_treino",
    "pos_treino",
  ]),
  descricao: z.string(),
  calorias: z.number(),
  proteina_g: z.number(),
  carboidrato_g: z.number(),
  gordura_g: z.number(),
  /** Vínculo com uma receita real da biblioteca — null quando não há opção
   *  compatível na biblioteca e a refeição é só uma descrição de texto. */
  receita_id: z.string().nullable().optional(),
  quantidade_porcoes: z.number().positive().optional(),
});
const PlanoGeradoSchema = z.object({
  refeicoes: z.array(RefeicaoGeradaSchema),
  observacoes_nutricionista: z.string(),
});
export type RefeicaoGerada = z.infer<typeof RefeicaoGeradaSchema>;
export type PlanoGerado = z.infer<typeof PlanoGeradoSchema>;
/**
 * Gera um plano alimentar semanal personalizado a partir da avaliação
 * nutricional. Usa a API da Anthropic quando ANTHROPIC_API_KEY estiver
 * configurada (recomendado em produção); caso contrário recorre a um
 * gerador determinístico baseado em templates, garantindo que o app
 * NUNCA fique sem funcionar por falta de uma chave de IA.
 *
 * Em ambos os caminhos, as refeições são vinculadas a receitas reais da
 * biblioteca (quando há uma compatível) — restrições e alergias filtram
 * a lista de receitas candidatas ANTES de qualquer geração, em vez de
 * depender só de uma instrução em prompt para IA seguir.
 */
export async function gerarPlanoAlimentar(
  avaliacao: AvaliacaoNutricional,
  receitasDisponiveis: Receita[]
): Promise<PlanoGerado> {
  const anthropic = getAnthropicClient();
  if (anthropic) {
    try {
      return await gerarPlanoComIA(avaliacao, receitasDisponiveis);
    } catch (erro) {
      console.error("Falha ao gerar plano com IA, usando fallback determinístico:", erro);
    }
  }
  return gerarPlanoTemplate(avaliacao, receitasDisponiveis);
}
/**
 * Orientações de seleção de alimentos por condição de saúde — usadas no
 * prompt da IA. Antes dessa função, condições de saúde só geravam um aviso
 * de texto separado (avaliarCondicoesSaude em calculations.ts) que nunca
 * chegava na geração do cardápio: a IA escolhia comida olhando só pra
 * preferências do paciente, sem saber que ele tinha diabetes/colesterol
 * alto/hipertensão. Essas instruções têm prioridade sobre preferência
 * alimentar quando as duas conflitarem (ex: paciente diabético que prefere
 * doce — a IA deve moderar o doce, não ignorar a condição).
 */
function construirOrientacoesCondicoesSaude(condicoes: CondicaoSaude[]): string[] {
  const orientacoes: string[] = [];
  if (condicoes.includes("diabetes_tipo1") || condicoes.includes("diabetes_tipo2")) {
    orientacoes.push(
      "Diabetes: priorize carboidratos complexos e com fibra; evite ou reduza fortemente açúcar refinado/doces " +
        "concentrados (ex: doce de leite, brigadeiro, mel em excesso, refrigerante). Se o paciente disse preferir " +
        "algo assim, inclua no máximo em 1 refeição da semana, em porção pequena, nunca repetido em vários dias."
    );
  }
  if (condicoes.includes("colesterol_alto")) {
    orientacoes.push(
      "Colesterol alto: priorize gorduras insaturadas (azeite, peixes, castanhas, abacate) e evite ou reduza " +
        "receitas fritas ou muito ricas em gordura saturada (frituras, embutidos, carnes muito gordurosas)."
    );
  }
  if (condicoes.includes("hipertensao")) {
    orientacoes.push(
      "Hipertensão: modere receitas com alto teor de sódio (embutidos, enlatados, temperos industrializados, " +
        "salgadinhos); prefira preparações com pouco sal."
    );
  }
  if (condicoes.includes("doenca_renal")) {
    orientacoes.push(
      "Doença renal: modere alimentos ricos em potássio (banana, laranja, batata, tomate em grande quantidade) e " +
        "em fósforo (leite e derivados em excesso, refrigerantes escuros, embutidos); evite sal em excesso. Não " +
        "existe substituto do sal light (rico em potássio) recomendado para esse paciente."
    );
  }
  if (condicoes.includes("hipotireoidismo")) {
    orientacoes.push(
      "Hipotireoidismo: garanta iodo adequado (sal iodado, peixes, ovos) sem exagerar; evite grandes quantidades " +
        "de vegetais crucíferos crus (repolho, brócolis) na mesma refeição — cozidos não é problema; priorize " +
        "fibra, que ajuda com a constipação comum nessa condição."
    );
  }
  if (condicoes.includes("hipertireoidismo")) {
    orientacoes.push(
      "Hipertireoidismo: o metabolismo acelerado pode pedir mais calorias e proteína pra evitar perda de massa " +
        "muscular; inclua boas fontes de cálcio (leite, iogurte, folhas verde-escuras); modere cafeína, que pode " +
        "piorar sintomas como palpitação e ansiedade."
    );
  }
  return orientacoes;
}
/**
 * Classifica o texto livre de "outra condição não listada" dentro do
 * vocabulário FECHADO de indicações de receita — a IA escolhe apenas entre
 * as tags existentes, nunca inventa uma regra nova (mesmo princípio de
 * nunca dar liberdade total pra IA decidir algo de saúde sozinha). Só deve
 * ser chamada depois de confirmar que o texto NÃO bateu com nenhum termo de
 * condição clínica complexa (essas já vão pro modo seguro antes — ver
 * calculations.ts::identificarCondicaoClinicaComplexa). Em qualquer erro ou
 * resposta fora do esperado, retorna lista vazia — comportamento seguro,
 * só significa que a receita não ganha a prioridade extra.
 */
async function classificarCondicaoLivre(texto: string): Promise<IndicacaoSaudeReceita[]> {
  const anthropic = getAnthropicClient();
  if (!anthropic) return [];
  try {
    const resposta = await anthropic.messages.create({
      model: NUTRI_MODEL,
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content:
            `Um paciente escreveu esta condição de saúde em texto livre numa consulta nutricional: "${texto}"\n\n` +
            "Escolha APENAS entre estas tags (zero, uma ou mais, separadas por vírgula — responda \"nenhuma\" se " +
            `nenhuma se aplicar):\n${INDICACOES_SAUDE_VOCABULARIO.join(", ")}\n\n` +
            "Responda SOMENTE com as tags escolhidas (ou \"nenhuma\"), sem nenhuma explicação.",
        },
      ],
    });
    const textoResposta = resposta.content
      .filter((bloco) => bloco.type === "text")
      .map((bloco) => (bloco as { text: string }).text)
      .join(" ");
    const candidatas = textoResposta.split(",").map((t) => normalizar(t));
    return INDICACOES_SAUDE_VOCABULARIO.filter((tag) => candidatas.some((c) => c.includes(tag)));
  } catch (erro) {
    console.error("Falha ao classificar condição livre, seguindo sem prioridade extra:", erro);
    return [];
  }
}
/** Categorias que representam uma refeição principal — uma sobremesa nunca
 *  pode ser a refeição inteira nelas (só um extra depois, quando existir um
 *  slot próprio pra isso — hoje nenhum molde de refeição pede a categoria
 *  "sobremesa", ver escolherTemplates). "lanche" fica de fora de propósito:
 *  um lanche pode legitimamente ser algo mais doce. */
const CATEGORIAS_REFEICAO_PRINCIPAL: CategoriaReceita[] = ["cafe_da_manha", "almoco", "jantar"];
/**
 * Detecta quando o texto livre que a IA escreveu pra uma refeição (sem
 * receita_id vinculado) é, na prática, uma sobremesa da biblioteca — ex: a
 * IA escreveu "Pudim de leite" como o jantar inteiro de um dia, pra tentar
 * "atender a preferência" do paciente, mesmo sem nenhum molde de refeição
 * pedir a categoria sobremesa (ela nunca poderia ter vindo de um receita_id
 * válido pra "jantar"). Comparação por nome (primeira palavra significativa)
 * contra as sobremesas reais da biblioteca, não por uma lista de palavras
 * fixa — mesma fonte de verdade usada em notaSobrePreferenciasNaoAtendidas.
 */
function ehTextoDeSobremesa(descricao: string, nomeRefeicao: string, receitasDisponiveis: Receita[]): boolean {
  const nomesSobremesa = receitasDisponiveis
    .filter((r) => r.categoria === "sobremesa")
    .map((r) => normalizar(r.nome).split(" ")[0])
    .filter((palavra) => palavra.length >= 4);
  const textoRefeicao = normalizar(`${nomeRefeicao} ${descricao}`);
  return nomesSobremesa.some((palavra) => textoRefeicao.includes(palavra));
}
/** Soma 1h a um horário "HH:MM" — usado pra posicionar a sobremesa de fim
 *  de semana logo depois do jantar, nunca no mesmo horário. */
function somarUmaHora(horario: string): string {
  const [horas, minutos] = horario.split(":").map(Number);
  const novaHora = (horas + 1) % 24;
  return `${String(novaHora).padStart(2, "0")}:${String(minutos ?? 0).padStart(2, "0")}`;
}
interface ResultadoSobremesa {
  refeicoes: RefeicaoGerada[];
  sobremesaAdicionada: string | null;
}
/**
 * Insere, no máximo 1x por semana (sábado, logo depois do jantar), uma
 * sobremesa REAL da biblioteca — só quando a pessoa declarou uma preferência
 * que bate com uma sobremesa existente e ela já passa pelo mesmo filtro de
 * segurança (alergia/restrição) usado em qualquer outra refeição. Nunca
 * substitui uma refeição principal (essa é a diferença do bug corrigido em
 * ehTextoDeSobremesa/CATEGORIAS_REFEICAO_PRINCIPAL) — é sempre um extra,
 * com uma fatia pequena e fixa da meta calórica do dia "emprestada" do
 * próprio jantar de sábado, pra manter o total diário dentro da margem de
 * ±5% já estabelecida (nunca aumenta a meta do dia). Decisão 100% do
 * código, nunca da IA — mesmo princípio de sempre confirmar contra o dado
 * real antes de mostrar pro paciente.
 */
function adicionarSobremesaDeFimDeSemana(
  refeicoes: RefeicaoGerada[],
  avaliacao: AvaliacaoNutricional,
  receitasDisponiveis: Receita[],
  filtro: FiltroReceitas
): ResultadoSobremesa {
  const preferencias = (avaliacao.preferencias_alimentares ?? []).map((p) => p.trim()).filter(Boolean);
  if (preferencias.length === 0) return { refeicoes, sobremesaAdicionada: null };

  const sobremesasSeguras = receitasDisponiveis.filter(
    (r) => r.categoria === "sobremesa" && receitaEhSegura(r, filtro)
  );
  let sobremesaEscolhida: Receita | null = null;
  for (const preferencia of preferencias) {
    const termo = normalizar(preferencia);
    if (termo.length < 3) continue;
    const primeiraPalavra = termo.split(" ")[0];
    const candidata = sobremesasSeguras.find((r) => normalizar(r.nome).includes(primeiraPalavra));
    if (candidata) {
      sobremesaEscolhida = candidata;
      break;
    }
  }
  if (!sobremesaEscolhida) return { refeicoes, sobremesaAdicionada: null };

  const jantarSabado = refeicoes.find((r) => r.dia_semana === "sabado" && r.categoria === "jantar");
  if (!jantarSabado || jantarSabado.calorias <= 0) return { refeicoes, sobremesaAdicionada: null };

  // Fatia pequena da meta diária pra sobremesa — no máximo 8% ou 200kcal, o
  // que for menor, pra não desequilibrar o dia mesmo "emprestando" do jantar.
  const caloriasSobremesaAlvo = Math.min(Math.round(avaliacao.meta_calorica * 0.08), 200);
  const escalaBruta = sobremesaEscolhida.calorias > 0 ? caloriasSobremesaAlvo / sobremesaEscolhida.calorias : 0.5;
  const escalaSobremesa = Math.min(1, Math.max(0.3, escalaBruta));

  const sobremesaRefeicao: RefeicaoGerada = {
    dia_semana: "sabado",
    nome_refeicao: sobremesaEscolhida.nome,
    horario: somarUmaHora(jantarSabado.horario),
    categoria: "sobremesa",
    descricao: sobremesaEscolhida.descricao ?? sobremesaEscolhida.nome,
    calorias: Math.round(sobremesaEscolhida.calorias * escalaSobremesa),
    proteina_g: Math.round(sobremesaEscolhida.proteina_g * escalaSobremesa),
    carboidrato_g: Math.round(sobremesaEscolhida.carboidrato_g * escalaSobremesa),
    gordura_g: Math.round(sobremesaEscolhida.gordura_g * escalaSobremesa),
    receita_id: sobremesaEscolhida.id,
    quantidade_porcoes: Math.round(escalaSobremesa * sobremesaEscolhida.porcoes * 100) / 100,
  };

  // "Empresta" as calorias da sobremesa do próprio jantar de sábado, pra que
  // o total do dia continue igual — nunca aumenta a meta calórica do dia.
  const fatorReducaoJantar = Math.max(
    0,
    (jantarSabado.calorias - sobremesaRefeicao.calorias) / jantarSabado.calorias
  );
  const jantarAjustado: RefeicaoGerada = {
    ...jantarSabado,
    calorias: Math.round(jantarSabado.calorias * fatorReducaoJantar),
    proteina_g: Math.round(jantarSabado.proteina_g * fatorReducaoJantar),
    carboidrato_g: Math.round(jantarSabado.carboidrato_g * fatorReducaoJantar),
    gordura_g: Math.round(jantarSabado.gordura_g * fatorReducaoJantar),
    quantidade_porcoes: Math.round((jantarSabado.quantidade_porcoes ?? 1) * fatorReducaoJantar * 100) / 100,
  };

  const refeicoesAtualizadas = refeicoes.map((r) => (r === jantarSabado ? jantarAjustado : r));
  refeicoesAtualizadas.push(sobremesaRefeicao);

  return { refeicoes: refeicoesAtualizadas, sobremesaAdicionada: sobremesaEscolhida.nome };
}
/** Horário aproximado de cada opção de "horário de treino" (pergunta
 *  condicional do ConsultaWizard, só exibida pra quem não é sedentário) —
 *  usado só pra posicionar as refeições de pré/pós-treino no relógio do
 *  dia; "Varia bastante" usa um horário comum de fim de tarde como
 *  aproximação razoável, já que não temos um horário fixo declarado. */
const HORARIO_BASE_TREINO: Record<string, string> = {
  "Manhã": "07:00",
  "Tarde": "15:30",
  "Noite": "19:00",
  "Varia bastante": "18:00",
};
/** Fração da meta calórica diária destinada a cada refeição de treino —
 *  pré-treino menor e com foco em carboidrato de fácil digestão (energia
 *  pro treino), pós-treino um pouco maior e com foco em proteína +
 *  carboidrato (recuperação). Valores moderados e típicos de orientação
 *  esportiva básica — não substituem uma avaliação de nutrição esportiva
 *  individualizada, e o app não afirma isso em nenhum texto pro paciente. */
const PERCENTUAL_PRE_TREINO = 0.1;
const PERCENTUAL_POS_TREINO = 0.15;
/** Soma/subtrai minutos a um horário "HH:MM", sem ultrapassar os limites do
 *  dia (clamp 00:00–23:59) — diferente de somarUmaHora, que só soma 1h de
 *  forma cíclica (usada só pra sobremesa, onde isso nunca estoura o dia). */
function ajustarHorario(horario: string, deltaMinutos: number): string {
  const [horas, minutos] = horario.split(":").map(Number);
  const totalMinutos = Math.max(0, Math.min(23 * 60 + 59, horas * 60 + (minutos ?? 0) + deltaMinutos));
  const h = Math.floor(totalMinutos / 60);
  const m = totalMinutos % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
interface ResultadoPreEPosTreino {
  refeicoes: RefeicaoGerada[];
  incluido: boolean;
}
/**
 * Insere refeições de pré-treino e pós-treino em todos os 7 dias do plano,
 * quando o paciente treina (nivel_atividade != sedentario — condição da
 * própria pergunta no ConsultaWizard) e pediu explicitamente por elas
 * (quer_pre_pos_treino). Posicionadas em torno do horário de treino
 * declarado (ver HORARIO_BASE_TREINO). Como a consulta não pergunta QUAIS
 * dias a pessoa treina, aplicamos em todos os dias — quem treina só em
 * dias específicos pode remover manualmente as refeições que não se
 * aplicam pela tela de Plano Alimentar.
 *
 * As calorias de cada refeição vêm de uma fração fixa da meta diária (ver
 * PERCENTUAL_PRE_TREINO/POS_TREINO) — nunca aumentam a meta calórica do
 * dia: as demais refeições daquele dia são reduzidas proporcionalmente
 * pra abrir espaço, mesmo princípio já usado pra sobremesa de fim de
 * semana, mas dividido entre TODAS as refeições do dia (não só uma), já
 * que pré/pós-treino são refeições de verdade, não um extra pequeno.
 * Decisão 100% do código, nunca da IA.
 */
function adicionarPreEPosTreino(
  refeicoes: RefeicaoGerada[],
  avaliacao: AvaliacaoNutricional,
  receitasDisponiveis: Receita[],
  filtro: FiltroReceitas
): ResultadoPreEPosTreino {
  if (!avaliacao.quer_pre_pos_treino) return { refeicoes, incluido: false };

  const horarioBase = HORARIO_BASE_TREINO[avaliacao.horario_treino ?? ""] ?? HORARIO_BASE_TREINO["Varia bastante"];
  const horarioPre = ajustarHorario(horarioBase, -45);
  const horarioPos = ajustarHorario(horarioBase, 45);

  const caloriasPreAlvo = Math.round(avaliacao.meta_calorica * PERCENTUAL_PRE_TREINO);
  const caloriasPosAlvo = Math.round(avaliacao.meta_calorica * PERCENTUAL_POS_TREINO);

  const candidatasPre = filtrarReceitasCompativeis(receitasDisponiveis, "pre_treino", filtro);
  const candidatasPos = filtrarReceitasCompativeis(receitasDisponiveis, "pos_treino", filtro);
  // Sem nenhuma receita segura nas duas categorias, não há o que inserir —
  // melhor não adicionar nada do que escrever uma descrição de texto livre
  // pra uma refeição de treino, que tem mais chance de errar a mão em
  // proteína/carboidrato do que uma refeição comum.
  if (candidatasPre.length === 0 && candidatasPos.length === 0) return { refeicoes, incluido: false };

  const usadasPre = new Set<string>();
  const usadasPos = new Set<string>();
  const refeicoesFinais: RefeicaoGerada[] = [];
  let incluido = false;

  for (const dia of DIAS) {
    const refeicoesDoDia = refeicoes.filter((r) => r.dia_semana === dia);
    const somaCaloriasDia = refeicoesDoDia.reduce((soma, r) => soma + r.calorias, 0);
    const novasDoDia: RefeicaoGerada[] = [];
    let caloriasReservadas = 0;

    const metasPre: MetasRefeicao = {
      calorias: caloriasPreAlvo,
      proteinaG: Math.round(avaliacao.meta_proteina_g * PERCENTUAL_PRE_TREINO),
      carboidratoG: Math.round(avaliacao.meta_carboidrato_g * PERCENTUAL_PRE_TREINO),
      gorduraG: Math.round(avaliacao.meta_gordura_g * PERCENTUAL_PRE_TREINO),
    };
    const escolhidaPre = escolherReceita(candidatasPre, metasPre, usadasPre);
    if (escolhidaPre) {
      usadasPre.add(escolhidaPre.id);
      const escala = Math.min(2, Math.max(0.5, escolhidaPre.calorias > 0 ? caloriasPreAlvo / escolhidaPre.calorias : 1));
      const calorias = Math.round(escolhidaPre.calorias * escala);
      novasDoDia.push({
        dia_semana: dia,
        nome_refeicao: escolhidaPre.nome,
        horario: horarioPre,
        categoria: "pre_treino",
        descricao: escolhidaPre.descricao ?? escolhidaPre.nome,
        calorias,
        proteina_g: Math.round(escolhidaPre.proteina_g * escala),
        carboidrato_g: Math.round(escolhidaPre.carboidrato_g * escala),
        gordura_g: Math.round(escolhidaPre.gordura_g * escala),
        receita_id: escolhidaPre.id,
        quantidade_porcoes: Math.round(escala * escolhidaPre.porcoes * 100) / 100,
      });
      caloriasReservadas += calorias;
      incluido = true;
    }

    const metasPos: MetasRefeicao = {
      calorias: caloriasPosAlvo,
      proteinaG: Math.round(avaliacao.meta_proteina_g * PERCENTUAL_POS_TREINO),
      carboidratoG: Math.round(avaliacao.meta_carboidrato_g * PERCENTUAL_POS_TREINO),
      gorduraG: Math.round(avaliacao.meta_gordura_g * PERCENTUAL_POS_TREINO),
    };
    const escolhidaPos = escolherReceita(candidatasPos, metasPos, usadasPos);
    if (escolhidaPos) {
      usadasPos.add(escolhidaPos.id);
      const escala = Math.min(2, Math.max(0.5, escolhidaPos.calorias > 0 ? caloriasPosAlvo / escolhidaPos.calorias : 1));
      const calorias = Math.round(escolhidaPos.calorias * escala);
      novasDoDia.push({
        dia_semana: dia,
        nome_refeicao: escolhidaPos.nome,
        horario: horarioPos,
        categoria: "pos_treino",
        descricao: escolhidaPos.descricao ?? escolhidaPos.nome,
        calorias,
        proteina_g: Math.round(escolhidaPos.proteina_g * escala),
        carboidrato_g: Math.round(escolhidaPos.carboidrato_g * escala),
        gordura_g: Math.round(escolhidaPos.gordura_g * escala),
        receita_id: escolhidaPos.id,
        quantidade_porcoes: Math.round(escala * escolhidaPos.porcoes * 100) / 100,
      });
      caloriasReservadas += calorias;
      incluido = true;
    }

    if (novasDoDia.length === 0 || somaCaloriasDia <= 0) {
      // Nada seguro pra inserir nesse dia (ou nada pra reduzir proporcionalmente)
      // — mantém as refeições originais daquele dia intactas.
      refeicoesFinais.push(...refeicoesDoDia);
      continue;
    }

    // Reduz as refeições já existentes daquele dia, proporcionalmente ao
    // peso de cada uma, pra abrir espaço pras novas sem estourar a meta
    // calórica diária.
    const fatorReducao = Math.max(0, (somaCaloriasDia - caloriasReservadas) / somaCaloriasDia);
    const refeicoesAjustadas = refeicoesDoDia.map((r) => ({
      ...r,
      calorias: Math.round(r.calorias * fatorReducao),
      proteina_g: Math.round(r.proteina_g * fatorReducao),
      carboidrato_g: Math.round(r.carboidrato_g * fatorReducao),
      gordura_g: Math.round(r.gordura_g * fatorReducao),
      quantidade_porcoes: Math.round((r.quantidade_porcoes ?? 1) * fatorReducao * 100) / 100,
    }));

    refeicoesFinais.push(...refeicoesAjustadas, ...novasDoDia);
  }

  return { refeicoes: refeicoesFinais, incluido };
}
interface CandidataResumo {
  id: string;
  nome: string;
  calorias: number;
  proteina_g: number;
  carboidrato_g: number;
  gordura_g: number;
}
/**
 * Confere se as preferências alimentares do paciente REALMENTE aparecem em
 * alguma refeição do plano já montado — nunca confiamos no que a IA diz
 * sobre isso em "observacoes_nutricionista" (ela já escreveu explicações
 * bonitas sobre ter "incluído uma porção pequena" de algo que na prática
 * nunca esteve em nenhuma refeição real, ex: preferência combinava com uma
 * categoria de receita — como sobremesa — que nenhum horário do dia pede).
 * Mesmo princípio usado em receita_id: IA classifica/descreve, o código
 * decide e confirma contra o dado real. Quando a preferência não aparece no
 * plano, o próprio código escreve a explicação, sugerindo uma alternativa
 * segura da biblioteca quando existir uma.
 */
interface NotaPreferencias {
  texto: string | null;
  /** Preferências que NÃO apareceram em nenhuma refeição real do plano —
   *  usado por removerMencoesDePreferencias pra cortar qualquer frase que a
   *  IA tenha escrito por conta própria sobre elas (ver função abaixo). */
  preferenciasNaoAtendidas: string[];
}
function notaSobrePreferenciasNaoAtendidas(
  preferenciasAlimentares: string[],
  refeicoes: RefeicaoGerada[],
  receitasDisponiveis: Receita[],
  filtro: FiltroReceitas
): NotaPreferencias {
  const preferencias = preferenciasAlimentares.map((p) => p.trim()).filter(Boolean);
  if (preferencias.length === 0) return { texto: null, preferenciasNaoAtendidas: [] };
  const textoPlano = normalizar(refeicoes.map((r) => `${r.nome_refeicao} ${r.descricao}`).join(" | "));
  const notas: string[] = [];
  const preferenciasNaoAtendidas: string[] = [];
  for (const preferencia of preferencias) {
    const termo = normalizar(preferencia);
    if (termo.length < 3 || textoPlano.includes(termo)) continue;
    preferenciasNaoAtendidas.push(preferencia);
    // Não está em nenhuma refeição real — procura uma alternativa segura na
    // biblioteca que compartilhe a primeira palavra significativa (ex:
    // "pudim" de "pudim de leite condensado"), já filtrada por
    // alergia/restrição e, se possível, com alguma indicação de saúde
    // preferida pro paciente (ex: baixo índice glicêmico).
    const primeiraPalavra = termo.split(" ")[0];
    const candidatas = receitasDisponiveis.filter(
      (r) => normalizar(r.nome).includes(primeiraPalavra) && receitaEhSegura(r, filtro)
    );
    const alternativaLigadaACondicao = candidatas.find((r) =>
      (r.indicacoes_saude ?? []).some((tag) => filtro.indicacoesPreferidas.has(tag))
    );
    const alternativa = alternativaLigadaACondicao ?? candidatas[0];
    // Só afirmamos que o motivo foi a condição de saúde quando a alternativa
    // encontrada realmente bate com uma indicação preferida derivada dela —
    // fora isso, não sabemos o motivo exato (pode ser só que essa categoria
    // de receita nunca é usada pelos horários do dia) e não presumimos.
    if (alternativaLigadaACondicao) {
      notas.push(
        `Você indicou preferência por "${preferencia}", mas essa opção não entrou no plano desta semana por causa ` +
          `da sua condição de saúde — temos uma alternativa mais segura na biblioteca de receitas ("${alternativaLigadaACondicao.nome}") ` +
          "que você pode adicionar manualmente quando quiser."
      );
    } else if (alternativa) {
      notas.push(
        `Você indicou preferência por "${preferencia}", mas essa opção não entrou no plano desta semana — temos ` +
          `algo parecido na biblioteca de receitas ("${alternativa.nome}") que você pode adicionar manualmente quando quiser.`
      );
    } else {
      notas.push(
        `Você indicou preferência por "${preferencia}", mas essa opção não entrou no plano desta semana — pode ` +
          "trocar manualmente por algo da biblioteca de receitas quando quiser, respeitando suas metas do dia."
      );
    }
  }
  return { texto: notas.length > 0 ? notas.join(" ") : null, preferenciasNaoAtendidas };
}
/**
 * Corta do texto livre da IA qualquer frase que mencione uma preferência que
 * não entrou no plano — mesmo com a instrução no prompt pra IA não comentar
 * isso, na prática ela às vezes escreve por conta própria (e já foi vista
 * errando o motivo: dizendo "ausência de condições restritivas" pra uma
 * paciente com diabetes tipo 1 cadastrada). Como não dá pra confiar que o
 * prompt sozinho evita isso sempre, o código garante determinístico: essa
 * frase nunca aparece do lado da nota correta que o próprio código escreve
 * logo depois, evitando tanto duplicidade quanto informação errada.
 */
function removerMencoesDePreferencias(texto: string, termos: string[]): string {
  const termosNormalizados = termos.map((t) => normalizar(t)).filter((t) => t.length >= 3);
  if (termosNormalizados.length === 0) return texto;
  const frases = texto.split(/(?<=[.!?])\s+/);
  const frasesFiltradas = frases.filter((frase) => {
    const fraseNormalizada = normalizar(frase);
    return !termosNormalizados.some((termo) => fraseNormalizada.includes(termo));
  });
  return frasesFiltradas.join(" ").trim();
}
async function gerarPlanoComIA(
  avaliacao: AvaliacaoNutricional,
  receitasDisponiveis: Receita[]
): Promise<PlanoGerado> {
  const anthropic = getAnthropicClient()!;
  const filtro = construirFiltro(avaliacao);
  // "Outra condição" em texto livre: só tentamos extrair uma indicação de
  // receita dela quando NÃO for um caso de condição clínica complexa (essas
  // já forçam o modo seguro lá em calculations.ts, e não faz sentido
  // "otimizar receita" pra um caso que a mensagem é "procure um profissional").
  if (
    avaliacao.condicoes_saude_outras?.trim() &&
    !identificarCondicaoClinicaComplexa(avaliacao.condicoes_saude_outras)
  ) {
    const tagsExtras = await classificarCondicaoLivre(avaliacao.condicoes_saude_outras);
    tagsExtras.forEach((tag) => filtro.indicacoesPreferidas.add(tag));
  }
  const templates = escolherTemplates(avaliacao.refeicoes_por_dia);
  const categorias = [...new Set(templates.map((t) => t.categoria))];
  // Candidatas já filtradas por alergia/restrição — a IA só pode escolher
  // dentro dessas listas, nunca inventar um receita_id fora delas.
  const candidatasPorCategoria = new Map<CategoriaReceita, Receita[]>();
  const idsValidosPorCategoria = new Map<CategoriaReceita, Set<string>>();
  for (const categoria of categorias) {
    const candidatas = filtrarReceitasCompativeis(receitasDisponiveis, categoria, filtro);
    candidatasPorCategoria.set(categoria, candidatas);
    idsValidosPorCategoria.set(categoria, new Set(candidatas.map((r) => r.id)));
  }
  const resumoCandidatas: Record<string, CandidataResumo[]> = {};
  for (const [categoria, receitas] of candidatasPorCategoria) {
    resumoCandidatas[categoria] = receitas.map((r) => ({
      id: r.id,
      nome: r.nome,
      calorias: r.calorias,
      proteina_g: r.proteina_g,
      carboidrato_g: r.carboidrato_g,
      gordura_g: r.gordura_g,
    }));
  }
  const orientacoesCondicoes = construirOrientacoesCondicoesSaude(avaliacao.condicoes_saude ?? []);
  const prompt = `Você é uma nutricionista virtual especialista do app "Nutri em Casa".
Crie um plano alimentar semanal (segunda a domingo) para o paciente abaixo, respeitando
EXATAMENTE as metas calóricas e de macronutrientes calculadas.
Dados do paciente:
- Objetivo: ${avaliacao.objetivo}
- Refeições por dia: ${avaliacao.refeicoes_por_dia}
- Restrições alimentares: ${avaliacao.restricoes_alimentares.join(", ") || "nenhuma"}
- Alergias: ${avaliacao.alergias.join(", ") || "nenhuma"}
- Alimentos evitados: ${avaliacao.alimentos_evitados.join(", ") || "nenhum"}
- Preferências alimentares: ${avaliacao.preferencias_alimentares.join(", ") || "nenhuma"}
${
  avaliacao.observacoes?.trim()
    ? `- Contexto adicional que o paciente compartilhou: "${avaliacao.observacoes.trim()}" — use isso pra tornar o ` +
      "plano mais realista pro dia a dia dele(a) (ex: receitas mais rápidas se ele(a) viaja muito ou cozinha pouco), " +
      "mas isso NUNCA tem prioridade sobre as regras de segurança de alergia/condição de saúde abaixo.\n"
    : ""
}
${
  orientacoesCondicoes.length > 0
    ? `\nCONDIÇÕES DE SAÚDE — estas orientações têm PRIORIDADE sobre as preferências alimentares acima quando ` +
      `houver conflito (ex: paciente prefere doce mas tem diabetes → modere o doce, não ignore a condição). NÃO ` +
      `mencione em "observacoes_nutricionista" nenhuma preferência alimentar específica do paciente, nem para ` +
      `dizer que foi incluída, nem para dizer que foi excluída — isso é conferido e explicado pelo código, não ` +
      `pela IA. Fale só sobre a composição geral do plano (grupos alimentares, distribuição de macros, hidratação):\n` +
      orientacoesCondicoes.map((o) => `- ${o}`).join("\n") +
      "\n"
    : ""
}
Metas diárias (NÃO ultrapassar em mais de 5%):
- Calorias: ${avaliacao.meta_calorica} kcal
- Proteína: ${avaliacao.meta_proteina_g} g
- Carboidrato: ${avaliacao.meta_carboidrato_g} g
- Gordura: ${avaliacao.meta_gordura_g} g
REGRA DE SEGURANÇA OBRIGATÓRIA sobre alergias/restrições: para cada categoria de refeição,
aqui estão as ÚNICAS receitas da nossa biblioteca já filtradas como seguras para este paciente
(alergias e restrições já foram excluídas — NÃO escolha nada fora desta lista):
${JSON.stringify(resumoCandidatas, null, 2)}
Para cada refeição, se houver uma receita adequada na lista da categoria correspondente,
defina "receita_id" com o id exato dela e ajuste "quantidade_porcoes" (pode ser fracionário,
ex: 1.5) para que as calorias da receita escalada cheguem perto do alvo da refeição. Mesmo
quando definir "receita_id", o campo "descricao" é OBRIGATÓRIO e nunca pode ser null — repita
ali o nome da receita escolhida.
Se NENHUMA receita da lista servir para aquele horário/categoria, defina "receita_id" como null
e escreva uma "descricao" simples que NÃO cite nenhum alimento presente nas alergias do paciente.
Café da manhã, almoço e jantar são refeições principais e JAMAIS podem ser substituídas por uma
sobremesa/doce (ex: pudim, brigadeiro, bolo, mousse) — mesmo pra tentar atender uma preferência do
paciente. Doce nunca é a refeição inteira.
IMPORTANTE: o campo "dia_semana" deve ser exatamente um destes valores, SEM acento: "segunda",
"terca", "quarta", "quinta", "sexta", "sabado", "domingo".
Responda APENAS com um JSON válido no formato:
{
  "refeicoes": [
    { "dia_semana": "segunda", "nome_refeicao": "Café da manhã", "horario": "07:30",
      "categoria": "cafe_da_manha", "descricao": "...", "calorias": 000,
      "proteina_g": 00, "carboidrato_g": 00, "gordura_g": 00,
      "receita_id": "uuid-da-lista-ou-null", "quantidade_porcoes": 1 }
  ],
  "observacoes_nutricionista": "..."
}
Gere ${avaliacao.refeicoes_por_dia} refeições para cada um dos 7 dias.`;
  const resposta = await anthropic.messages.create({
    model: NUTRI_MODEL,
    max_tokens: 8000,
    messages: [{ role: "user", content: prompt }],
  });
  const textoResposta = resposta.content
    .filter((bloco) => bloco.type === "text")
    .map((bloco) => (bloco as { text: string }).text)
    .join("\n");
  const jsonMatch = textoResposta.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Resposta da IA não continha JSON válido.");
  const bruto = JSON.parse(jsonMatch[0]);
  // O modelo (Haiku) às vezes devolve "dia_semana" acentuado (ex: "terça",
  // "sábado") mesmo pedindo sem acento no prompt, e às vezes deixa
  // "descricao" como null quando já vinculou um receita_id, achando que não
  // precisa repetir o texto. Normaliza os dois casos antes de validar contra
  // o schema — derrubar o plano inteiro por isso seria jogar fora uma
  // resposta boa por um detalhe de formatação.
  const todasCandidatas = Object.values(resumoCandidatas).flat();
  if (Array.isArray(bruto?.refeicoes)) {
    bruto.refeicoes = bruto.refeicoes.map((refeicao: Record<string, unknown>) => {
      const diaBruto = refeicao.dia_semana;
      const diaNormalizado = typeof diaBruto === "string" ? normalizar(diaBruto) : diaBruto;
      const receitaCorrespondente =
        typeof refeicao.receita_id === "string"
          ? todasCandidatas.find((r) => r.id === refeicao.receita_id)
          : undefined;
      const descricaoValida =
        typeof refeicao.descricao === "string" && refeicao.descricao.trim() !== "";
      return {
        ...refeicao,
        dia_semana: DIAS.includes(diaNormalizado as DiaSemana) ? diaNormalizado : diaBruto,
        descricao: descricaoValida
          ? refeicao.descricao
          : (receitaCorrespondente?.nome ??
            (typeof refeicao.nome_refeicao === "string" ? refeicao.nome_refeicao : "Refeição sugerida")),
      };
    });
  }
  const plano = PlanoGeradoSchema.parse(bruto);
  // A IA costuma ser inconsistente com "quantidade_porcoes": muitas vezes
  // devolve 1 (ou simplesmente copia os valores crus da receita, sem
  // escalar de verdade) mesmo quando a receita sozinha fica bem longe da
  // meta calórica daquele horário — foi o que causou um plano de ganho de
  // massa somando só ~38% da meta diária. Em vez de confiar no número que a
  // IA escreveu, recalculamos a meta calórica de cada refeição a partir dos
  // mesmos percentuais por horário do fallback determinístico (casando cada
  // refeição do dia com o template na mesma posição, ordenado por horário)
  // e escalamos a receita real vinculada pra chegar perto disso — mesmo
  // limite de 0.5x a 2x usado lá, por consistência.
  const refeicoesPorDiaAgrupadas = new Map<string, RefeicaoGerada[]>();
  plano.refeicoes.forEach((r) => {
    const lista = refeicoesPorDiaAgrupadas.get(r.dia_semana) ?? [];
    lista.push(r);
    refeicoesPorDiaAgrupadas.set(r.dia_semana, lista);
  });
  const caloriasAlvoPorRefeicao = new Map<RefeicaoGerada, number>();
  for (const lista of refeicoesPorDiaAgrupadas.values()) {
    const ordenada = [...lista].sort((a, b) => a.horario.localeCompare(b.horario));
    ordenada.forEach((refeicao, i) => {
      const template = templates[i] ?? templates[templates.length - 1];
      caloriasAlvoPorRefeicao.set(refeicao, Math.round(avaliacao.meta_calorica * template.percentual));
    });
  }
  // Segunda camada de segurança: nunca confiar cegamente no que a IA
  // devolveu. Qualquer receita_id fora da lista permitida pra aquela
  // categoria é descartado, e qualquer descrição livre que mencione uma
  // alergia do paciente derruba o plano inteiro (cai no fallback determinístico).
  const refeicoesValidadas: RefeicaoGerada[] = plano.refeicoes.map((refeicao) => {
    const idsValidos = idsValidosPorCategoria.get(refeicao.categoria) ?? new Set<string>();
    const receitaIdValido = refeicao.receita_id && idsValidos.has(refeicao.receita_id) ? refeicao.receita_id : null;
    if (!receitaIdValido && textoContemAlergiaDoUsuario(refeicao.descricao, avaliacao.alergias)) {
      throw new Error(
        `IA sugeriu refeição de texto livre mencionando possível alergia do paciente ("${refeicao.descricao}") — descartando plano por segurança.`
      );
    }
    // Doce nunca pode ser a refeição principal inteira (só um extra depois
    // dela, quando existir um jeito estruturado de incluir isso) — cai no
    // fallback determinístico, que nunca comete esse erro porque só escolhe
    // receitas da própria categoria pedida (jantar nunca vira sobremesa lá).
    if (
      !receitaIdValido &&
      CATEGORIAS_REFEICAO_PRINCIPAL.includes(refeicao.categoria) &&
      ehTextoDeSobremesa(refeicao.descricao, refeicao.nome_refeicao, receitasDisponiveis)
    ) {
      throw new Error(
        `IA colocou uma sobremesa ("${refeicao.nome_refeicao}") como refeição principal (${refeicao.categoria}) — descartando plano por segurança nutricional.`
      );
    }
    let quantidadePorcoes = refeicao.quantidade_porcoes ?? 1;
    if (receitaIdValido) {
      const receitaResumo = todasCandidatas.find((r) => r.id === receitaIdValido);
      const caloriasAlvo = caloriasAlvoPorRefeicao.get(refeicao);
      if (receitaResumo && receitaResumo.calorias > 0 && caloriasAlvo && caloriasAlvo > 0) {
        const escalaBruta = caloriasAlvo / receitaResumo.calorias;
        quantidadePorcoes = Math.round(Math.min(2, Math.max(0.5, escalaBruta)) * 100) / 100;
      }
    }
    return { ...refeicao, receita_id: receitaIdValido, quantidade_porcoes: quantidadePorcoes };
  });
  // Insere pré/pós-treino (quando pedido) ANTES da sobremesa de fim de
  // semana, porque redistribui calorias em todos os dias — incluindo o
  // jantar de sábado, que a sobremesa usa como referência logo em seguida.
  const { refeicoes: refeicoesComTreino, incluido: preTreinoIncluido } = adicionarPreEPosTreino(
    refeicoesValidadas,
    avaliacao,
    receitasDisponiveis,
    filtro
  );
  // Antes de checar quais preferências ficaram sem atender, dá a chance de
  // uma delas virar a sobremesa de sábado (extra depois do jantar, nunca no
  // lugar dele) — só quando bate com uma sobremesa segura da biblioteca.
  const { refeicoes: refeicoesComSobremesa } = adicionarSobremesaDeFimDeSemana(
    refeicoesComTreino,
    avaliacao,
    receitasDisponiveis,
    filtro
  );
  const { texto: notaPreferencias, preferenciasNaoAtendidas } = notaSobrePreferenciasNaoAtendidas(
    avaliacao.preferencias_alimentares,
    refeicoesComSobremesa,
    receitasDisponiveis,
    filtro
  );
  // Mesmo com a instrução no prompt pra IA não comentar sobre preferências
  // incluídas/excluídas, ela às vezes escreve por conta própria — corta
  // qualquer frase que fale sobre uma preferência não atendida antes de
  // colar a nota (correta) escrita pelo código, pra não duplicar/contradizer.
  const observacoesIALimpas = removerMencoesDePreferencias(
    plano.observacoes_nutricionista,
    preferenciasNaoAtendidas
  );
  const notaTreino = preTreinoIncluido
    ? "Incluímos refeições de pré-treino e pós-treino no seu plano, posicionadas em torno do horário de treino que você informou."
    : null;
  const observacoesFinal = [observacoesIALimpas, notaTreino, notaPreferencias].filter(Boolean).join(" ");
  return { refeicoes: refeicoesComSobremesa, observacoes_nutricionista: observacoesFinal };
}
/**
 * Fallback determinístico: para cada horário do dia, escolhe a receita real
 * da biblioteca mais próxima da meta calórica daquele horário, já filtrada
 * por alergia/restrição. Quando não há nenhuma opção compatível na
 * categoria, usa uma descrição genérica (sem inventar alimento) e sinaliza
 * isso nas observações.
 */
function gerarPlanoTemplate(avaliacao: AvaliacaoNutricional, receitasDisponiveis: Receita[]): PlanoGerado {
  const templates = escolherTemplates(avaliacao.refeicoes_por_dia);
  const filtro: FiltroReceitas = construirFiltro(avaliacao);
  const refeicoes: RefeicaoGerada[] = [];
  const usadasPorCategoria = new Map<CategoriaReceita, Set<string>>();
  let algumaCategoriaSemOpcao = false;
  for (const dia of DIAS) {
    templates.forEach((template) => {
      const caloriasAlvo = Math.round(avaliacao.meta_calorica * template.percentual);
      const metasRefeicao: MetasRefeicao = {
        calorias: caloriasAlvo,
        proteinaG: Math.round(avaliacao.meta_proteina_g * template.percentual),
        carboidratoG: Math.round(avaliacao.meta_carboidrato_g * template.percentual),
        gorduraG: Math.round(avaliacao.meta_gordura_g * template.percentual),
      };
      const candidatas = filtrarReceitasCompativeis(receitasDisponiveis, template.categoria, filtro);
      const usadas = usadasPorCategoria.get(template.categoria) ?? new Set<string>();
      const escolhida = escolherReceita(candidatas, metasRefeicao, usadas);
      if (escolhida) {
        usadas.add(escolhida.id);
        usadasPorCategoria.set(template.categoria, usadas);
        // Escala a porção para chegar perto do alvo calórico, com limites
        // sensatos (0.5x a 2x) pra não gerar porções absurdas.
        const escalaBruta = escolhida.calorias > 0 ? caloriasAlvo / escolhida.calorias : 1;
        const escala = Math.min(2, Math.max(0.5, escalaBruta));
        refeicoes.push({
          dia_semana: dia,
          nome_refeicao: escolhida.nome,
          horario: template.horario,
          categoria: template.categoria,
          descricao: escolhida.descricao ?? template.descricao,
          calorias: Math.round(escolhida.calorias * escala),
          proteina_g: Math.round(escolhida.proteina_g * escala),
          carboidrato_g: Math.round(escolhida.carboidrato_g * escala),
          gordura_g: Math.round(escolhida.gordura_g * escala),
          receita_id: escolhida.id,
          quantidade_porcoes: Math.round(escala * escolhida.porcoes * 100) / 100,
        });
      } else {
        algumaCategoriaSemOpcao = true;
        refeicoes.push({
          dia_semana: dia,
          nome_refeicao: template.nome,
          horario: template.horario,
          categoria: template.categoria,
          descricao: template.descricao,
          calorias: caloriasAlvo,
          proteina_g: Math.round(avaliacao.meta_proteina_g * template.percentual),
          carboidrato_g: Math.round(avaliacao.meta_carboidrato_g * template.percentual),
          gordura_g: Math.round(avaliacao.meta_gordura_g * template.percentual),
          receita_id: null,
          quantidade_porcoes: 1,
        });
      }
    });
  }
  // Mesma lógica do caminho com IA: insere pré/pós-treino (quando pedido)
  // antes da sobremesa de fim de semana, já que redistribui calorias em
  // todos os dias, incluindo o jantar de sábado que a sobremesa usa como
  // referência logo em seguida.
  const { refeicoes: refeicoesComTreino, incluido: preTreinoIncluido } = adicionarPreEPosTreino(
    refeicoes,
    avaliacao,
    receitasDisponiveis,
    filtro
  );
  // Antes de checar preferências sem atender, dá a chance de uma virar a
  // sobremesa de sábado.
  const { refeicoes: refeicoesComSobremesa } = adicionarSobremesaDeFimDeSemana(
    refeicoesComTreino,
    avaliacao,
    receitasDisponiveis,
    filtro
  );
  // Caminho determinístico: o texto abaixo é escrito pelo próprio código
  // (não pela IA), então não tem o risco de duplicar/inventar motivo — só
  // precisamos do texto da nota, sem usar removerMencoesDePreferencias aqui.
  const { texto: notaPreferencias } = notaSobrePreferenciasNaoAtendidas(
    avaliacao.preferencias_alimentares,
    refeicoesComSobremesa,
    receitasDisponiveis,
    filtro
  );
  const observacoes =
    "Plano gerado automaticamente com base nas suas metas calóricas e de macronutrientes, priorizando receitas " +
    "da nossa biblioteca compatíveis com as restrições e alergias que você informou." +
    (algumaCategoriaSemOpcao
      ? " Algumas refeições ainda não têm uma receita da biblioteca compatível com o que você informou — troque-as " +
        "manualmente pela lista de Receitas quando adicionarmos mais opções para o seu perfil."
      : " Troque qualquer refeição pela biblioteca de receitas a qualquer momento — os valores nutricionais do dia " +
        "são recalculados automaticamente.") +
    (preTreinoIncluido
      ? " Incluímos refeições de pré-treino e pós-treino no seu plano, posicionadas em torno do horário de treino " +
        "que você informou."
      : "") +
    (notaPreferencias ? ` ${notaPreferencias}` : "");
  return { refeicoes: refeicoesComSobremesa, observacoes_nutricionista: observacoes };
}
interface TemplateRefeicao {
  nome: string;
  horario: string;
  categoria: CategoriaReceita;
  percentual: number;
  descricao: string;
}
function escolherTemplates(refeicoesPorDia: number): TemplateRefeicao[] {
  const conjuntos: Record<number, TemplateRefeicao[]> = {
    3: [
      { nome: "Café da manhã", horario: "07:30", categoria: "cafe_da_manha", percentual: 0.25, descricao: "Refeição leve e proteica para começar o dia." },
      { nome: "Almoço", horario: "12:30", categoria: "almoco", percentual: 0.4, descricao: "Refeição principal balanceada." },
      { nome: "Jantar", horario: "19:30", categoria: "jantar", percentual: 0.35, descricao: "Refeição leve para a noite." },
    ],
    4: [
      { nome: "Café da manhã", horario: "07:30", categoria: "cafe_da_manha", percentual: 0.22, descricao: "Refeição leve e proteica." },
      { nome: "Almoço", horario: "12:30", categoria: "almoco", percentual: 0.35, descricao: "Refeição principal balanceada." },
      { nome: "Lanche da tarde", horario: "16:00", categoria: "lanche", percentual: 0.13, descricao: "Lanche funcional entre refeições." },
      { nome: "Jantar", horario: "19:30", categoria: "jantar", percentual: 0.3, descricao: "Refeição leve para a noite." },
    ],
    5: [
      { nome: "Café da manhã", horario: "07:00", categoria: "cafe_da_manha", percentual: 0.2, descricao: "Refeição leve e proteica." },
      { nome: "Lanche da manhã", horario: "10:00", categoria: "lanche", percentual: 0.1, descricao: "Lanche leve." },
      { nome: "Almoço", horario: "12:30", categoria: "almoco", percentual: 0.3, descricao: "Refeição principal balanceada." },
      { nome: "Lanche da tarde", horario: "16:00", categoria: "lanche", percentual: 0.13, descricao: "Lanche funcional." },
      { nome: "Jantar", horario: "19:30", categoria: "jantar", percentual: 0.27, descricao: "Refeição leve para a noite." },
    ],
    6: [
      { nome: "Café da manhã", horario: "07:00", categoria: "cafe_da_manha", percentual: 0.18, descricao: "Refeição leve e proteica." },
      { nome: "Lanche da manhã", horario: "10:00", categoria: "lanche", percentual: 0.1, descricao: "Lanche leve." },
      { nome: "Almoço", horario: "12:30", categoria: "almoco", percentual: 0.27, descricao: "Refeição principal balanceada." },
      { nome: "Lanche da tarde", horario: "16:00", categoria: "lanche", percentual: 0.12, descricao: "Lanche funcional." },
      { nome: "Jantar", horario: "19:30", categoria: "jantar", percentual: 0.23, descricao: "Refeição leve para a noite." },
      { nome: "Ceia", horario: "21:30", categoria: "lanche", percentual: 0.1, descricao: "Ceia leve antes de dormir." },
    ],
  };
  return conjuntos[refeicoesPorDia] ?? conjuntos[3];
}
