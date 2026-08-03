import { z } from "zod";
import type { AvaliacaoNutricional, CategoriaReceita, CondicaoSaude, DiaSemana, IndicacaoSaudeReceita, Receita } from "@/types/domain";
import { getAnthropicClient, NUTRI_MODEL } from "@/lib/ai/anthropicClient";
import { identificarCondicaoClinicaComplexa } from "./calculations";
import {
  construirFiltro,
  filtrarReceitasCompativeis,
  escolherReceitaPorMacro,
  textoContemAlergiaDoUsuario,
  normalizar,
  INDICACOES_SAUDE_VOCABULARIO,
  type FiltroReceitas,
} from "./receitaMatching";
import { ajustarPlanoParaMetas } from "./ajusteMacros";

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
    // "complemento" nunca é gerado pela IA nem pelos templates — só o motor
    // de ajuste (ajusteMacros.ts) cria refeições com essa categoria, depois
    // que o plano principal já foi validado contra esse schema. Incluída
    // aqui só pra RefeicaoGerada (o tipo inferido deste schema) aceitar o
    // valor quando o motor de ajuste anexa complementos ao array final.
    "complemento",
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

interface CandidataResumo {
  id: string;
  nome: string;
  calorias: number;
  proteina_g: number;
  carboidrato_g: number;
  gordura_g: number;
}

/**
 * Orientação geral sobre alimentação ao redor do treino — substitui a
 * geração de refeições dedicadas de categoria "pre_treino"/"pos_treino" no
 * plano. Motivo da troca: são só mais duas refeições pra encaixar no dia
 * (concorrendo de horário com o jantar, ver #59), a biblioteca não tem
 * repertório suficiente pra variar bem essas duas categorias específicas, e
 * uma orientação em texto é mais fácil da paciente adaptar ao dia a dia
 * dela do que um card fixo de refeição. Retorna null quando o paciente não
 * indicou querer essa orientação (`quer_pre_pos_treino` falso/null).
 */
function construirOrientacaoPrePosTreino(avaliacao: AvaliacaoNutricional): string | null {
  if (!avaliacao.quer_pre_pos_treino) return null;
  const horario = avaliacao.horario_treino?.trim();
  return (
    "Alimentação ao redor do treino: nos dias em que for treinar, faça uma refeição rica em carboidrato de fácil " +
    "digestão de 1 a 2 horas antes, com proteína moderada. Depois do treino, priorize proteína de boa qualidade e " +
    "carboidrato dentro de até 2 horas, para ajudar na recuperação muscular." +
    (horario
      ? ` Como você costuma treinar por volta de ${horario}, organize as refeições do dia em torno desse horário.`
      : "")
  );
}

/** Anexa a orientação de pré/pós-treino (quando aplicável) ao final do
 *  texto de observações do plano — usado tanto no caminho com IA quanto no
 *  fallback determinístico, pra garantir que a orientação apareça sempre
 *  que o paciente pedir, independente de qual caminho gerou o plano. */
function comOrientacaoPrePosTreino(observacoesBase: string, avaliacao: AvaliacaoNutricional): string {
  const orientacao = construirOrientacaoPrePosTreino(avaliacao);
  return orientacao ? `${observacoesBase}\n\n${orientacao}` : observacoesBase;
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
      `houver conflito (ex: paciente prefere doce mas tem diabetes → modere o doce, não ignore a condição):\n` +
      orientacoesCondicoes.map((o) => `- ${o}`).join("\n") +
      `\nSe precisar reduzir ou não atender uma preferência do paciente por causa de uma condição de saúde, ` +
      `explique isso brevemente em "observacoes_nutricionista".\n`
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

    return { ...refeicao, receita_id: receitaIdValido };
  });

  // A IA só recebe uma instrução de texto ("não ultrapassar em mais de 5%")
  // pros macros — sem verificação em código depois, isso não é garantia
  // nenhuma. O motor de ajuste roda por cima da saída da IA igual roda por
  // cima do fallback determinístico, fechando qualquer gap de proteína/
  // carboidrato/gordura que sobrou com um complemento da biblioteca.
  const refeicoesAjustadas = ajustarPlanoParaMetas(refeicoesValidadas, avaliacao, receitasDisponiveis);

  return {
    refeicoes: refeicoesAjustadas,
    observacoes_nutricionista: comOrientacaoPrePosTreino(plano.observacoes_nutricionista, avaliacao),
  };
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
      // Mesma fração (percentual) do template aplicada aos três macros da
      // meta diária — dá o alvo de proteína/carboidrato/gordura ESPECÍFICO
      // dessa refeição, não só de calorias. É esse alvo que permite à
      // escolha de receita considerar macro, não só calorias (ver
      // escolherReceitaPorMacro em receitaMatching.ts).
      const alvoRefeicao = {
        calorias: caloriasAlvo,
        proteina_g: avaliacao.meta_proteina_g * template.percentual,
        carboidrato_g: avaliacao.meta_carboidrato_g * template.percentual,
        gordura_g: avaliacao.meta_gordura_g * template.percentual,
      };
      const candidatas = filtrarReceitasCompativeis(receitasDisponiveis, template.categoria, filtro);
      const usadas = usadasPorCategoria.get(template.categoria) ?? new Set<string>();
      const escolhida = escolherReceitaPorMacro(candidatas, alvoRefeicao, usadas);

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

  const observacoes =
    "Plano gerado automaticamente com base nas suas metas calóricas e de macronutrientes, priorizando receitas " +
    "da nossa biblioteca compatíveis com as restrições e alergias que você informou." +
    (algumaCategoriaSemOpcao
      ? " Algumas refeições ainda não têm uma receita da biblioteca compatível com o que você informou — troque-as " +
        "manualmente pela lista de Receitas quando adicionarmos mais opções para o seu perfil."
      : " Troque qualquer refeição pela biblioteca de receitas a qualquer momento — os valores nutricionais do dia " +
        "são recalculados automaticamente.");

  // Escolher por macro (acima) já reduz bastante o desalinhamento, mas a
  // biblioteca nem sempre tem uma receita cuja proporção bate exatamente
  // com a meta do paciente pra toda categoria — o motor de ajuste fecha o
  // que sobrar com um complemento simples (arroz, batata doce, whey, etc.)
  const refeicoesAjustadas = ajustarPlanoParaMetas(refeicoes, avaliacao, receitasDisponiveis);

  return {
    refeicoes: refeicoesAjustadas,
    observacoes_nutricionista: comOrientacaoPrePosTreino(observacoes, avaliacao),
  };
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
