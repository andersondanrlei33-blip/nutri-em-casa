import { z } from "zod";
import type { AvaliacaoNutricional, CategoriaReceita, DiaSemana } from "@/types/domain";
import { getAnthropicClient, NUTRI_MODEL } from "@/lib/ai/anthropicClient";

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
 */
export async function gerarPlanoAlimentar(
  avaliacao: AvaliacaoNutricional
): Promise<PlanoGerado> {
  const anthropic = getAnthropicClient();
  if (anthropic) {
    try {
      return await gerarPlanoComIA(avaliacao);
    } catch (erro) {
      console.error("Falha ao gerar plano com IA, usando fallback determinístico:", erro);
    }
  }
  return gerarPlanoTemplate(avaliacao);
}

async function gerarPlanoComIA(avaliacao: AvaliacaoNutricional): Promise<PlanoGerado> {
  const anthropic = getAnthropicClient()!;

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

Metas diárias (NÃO ultrapassar em mais de 5%):
- Calorias: ${avaliacao.meta_calorica} kcal
- Proteína: ${avaliacao.meta_proteina_g} g
- Carboidrato: ${avaliacao.meta_carboidrato_g} g
- Gordura: ${avaliacao.meta_gordura_g} g

Responda APENAS com um JSON válido no formato:
{
  "refeicoes": [
    { "dia_semana": "segunda", "nome_refeicao": "Café da manhã", "horario": "07:30",
      "categoria": "cafe_da_manha", "descricao": "...", "calorias": 000,
      "proteina_g": 00, "carboidrato_g": 00, "gordura_g": 00 }
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
  return PlanoGeradoSchema.parse(bruto);
}

/**
 * Fallback determinístico: distribui a meta calórica/macros do dia entre
 * o número de refeições configurado, usando templates por categoria.
 * É um plano real e coerente nutricionalmente (não um mock descartável) —
 * serve como base funcional até a chave de IA ser ativada, e também como
 * rede de segurança caso a API externa falhe.
 */
function gerarPlanoTemplate(avaliacao: AvaliacaoNutricional): PlanoGerado {
  const templates = escolherTemplates(avaliacao.refeicoes_por_dia);
  const refeicoes: RefeicaoGerada[] = [];

  for (const dia of DIAS) {
    templates.forEach((template) => {
      const fator = template.percentual;
      refeicoes.push({
        dia_semana: dia,
        nome_refeicao: template.nome,
        horario: template.horario,
        categoria: template.categoria,
        descricao: template.descricao,
        calorias: Math.round(avaliacao.meta_calorica * fator),
        proteina_g: Math.round(avaliacao.meta_proteina_g * fator),
        carboidrato_g: Math.round(avaliacao.meta_carboidrato_g * fator),
        gordura_g: Math.round(avaliacao.meta_gordura_g * fator),
      });
    });
  }

  return {
    refeicoes,
    observacoes_nutricionista:
      "Plano gerado automaticamente com base nas suas metas calóricas e de macronutrientes. " +
      "Troque qualquer refeição pela biblioteca de receitas a qualquer momento — os valores " +
      "nutricionais do dia são recalculados automaticamente.",
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
