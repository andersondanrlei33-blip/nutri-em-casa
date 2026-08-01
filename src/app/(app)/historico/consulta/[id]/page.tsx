import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Stethoscope, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/Card";
import { formatarData } from "@/lib/utils/date";
import { RelatorioEmCartoes } from "@/components/RelatorioEmCartoes";
import type { AvaliacaoNutricional } from "@/types/domain";

export default async function DetalheConsultaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Filtra por usuario_id além do RLS — defesa extra pra garantir que
  // ninguém acesse a consulta de outra pessoa só sabendo o id.
  const { data } = await supabase
    .from("avaliacoes_nutricionais")
    .select("*")
    .eq("id", id)
    .eq("usuario_id", user.id)
    .maybeSingle();

  if (!data) notFound();
  const avaliacao = data as AvaliacaoNutricional;

  // Consultas antigas (antes da coluna "resumo" existir) caem de volta pro
  // texto de avisos que já era salvo — nunca ficam sem nenhum resumo.
  const textoResumo = avaliacao.resumo ?? avaliacao.ajuste_seguranca;

  // Link temporário (10 min) pro arquivo da avaliação física — o bucket é
  // privado (diferente de avatares/receitas), então precisa de signed URL,
  // nunca de link público direto (ver migration add_avaliacao_fisica).
  let linkArquivoAvaliacaoFisica: string | null = null;
  if (avaliacao.avaliacao_fisica_arquivo_url) {
    const { data: assinado } = await supabase.storage
      .from("avaliacoes-fisicas")
      .createSignedUrl(avaliacao.avaliacao_fisica_arquivo_url, 60 * 10);
    linkArquivoAvaliacaoFisica = assinado?.signedUrl ?? null;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/historico" className="mb-5 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Voltar para histórico
      </Link>

      <div className="mb-1 flex items-center gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Stethoscope className="h-4 w-4" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Consulta nutricional</h1>
      </div>
      <p className="text-sm text-muted">{formatarData(avaliacao.criado_em, "dd/MM/yyyy 'às' HH:mm")}</p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metrica label="IMC" valor={avaliacao.imc.toString()} sub={avaliacao.classificacao_imc} />
        <Metrica label="TMB" valor={`${avaliacao.tmb} kcal`} />
        <Metrica label="TDEE" valor={`${avaliacao.tdee} kcal`} />
        <Metrica label="Meta calórica" valor={`${avaliacao.meta_calorica} kcal`} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metrica label="Proteína" valor={`${avaliacao.meta_proteina_g}g`} />
        <Metrica label="Carboidrato" valor={`${avaliacao.meta_carboidrato_g}g`} />
        <Metrica label="Gordura" valor={`${avaliacao.meta_gordura_g}g`} />
        <Metrica label="Água" valor={`${(avaliacao.meta_agua_ml / 1000).toFixed(1)} L`} />
      </div>

      {avaliacao.avaliacao_fisica_arquivo_nome && (
        <div className="mt-4 flex items-center gap-2 text-sm text-foreground">
          <FileText className="h-4 w-4 shrink-0 text-brand-600" />
          <LinkArquivoAvaliacaoFisica url={linkArquivoAvaliacaoFisica} nome={avaliacao.avaliacao_fisica_arquivo_nome} />
        </div>
      )}

      {/* Consultas com o relatório novo (em blocos) usam o mesmo componente
       *  de cartões que a tela de resultado logo após finalizar a consulta
       *  (ConsultaWizard.tsx) — pra nunca mais divergir uma tela da outra.
       *  Consultas salvas antes dessa coluna existir (avaliacao.relatorio
       *  null) caem pro texto corrido antigo, único jeito que tinham. */}
      {avaliacao.relatorio ? (
        <RelatorioEmCartoes relatorio={avaliacao.relatorio} />
      ) : (
        <>
          {avaliacao.avaliacao_fisica_dados?.percentualGordura != null && (
            <Card className="mt-6">
              <CardContent className="text-sm text-foreground">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">Avaliação Física</h2>
                <p className="leading-relaxed text-muted">
                  % de gordura: {avaliacao.avaliacao_fisica_dados.percentualGordura}%
                  {avaliacao.avaliacao_fisica_dados.classificacaoAvaliador
                    ? ` (${avaliacao.avaliacao_fisica_dados.classificacaoAvaliador})`
                    : ""}
                </p>
                {avaliacao.avaliacao_fisica_dados.resumoTexto && (
                  <p className="mt-2 leading-relaxed text-muted">{avaliacao.avaliacao_fisica_dados.resumoTexto}</p>
                )}
              </CardContent>
            </Card>
          )}

          {textoResumo && (
            <Card className="mt-6">
              <CardContent className="space-y-3 text-sm leading-relaxed text-foreground">
                {textoResumo.split("\n\n").map((paragrafo, i) => (
                  <p key={i}>{paragrafo}</p>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {avaliacao.observacoes && (
        <p className="mt-4 text-sm text-muted">
          <span className="font-medium text-foreground">Você comentou na época: </span>
          {avaliacao.observacoes}
        </p>
      )}
    </div>
  );
}

function Metrica({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-black/[0.02] px-3 py-2.5 text-center">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-base font-semibold text-foreground">{valor}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

/** Isolado num componente à parte, com tag numa linha só, pra ficar mais
 *  simples de colar sem perder linha (o link com 4 atributos em linhas
 *  separadas deu problema ao colar no editor do GitHub). */
function LinkArquivoAvaliacaoFisica({ url, nome }: { url: string | null; nome: string }) {
  if (!url) return <span>{nome}</span>;
  const props = { href: url, target: "_blank", rel: "noopener noreferrer", className: "text-brand-700 underline hover:text-brand-800" };
  return <a {...props}>{nome}</a>;
}
