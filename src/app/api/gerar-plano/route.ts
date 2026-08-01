import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { gerarResultadoAvaliacao, calcularIMC, classificarIMC } from "@/lib/nutrition/calculations";
import { gerarPlanoAlimentar } from "@/lib/nutrition/mealPlanGenerator";
import { extrairAvaliacaoFisica, type TipoImagemAceito } from "@/lib/nutrition/avaliacaoFisica";
import { gerarInterpretacoesAvaliacaoFisica, type DadosConhecidosConsulta } from "@/lib/avaliacaoFisica";
import type { AvaliacaoFisicaExtraida, AvaliacaoNutricional, Receita } from "@/types/domain";

/** Deduz o media_type pelo nome do arquivo — o bucket guarda o arquivo mas
 *  não o content-type separadamente, e o upload no cliente já restringe pra
 *  esses 3 formatos (ver ConsultaWizard.tsx::TIPOS_ARQUIVO_ACEITOS). */
function tipoImagemPeloNome(nome: string): TipoImagemAceito | null {
  const extensao = nome.toLowerCase().split(".").pop();
  if (extensao === "png") return "image/png";
  if (extensao === "webp") return "image/webp";
  if (extensao === "jpg" || extensao === "jpeg") return "image/jpeg";
  return null;
}

const CorpoSchema = z.object({
  peso_kg: z.number().positive(),
  altura_cm: z.number().positive(),
  // idade e gênero não vêm mais do formulário — são buscados do perfil
  // (tabela perfis) logo abaixo, pra não confiar em nada calculável no
  // navegador pra um dado que entra direto na fórmula de TMB/TDEE.
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
  consumo_alcool: z.enum(["nunca", "raramente", "moderado", "frequente"]).default("nunca"),
  tabagismo: z.enum(["nunca", "ex_fumante", "fumante"]).default("nunca"),
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

  // Campos da Consulta Nutricional de 40 perguntas (anamnese completa).
  // Quase tudo aqui é registro/contexto — não entra em nenhum cálculo,
  // exceto o que está anotado abaixo.
  profissao: z.string().nullable().optional(),
  tipo_suporte_esperado: z.string().nullable().optional(),
  horas_sono: z.string().nullable().optional(),
  insonia: z.boolean().nullable().optional(), // reforça aviso de sono (avaliarSonoEEstresse)
  medicacao_sono: z.string().nullable().optional(),
  disposicao_manha: z.string().nullable().optional(), // usado pelo relatório em cartões (pontos fortes)
  disposicao_tarde: z.string().nullable().optional(), // usado pelo relatório em cartões (pontos fortes)
  disposicao_noite: z.string().nullable().optional(), // usado pelo relatório em cartões (pontos fortes)
  concentracao: z.string().nullable().optional(),
  memoria_recente: z.string().nullable().optional(),
  memoria_antiga: z.string().nullable().optional(),
  rotina_trabalho: z.string().nullable().optional(),
  doencas_familiares: z.array(z.string()).default([]),
  historico_cirurgias: z.string().nullable().optional(), // escaneado junto com condicoes_saude_outras
  suplementos_em_uso: z.string().nullable().optional(),
  dieta_anterior: z.string().nullable().optional(),
  ingestao_agua_copos: z.string().nullable().optional(),
  quem_prepara_comida: z.string().nullable().optional(),
  refeicao_sozinho_ou_acompanhado: z.string().nullable().optional(),
  horario_mais_fome: z.array(z.string()).default([]),
  mastigacao: z.string().nullable().optional(),
  preferencia_sabor: z.array(z.string()).default([]),
  frequencia_restaurante: z.string().nullable().optional(),
  historico_dietetico: z.string().nullable().optional(),
  // Só respondidas por quem não é sedentário (pergunta condicional no
  // ConsultaWizard) — null pra sedentários.
  horario_treino: z.string().nullable().optional(),
  quer_pre_pos_treino: z.boolean().nullable().optional(),
  perda_peso_nao_intencional: z.string().nullable().optional(), // gera aviso automático
  ganho_peso_nao_intencional: z.string().nullable().optional(), // gera aviso automático
  como_conheceu: z.string().nullable().optional(),
  // Caminho do arquivo já enviado pro bucket avaliacoes-fisicas pelo
  // ConsultaWizard (ver enviarArquivoAvaliacaoFisica) — aqui só chega a
  // referência, o upload em si já aconteceu antes de "Finalizar consulta".
  // Opcional na 1ª consulta, mas validamos abaixo que veio preenchido numa
  // consulta de retorno (regra de negócio pedida pela nutricionista).
  avaliacao_fisica_arquivo_url: z.string().nullable().optional(),
  avaliacao_fisica_arquivo_nome: z.string().nullable().optional(),
});

