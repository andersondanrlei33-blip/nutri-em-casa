import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Stethoscope, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/Card";
import { formatarData } from "@/lib/utils/date";
import type { AvaliacaoNutricional, RelatorioConsulta } from "@/types/domain";

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
  const relatorio = avaliacao.relatorio;

  // Consultas antigas (de antes do relatório em cartões existir) caem de
  // volta pro texto corrido que já era salvo — nunca ficam sem nenhum resumo.
  const textoResumoAntigo = avaliacao.resumo ?? avaliacao.ajuste_seguranca;

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

      {relatorio ? (
        <RelatorioEmCartoes relatorio={relatorio} />
      ) : (
        textoResumoAntigo && (
          <Card className="mt-6">
            <CardContent className="space-y-3 text-sm leading-relaxed text-foreground">
              {textoResumoAntigo.split("\n\n").map((paragrafo, i) => (
                <p key={i}>{paragrafo}</p>
              ))}
            </CardContent>
          </Card>
        )
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

function RelatorioEmCartoes({
  relatorio,
}: {
  relatorio: RelatorioConsulta;
}) {
  return (
    <div className="mt-6 space-y-5">
      {relatorio.resumoGeral && (
        <Card>
          <CardContent className="text-sm leading-relaxed text-foreground">
            <p>{relatorio.resumoGeral}</p>
          </CardContent>
        </Card>
      )}

      {relatorio.avisoMetaPeso && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm leading-relaxed text-red-800">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-600">Aviso de segurança</p>
          <p>{relatorio.avisoMetaPeso}</p>
        </div>
      )}

      {relatorio.pontosFortes.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-600">
            O que você já faz muito bem
          </h2>
          <ul className="space-y-2">
            {relatorio.pontosFortes.map((texto, i) => (
              <li key={i} className="flex items-start gap-2 rounded-xl bg-brand-50 px-4 py-2.5 text-sm text-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <span>{texto}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {relatorio.pontosAtencao.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
            Pontos que merecem mais atenção
          </h2>
          <ul className="space-y-1.5">
            {relatorio.pontosAtencao.map((ponto) => (
              <li key={ponto.chave} className="flex items-center gap-2.5 rounded-lg bg-amber-50 px-3.5 py-2 text-sm text-foreground">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[11px] font-bold text-white">
                  {ponto.prioridade}
                </span>
                {ponto.titulo}
              </li>
            ))}
          </ul>
        </section>
      )}

      {relatorio.condicoesSaude.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">Condições de Saúde</h2>
          <div className="space-y-2">
            {relatorio.condicoesSaude.map((c) => (
              <BlocoTexto key={c.chave} titulo={c.titulo} texto={c.texto} corBorda="border-red-300" bg="bg-red-50/60" />
            ))}
          </div>
        </section>
      )}

      {relatorio.habitosVida.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">Hábitos de Vida</h2>
          <div className="space-y-2">
            {relatorio.habitosVida.map((h) => (
              <BlocoTexto key={h.chave} titulo={h.titulo} texto={h.texto} corBorda="border-amber-300" bg="bg-amber-50/60" />
            ))}
          </div>
        </section>
      )}

      {relatorio.alimentacao && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">Alimentação</h2>
          <Card>
            <CardContent className="text-sm leading-relaxed text-foreground">
              <p>{relatorio.alimentacao}</p>
            </CardContent>
          </Card>
        </section>
      )}

      {relatorio.prioridades.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">Próximas Prioridades</h2>
          <Card>
            <CardContent>
              <ol className="list-decimal space-y-1.5 pl-4 text-sm text-foreground">
                {relatorio.prioridades.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </section>
      )}

      {relatorio.mensagemFinal && (
        <div className="rounded-2xl bg-brand-50 px-5 py-4 text-sm italic leading-relaxed text-brand-800">
          {relatorio.mensagemFinal}
        </div>
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

function BlocoTexto({
  titulo,
  texto,
  corBorda,
  bg,
}: {
  titulo: string;
  texto: string;
  corBorda: string;
  bg: string;
}) {
  return (
    <div className={`rounded-r-xl border-l-4 ${corBorda} ${bg} px-4 py-3`}>
      <p className="mb-1 text-sm font-semibold text-foreground">{titulo}</p>
      <p className="text-sm leading-relaxed text-foreground">{texto}</p>
    </div>
  );
}
