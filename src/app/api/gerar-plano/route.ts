import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { gerarResultadoAvaliacao } from "@/lib/nutrition/calculations";
import { gerarPlanoAlimentar } from "@/lib/nutrition/mealPlanGenerator";
import type { AvaliacaoNutricional, Receita } from "@/types/domain";

const CorpoSchema = z.object({
  peso_kg: z.number().positive(),
  altura_cm: z.number().positive(),
  idade: z.number().int().min(10).max(120),
  genero: z.enum(["feminino", "masculino", "outro"]),
  nivel_atividade: z.enum(["sedentario", "leve", "moderado", "intenso", "atleta"]),
  objetivo: z.enum([
    "emagrecimento",
    "manutencao",
    "ganho_massa",
    "saude_geral",
    "performance_esportiva",
  ]),
  peso_meta_kg: z.number().positive().nullable().optional(),
  restricoes_alimentares: z.array(z.string()).default([]),
  alergias: z.array(z.string()).default([]),
  condicoes_saude: z
    .array(
      z.enum([
        "diabetes_tipo1",
        "diabetes_tipo2",
        "hipertensao",
        "doenca_renal",
        "hipotireoidismo",
        "hipertireoidismo",
        "colesterol_alto",
      ])
    )
    .default([]),
  condicoes_saude_outras: z.string().nullable().optional(),
  medicamentos_em_uso: z.array(z.string()).default([]),
  refeicoes_por_dia: z.number().int().min(3).max(6).default(3),
  preferencias_alimentares: z.array(z.string()).default([]),
  alimentos_evitados: z.array(z.string()).default([]),
  qualidade_sono: z.number().int().min(1).max(5).nullable().optional(),
  nivel_estresse: z.number().int().min(1).max(5).nullable().optional(),
  observacoes: z.string().nullable().optional(),
  // Triagem de segurança: quando marcados, o motor de cálculo nunca aplica
  // déficit/superávit automático (ver lib/nutrition/calculations.ts).
  gestante: z.boolean().default(false),
  lactante: z.boolean().default(false),
  historico_transtorno_alimentar: z.boolean().default(false),
});

