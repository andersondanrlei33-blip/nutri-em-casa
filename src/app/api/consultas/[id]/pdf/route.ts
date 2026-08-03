import { createElement } from "react";
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { RelatorioConsultaPDF } from "@/lib/pdf/RelatorioConsultaPDF";
import { formatarData } from "@/lib/utils/date";
import type { AvaliacaoNutricional } from "@/types/domain";

/**
 * Exporta uma consulta em PDF — usado tanto pelo botão "Baixar PDF" no
 * Histórico (qualquer consulta passada) quanto pela tela de resultado logo
 * após finalizar uma consulta nova (ConsultaWizard.tsx). Gera o PDF na hora,
 * a partir do relatório já salvo na consulta (avaliacao.relatorio) — não
 * guardamos o arquivo em lugar nenhum, porque gerar de novo é rápido e
 * determinístico (não depende de IA), então não tem necessidade de ocupar
 * espaço no Storage com um PDF que dá pra recriar igualzinho a qualquer
 * momento a partir dos mesmos dados.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }

  // Filtra por usuario_id além do RLS — defesa extra pra garantir que
  // ninguém baixe o PDF da consulta de outra pessoa só sabendo o id (mesmo
  // padrão já usado em historico/consulta/[id]/page.tsx).
  const { data } = await supabase
    .from("avaliacoes_nutricionais")
    .select("*")
    .eq("id", id)
    .eq("usuario_id", user.id)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ erro: "Consulta não encontrada." }, { status: 404 });
  }
  const avaliacao = data as AvaliacaoNutricional;

  // Consultas anteriores ao relatório em cartões não têm `avaliacao.relatorio`
  // — em vez de bloquear a exportação, o PDF cai pro conteúdo antigo que
  // ficou salvo na época (resumo/ajuste_seguranca + avaliação física), o
  // mesmo fallback que a tela de detalhe do Histórico já usa.
  const textoResumoAntigo = avaliacao.relatorio ? null : (avaliacao.resumo ?? avaliacao.ajuste_seguranca ?? null);
  const avaliacaoFisicaAntiga =
    !avaliacao.relatorio && avaliacao.avaliacao_fisica_dados?.percentualGordura != null
      ? {
          percentualGordura: avaliacao.avaliacao_fisica_dados.percentualGordura,
          classificacaoAvaliador: avaliacao.avaliacao_fisica_dados.classificacaoAvaliador ?? null,
          resumoTexto: avaliacao.avaliacao_fisica_dados.resumoTexto ?? null,
        }
      : null;

  const { data: perfil } = await supabase.from("perfis").select("nome").eq("id", user.id).maybeSingle();

  // "Consulta de Retorno" no título do PDF quando existir alguma consulta
  // anterior a esta — mesma lógica de `retorno` usada em
  // gerar-plano/route.ts e consulta/page.tsx, só que aqui contando a partir
  // da data desta consulta específica (pra funcionar em qualquer consulta
  // antiga do Histórico, não só a mais recente).
  const { count: consultasAnteriores } = await supabase
    .from("avaliacoes_nutricionais")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", user.id)
    .lt("criado_em", avaliacao.criado_em);
  const retorno = (consultasAnteriores ?? 0) > 0;

  // O tipo público de renderToBuffer só aceita um elemento <Document> direto
  // (React.ReactElement<DocumentProps>) — mas o componente é uma função
  // nossa que RETORNA um <Document> por dentro. Em tempo de execução é
  // exatamente o elemento que a lib espera; o cast serve só pra satisfazer
  // o tipo declarado por ela.
  const buffer = await renderToBuffer(
    createElement(RelatorioConsultaPDF, {
      nomePaciente: perfil?.nome ?? "Paciente",
      dataConsulta: avaliacao.criado_em,
      retorno,
      pesoKg: avaliacao.peso_kg,
      imc: avaliacao.imc,
      classificacaoImc: avaliacao.classificacao_imc,
      tmb: avaliacao.tmb,
      tdee: avaliacao.tdee,
      metaCalorica: avaliacao.meta_calorica,
      metaProteinaG: avaliacao.meta_proteina_g,
      metaCarboidratoG: avaliacao.meta_carboidrato_g,
      metaGorduraG: avaliacao.meta_gordura_g,
      metaAguaMl: avaliacao.meta_agua_ml,
      relatorio: avaliacao.relatorio,
      textoResumoAntigo,
      avaliacaoFisicaAntiga,
    }) as unknown as Parameters<typeof renderToBuffer>[0]
  );

  const nomeArquivo = `consulta-${formatarData(avaliacao.criado_em, "dd-MM-yyyy")}.pdf`;

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