/** Idade calculada a partir da data de nascimento salva no perfil — mesma
 *  lógica usada no cliente (CadastroPage/ConsultaWizard), reaplicada aqui
 *  porque idade é um dado que entra direto na fórmula de TMB/TDEE e nunca
 *  deve vir calculada só do navegador. */
function calcularIdade(dataNascimentoISO: string): number {
  const nascimento = new Date(dataNascimentoISO);
  const hoje = new Date();
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const aindaNaoFezAniversarioEsseAno =
    hoje.getMonth() < nascimento.getMonth() ||
    (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() < nascimento.getDate());
  if (aindaNaoFezAniversarioEsseAno) idade--;
  return idade;
}

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

  // Gênero e data de nascimento vêm do perfil (cadastro/"Meu Perfil"), não
  // mais do formulário da consulta — busca aqui, no servidor, pra nunca
  // confiar num valor calculável no navegador pra um dado que entra direto
  // na fórmula de TMB/TDEE. A tela de consulta já bloqueia o acesso quando
  // esses dados faltam (ver consulta/page.tsx), mas essa validação aqui é
  // a que realmente importa — sem ela, dava pra chamar a API direto.
  const { data: perfil } = await supabase
    .from("perfis")
    .select("genero, data_nascimento")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.genero || !perfil?.data_nascimento) {
    return NextResponse.json(
      { erro: "Complete seu gênero e data de nascimento em Meu Perfil antes de fazer a consulta." },
      { status: 400 }
    );
  }
  const genero = perfil.genero;
  const idade = calcularIdade(perfil.data_nascimento);

  const corpo = await request.json();
  const parse = CorpoSchema.safeParse(corpo);
  if (!parse.success) {
    return NextResponse.json({ erro: "Dados inválidos.", detalhes: parse.error.flatten() }, { status: 400 });
  }
  const dados = parse.data;

  // Conta quantas consultas esse paciente já fez antes — só usado pra
  // rotacionar as variantes de texto do relatório em cartões (ver
  // calculations.ts::escolherVariante), pra não repetir a mesma frase pro
  // mesmo ponto em consultas seguidas.
  const { count: consultasAnteriores } = await supabase
    .from("avaliacoes_nutricionais")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", user.id);
  const numeroConsulta = (consultasAnteriores ?? 0) + 1;
  const retorno = numeroConsulta > 1;

  // Regra de negócio: avaliação física é opcional na 1ª consulta, mas
  // obrigatória numa consulta de retorno (mesma regra aplicada no cliente
  // em ConsultaWizard.tsx::ehObrigatoria — repetida aqui porque é a
  // validação que realmente importa, o cliente só evita uma ida e volta
  // desnecessária).
  if (retorno && !dados.avaliacao_fisica_arquivo_url) {
    return NextResponse.json(
      { erro: "Nas consultas de retorno, é preciso anexar uma avaliação física atualizada." },
      { status: 400 }
    );
  }

  // Lê a avaliação física anexada (quando houver) com a IA — extração pura,
  // sem nenhuma decisão clínica aqui (isso é avaliarComposicaoCorporal,
  // chamada dentro de gerarResultadoAvaliacao). Qualquer falha na leitura
  // (arquivo ilegível, formato inesperado, erro de rede) não trava a
  // consulta: o arquivo já está salvo no bucket e a pessoa segue sem os
  // dados estruturados, exatamente como se não tivesse anexado nada.
  let avaliacaoFisicaDados: AvaliacaoFisicaExtraida | null = null;
  if (dados.avaliacao_fisica_arquivo_url) {
    const mediaType = tipoImagemPeloNome(dados.avaliacao_fisica_arquivo_nome ?? dados.avaliacao_fisica_arquivo_url);
    if (mediaType) {
      const { data: arquivoBaixado } = await supabase.storage
        .from("avaliacoes-fisicas")
        .download(dados.avaliacao_fisica_arquivo_url);
      if (arquivoBaixado) {
        const base64 = Buffer.from(await arquivoBaixado.arrayBuffer()).toString("base64");
        avaliacaoFisicaDados = await extrairAvaliacaoFisica(base64, mediaType);
      }
    }
  }

  // Busca a avaliação física da consulta anterior (se houver), pra habilitar
  // a regra de evolução (R12) do motor de interpretação — compara % de
  // gordura e massa muscular da avaliação atual com a mais recente que
  // também tinha avaliação física anexada e lida com sucesso. Só busca em
  // consultas de retorno (a 1ª nunca tem "anterior"). Nunca trava a
  // consulta: se a busca falhar ou não houver avaliação física anterior,
  // segue com null — R12 simplesmente não dispara, mesmo comportamento de
  // antes desta mudança.
  let avaliacaoFisicaAnterior: { dados: AvaliacaoFisicaExtraida; conhecidos: DadosConhecidosConsulta } | null = null;
  if (retorno) {
    const { data: anteriorRow } = await supabase
      .from("avaliacoes_nutricionais")
      .select("peso_kg, altura_cm, idade, genero, avaliacao_fisica_dados")
      .eq("usuario_id", user.id)
      .not("avaliacao_fisica_dados", "is", null)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (anteriorRow?.avaliacao_fisica_dados) {
      const imcAnterior = calcularIMC({
        pesoKg: anteriorRow.peso_kg,
        alturaCm: anteriorRow.altura_cm,
        idade: anteriorRow.idade,
        genero: anteriorRow.genero,
      });
      avaliacaoFisicaAnterior = {
        dados: anteriorRow.avaliacao_fisica_dados as AvaliacaoFisicaExtraida,
        conhecidos: {
          imc: imcAnterior,
          classificacaoImc: classificarIMC(imcAnterior),
          genero: anteriorRow.genero,
          idade: anteriorRow.idade,
          alturaCm: anteriorRow.altura_cm,
          pesoKg: anteriorRow.peso_kg,
        },
      };
    }
  }

  // Interpretação clínica da avaliação física (motor de regras novo, ver
  // lib/avaliacaoFisica/) — precisa rodar antes de gerarResultadoAvaliacao
  // porque envolve a Biblioteca Clínica (assíncrono), e calculations.ts é
  // deliberadamente síncrono/puro. IMC/classificação recalculados aqui só
  // pra montar o texto (gerarResultadoAvaliacao recalcula os mesmos valores
  // logo abaixo, com o mesmo resultado — cálculo é puro e barato).
  //
  // Duas saídas: textoCard (texto longo, card de Composição Corporal) e
  // mancheteResumo (frase curta, só quando uma regra "manchete" disparou —
  // ex: IMC mascarado por massa muscular — usada como abertura do Resumo
  // Geral no lugar do texto genérico de IMC).
  const imcParaMotor = calcularIMC({ pesoKg: dados.peso_kg, alturaCm: dados.altura_cm, idade, genero });
  const { textoCard: avaliacaoFisicaTextoMotor, mancheteResumo: avaliacaoFisicaMancheteResumo } =
    await gerarInterpretacoesAvaliacaoFisica(
      avaliacaoFisicaDados,
      {
        imc: imcParaMotor,
        classificacaoImc: classificarIMC(imcParaMotor),
        genero,
        idade,
        alturaCm: dados.altura_cm,
        pesoKg: dados.peso_kg,
      },
      {
        usuarioId: user.id,
        objetivo: dados.objetivo,
        nivelAtividade: dados.nivel_atividade,
        condicoesSaude: dados.condicoes_saude,
      },
      // Mesmo numeroConsulta já calculado acima (usado pela rotação de
      // variantes do relatório em blocos) — repassado aqui pra rotacionar
      // também os textos da Biblioteca Clínica da avaliação física, em vez
      // de sortear ao acaso (ver bibliotecaSelector.ts::escolherRotativo).
      numeroConsulta,
      // Avaliação física da consulta anterior (buscada acima) — habilita a
      // regra de evolução (R12).
      avaliacaoFisicaAnterior
    );

  const resultado = gerarResultadoAvaliacao({
    pesoKg: dados.peso_kg,
    alturaCm: dados.altura_cm,
    idade,
    genero,
    nivelAtividade: dados.nivel_atividade,
    objetivo: dados.objetivo,
    gestante: dados.gestante,
    lactante: dados.lactante,
    historicoTranstornoAlimentar: dados.historico_transtorno_alimentar,
    condicoesSaude: dados.condicoes_saude,
    qualidadeSono: dados.qualidade_sono,
    nivelEstresse: dados.nivel_estresse,
    restricoesAlimentares: dados.restricoes_alimentares,
    consumoAlcool: dados.consumo_alcool,
    medicamentosEmUso: dados.medicamentos_em_uso,
    condicoesSaudeOutras: dados.condicoes_saude_outras,
    tabagismo: dados.tabagismo,
    observacoesPaciente: dados.observacoes,
    pesoMetaKg: dados.peso_meta_kg,
    insonia: dados.insonia ?? false,
    historicoCirurgias: dados.historico_cirurgias,
    perdaPesoNaoIntencional: dados.perda_peso_nao_intencional,
    ganhoPesoNaoIntencional: dados.ganho_peso_nao_intencional,
    horasSono: dados.horas_sono,
    ingestaoAguaCopos: dados.ingestao_agua_copos,
    dietaAnterior: dados.dieta_anterior,
    historicoDietetico: dados.historico_dietetico,
    doencasFamiliares: dados.doencas_familiares,
    rotinaTrabalho: dados.rotina_trabalho,
    mastigacao: dados.mastigacao,
    frequenciaRestaurante: dados.frequencia_restaurante,
    disposicaoManha: dados.disposicao_manha,
    disposicaoTarde: dados.disposicao_tarde,
    disposicaoNoite: dados.disposicao_noite,
    numeroConsulta,
    avaliacaoFisicaDados,
    avaliacaoFisicaTextoMotor,
    avaliacaoFisicaMancheteResumo,
    // Peso e avaliação física da consulta anterior (buscados acima, mesmo
    // objeto já usado pela regra de evolução R12 do motor de interpretação)
    // — habilitam os cartões de evolução (peso, gordura, massa magra, massa
    // gorda) no relatório desta consulta.
    pesoAnteriorKg: avaliacaoFisicaAnterior?.conhecidos.pesoKg ?? null,
    avaliacaoFisicaAnteriorDados: avaliacaoFisicaAnterior?.dados ?? null,
  });

  const { data: avaliacaoSalva, error: erroAvaliacao } = await supabase
    .from("avaliacoes_nutricionais")
    .insert({
      usuario_id: user.id,
      peso_kg: dados.peso_kg,
      altura_cm: dados.altura_cm,
      idade,
      genero,
      nivel_atividade: dados.nivel_atividade,
      objetivo: dados.objetivo,
      // Nunca persiste a meta de peso bruta enviada pelo cliente — usa o
      // valor já passado pela trava de segurança (avaliarSegurancaMetaPeso),
      // que zera a meta quando é perigosa (ver lib/nutrition/calculations.ts).
      peso_meta_kg: resultado.pesoMetaKg,
      restricoes_alimentares: dados.restricoes_alimentares,
      alergias: dados.alergias,
      condicoes_saude: dados.condicoes_saude,
      condicoes_saude_outras: dados.condicoes_saude_outras || null,
      medicamentos_em_uso: dados.medicamentos_em_uso,
      consumo_alcool: dados.consumo_alcool,
      tabagismo: dados.tabagismo,
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
      resumo: resultado.resumo,
      // Relatório novo, em blocos — ver calculations.ts::montarRelatorioConsulta.
      // O texto corrido acima (resumo/ajuste_seguranca) continua sendo salvo
      // do mesmo jeito, sem nenhuma mudança, só por garantia/compatibilidade.
      relatorio: resultado.relatorio,
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
      profissao: dados.profissao || null,
      tipo_suporte_esperado: dados.tipo_suporte_esperado || null,
      horas_sono: dados.horas_sono || null,
      insonia: dados.insonia ?? null,
      medicacao_sono: dados.medicacao_sono || null,
      disposicao_manha: dados.disposicao_manha || null,
      disposicao_tarde: dados.disposicao_tarde || null,
      disposicao_noite: dados.disposicao_noite || null,
      concentracao: dados.concentracao || null,
      memoria_recente: dados.memoria_recente || null,
      memoria_antiga: dados.memoria_antiga || null,
      rotina_trabalho: dados.rotina_trabalho || null,
      doencas_familiares: dados.doencas_familiares,
      historico_cirurgias: dados.historico_cirurgias || null,
      suplementos_em_uso: dados.suplementos_em_uso || null,
      dieta_anterior: dados.dieta_anterior || null,
      ingestao_agua_copos: dados.ingestao_agua_copos || null,
      quem_prepara_comida: dados.quem_prepara_comida || null,
      refeicao_sozinho_ou_acompanhado: dados.refeicao_sozinho_ou_acompanhado || null,
      horario_mais_fome: dados.horario_mais_fome,
      mastigacao: dados.mastigacao || null,
      preferencia_sabor: dados.preferencia_sabor,
      frequencia_restaurante: dados.frequencia_restaurante || null,
      historico_dietetico: dados.historico_dietetico || null,
      horario_treino: dados.horario_treino || null,
      quer_pre_pos_treino: dados.quer_pre_pos_treino ?? null,
      perda_peso_nao_intencional: dados.perda_peso_nao_intencional || null,
      ganho_peso_nao_intencional: dados.ganho_peso_nao_intencional || null,
      como_conheceu: dados.como_conheceu || null,
      avaliacao_fisica_arquivo_url: dados.avaliacao_fisica_arquivo_url || null,
      avaliacao_fisica_arquivo_nome: dados.avaliacao_fisica_arquivo_nome || null,
      avaliacao_fisica_dados: avaliacaoFisicaDados,
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
  // é isso que permite calcular calorias/macros automaticamente por refeição.
  const { data: receitasDisponiveis } = await supabase
    .from("receitas")
    .select("*")
    .or(`usuario_id.eq.${user.id},usuario_id.is.null`);

  const planoGerado = await gerarPlanoAlimentar(
    avaliacaoSalva as AvaliacaoNutricional,
    (receitasDisponiveis ?? []) as Receita[]
  );

  // Salva o texto de observações do plano na própria avaliação — sem isso,
  // ele só existia na resposta desta chamada e se perdia depois: o
  // Histórico não tinha como mostrar de novo o que foi exibido na hora.
  await supabase
    .from("avaliacoes_nutricionais")
    .update({ observacoes_plano: planoGerado.observacoes_nutricionista })
    .eq("id", avaliacaoSalva.id);
  avaliacaoSalva.observacoes_plano = planoGerado.observacoes_nutricionista;

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
      categoria: receitaVinculada?.categoria ?? refeicao.categoria,
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
    resumoConsulta: resultado.resumo,
    avisoMetaPeso: resultado.avisoMetaPeso,
    // Relatório novo em blocos — a tela de resultado da consulta usa isso
    // pra montar os cartões (ver calculations.ts::RelatorioConsulta).
    relatorio: resultado.relatorio,
  });
}