/**
 * Consulta Nutricional completa: calcula IMC/TMB/TDEE/macros, salva a
 * avaliação e gera automaticamente o plano alimentar semanal do usuário.
 * Este é o único caminho pelo qual um plano alimentar é criado — nunca
 * geramos uma dieta sem antes coletar e calcular os dados do paciente.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }

  const corpo = await request.json();
  const parse = CorpoSchema.safeParse(corpo);
  if (!parse.success) {
    return NextResponse.json({ erro: "Dados inválidos.", detalhes: parse.error.flatten() }, { status: 400 });
  }
  const dados = parse.data;

  const resultado = gerarResultadoAvaliacao({
    pesoKg: dados.peso_kg,
    alturaCm: dados.altura_cm,
    idade: dados.idade,
    genero: dados.genero,
    nivelAtividade: dados.nivel_atividade,
    objetivo: dados.objetivo,
    gestante: dados.gestante,
    lactante: dados.lactante,
    historicoTranstornoAlimentar: dados.historico_transtorno_alimentar,
    condicoesSaude: dados.condicoes_saude,
    qualidadeSono: dados.qualidade_sono,
    nivelEstresse: dados.nivel_estresse,
    restricoesAlimentares: dados.restricoes_alimentares,
  });

  const { data: avaliacaoSalva, error: erroAvaliacao } = await supabase
    .from("avaliacoes_nutricionais")
    .insert({
      usuario_id: user.id,
      peso_kg: dados.peso_kg,
      altura_cm: dados.altura_cm,
      idade: dados.idade,
      genero: dados.genero,
      nivel_atividade: dados.nivel_atividade,
      objetivo: dados.objetivo,
      peso_meta_kg: dados.peso_meta_kg ?? null,
      restricoes_alimentares: dados.restricoes_alimentares,
      alergias: dados.alergias,
      condicoes_saude: dados.condicoes_saude,
      condicoes_saude_outras: dados.condicoes_saude_outras || null,
      medicamentos_em_uso: dados.medicamentos_em_uso,
      refeicoes_por_dia: dados.refeicoes_por_dia,
      preferencias_alimentares: dados.preferencias_alimentares,
      alimentos_evitados: dados.alimentos_evitados,
      qualidade_sono: dados.qualidade_sono ?? null,
      nivel_estresse: dados.nivel_estresse ?? null,
      observacoes: dados.observacoes ?? null,
      gestante: dados.gestante,
      lactante: dados.lactante,
      historico_transtorno_alimentar: dados.historico_transtorno_alimentar,
      ajuste_seguranca: resultado.avisos.length > 0 ? resultado.avisos.join("\n\n") : null,
      imc: resultado.imc,
      classificacao_imc: resultado.classificacaoImc,
      tmb: resultado.tmb,
      tdee: resultado.tdee,
      meta_calorica: resultado.metaCalorica,
      meta_proteina_g: resultado.macros.proteinaG,
      meta_carboidrato_g: resultado.macros.carboidratoG,
      meta_gordura_g: resultado.macros.gorduraG,
      meta_fibra_g: resultado.macros.fibraG,
      meta_agua_ml: resultado.aguaMl,
    })
    .select()
    .single();

  if (erroAvaliacao || !avaliacaoSalva) {
    return NextResponse.json({ erro: erroAvaliacao?.message ?? "Erro ao salvar avaliação." }, { status: 500 });
  }

  // Desativa planos anteriores e cria o novo plano ativo.
  await supabase.from("planos_alimentares").update({ ativo: false }).eq("usuario_id", user.id);

  const { data: plano, error: erroPlano } = await supabase
    .from("planos_alimentares")
    .insert({ usuario_id: user.id, nome: "Meu plano alimentar", ativo: true })
    .select()
    .single();

  if (erroPlano || !plano) {
    return NextResponse.json(
      { erro: erroPlano?.message ?? "Erro ao criar plano alimentar.", avaliacao: avaliacaoSalva },
      { status: 500 }
    );
  }

  // Biblioteca de receitas disponível pro paciente (globais + próprias),
  // usada pelo gerador pra vincular refeições reais em vez de texto solto —
  // isso também é o que faz a Lista de Compras funcionar automaticamente.
  const { data: receitasDisponiveis } = await supabase
    .from("receitas")
    .select("*")
    .or(`usuario_id.eq.${user.id},usuario_id.is.null`);

  const planoGerado = await gerarPlanoAlimentar(
    avaliacaoSalva as AvaliacaoNutricional,
    (receitasDisponiveis ?? []) as Receita[]
  );

  // Mapa de id -> receita, pra usar o nome REAL da receita da biblioteca em
  // vez de confiar no "nome_refeicao" que a IA devolve — vimos na prática
  // a IA às vezes usar só o rótulo do horário ("Café da manhã") como nome,
  // o que fazia o Plano Alimentar mostrar cards sem dizer o que comer.
  const receitasPorId = new Map((receitasDisponiveis ?? []).map((r) => [r.id, r as Receita]));

  const linhasRefeicoes = planoGerado.refeicoes.map((refeicao, indice) => {
    const receitaVinculada = refeicao.receita_id ? receitasPorId.get(refeicao.receita_id) : undefined;
    const nomeExibido = receitaVinculada
      ? receitaVinculada.nome
      : refeicao.descricao?.trim() || refeicao.nome_refeicao;

    return {
      plano_id: plano.id,
      receita_id: refeicao.receita_id ?? null,
      dia_semana: refeicao.dia_semana,
      nome_refeicao: nomeExibido.slice(0, 250),
      horario: refeicao.horario,
      quantidade_porcoes: refeicao.quantidade_porcoes ?? 1,
      ordem: indice,
    };
  });

  const { error: erroRefeicoes } = await supabase.from("refeicoes_plano").insert(linhasRefeicoes);
  if (erroRefeicoes) {
    return NextResponse.json(
      { erro: erroRefeicoes.message, avaliacao: avaliacaoSalva, plano },
      { status: 500 }
    );
  }

  return NextResponse.json({
    avaliacao: avaliacaoSalva,
    plano,
    observacoesNutricionista: planoGerado.observacoes_nutricionista,
    avisos: resultado.avisos,
  });
}
