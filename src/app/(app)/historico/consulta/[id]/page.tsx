import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Stethoscope } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/Card";
import { formatarData } from "@/lib/utils/date";
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

      {textoResumo && (
        <Card className="mt-6">
          <CardContent className="space-y-3 text-sm leading-relaxed text-foreground">
            {textoResumo.split("\n\n").map((paragrafo, i) => (
              <p key={i}>{paragrafo}</p>
            ))}
          </CardContent>
        </Card>
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
