import Link from "next/link";
import { Scale, Target, Droplets, Activity, Stethoscope } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/dashboard/StatCard";
import { WeightChart } from "@/components/dashboard/WeightChart";
import { TodayMeals } from "@/components/dashboard/TodayMeals";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { hojeISO, formatarDataLonga, diasDesde, DIAS_SEMANA } from "@/lib/utils/date";
import type { AvaliacaoNutricional, RefeicaoPlano, RegistroPeso, RegistroAgua } from "@/types/domain";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const hoje = hojeISO();
  const indiceDiaJs = new Date().getDay(); // 0 = domingo
  const diaSemanaHoje = DIAS_SEMANA[(indiceDiaJs + 6) % 7]; // segunda=0 ... domingo=6

  const [
    { data: avaliacao },
    { data: planoAtivo },
    { data: registrosPeso },
    { data: registrosAguaHoje },
    { data: metas },
  ] = await Promise.all([
    supabase
      .from("avaliacoes_nutricionais")
      .select("*")
      .eq("usuario_id", user.id)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("planos_alimentares").select("id").eq("usuario_id", user.id).eq("ativo", true).maybeSingle(),
    supabase
      .from("registros_peso")
      .select("*")
      .eq("usuario_id", user.id)
      .order("data", { ascending: true })
      .limit(30),
    supabase.from("registros_agua").select("*").eq("usuario_id", user.id).eq("data", hoje),
    supabase.from("metas").select("*").eq("usuario_id", user.id).eq("concluida", false).limit(3),
  ]);

  let refeicoesHoje: RefeicaoPlano[] = [];
  if (planoAtivo) {
    const { data } = await supabase
      .from("refeicoes_plano")
      .select("*")
      .eq("plano_id", planoAtivo.id)
      .eq("dia_semana", diaSemanaHoje)
      .order("horario", { ascending: true });
    refeicoesHoje = (data ?? []) as RefeicaoPlano[];
  }

  const av = avaliacao as AvaliacaoNutricional | null;
  const pesos = (registrosPeso ?? []) as RegistroPeso[];
  const pesoAtual = pesos.at(-1)?.peso_kg ?? av?.peso_kg ?? null;
  const aguaHojeMl = ((registrosAguaHoje ?? []) as RegistroAgua[]).reduce((soma, r) => soma + r.quantidade_ml, 0);

  if (!av) {
    return (
      <EmptyState
        icone={Stethoscope}
        titulo="Vamos começar sua jornada"
        descricao="Faça sua consulta nutricional para calcular suas metas e gerar seu plano alimentar personalizado."
        acao={
          <Link href="/consulta">
            <Button>Iniciar consulta nutricional</Button>
          </Link>
        }
      />
    );
  }

  const diasDesdeConsulta = diasDesde(av.criado_em);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold capitalize text-foreground">{formatarDataLonga(hoje)}</h1>
        <p className="mt-1 text-sm text-muted">Aqui está o seu resumo de hoje.</p>
      </div>

      {diasDesdeConsulta >= 15 && (
        <Card className="border-brand-200 bg-brand-50">
          <CardContent className="flex flex-col items-start justify-between gap-3 py-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-brand-600">
                <Stethoscope className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Hora de uma consulta de retorno?</p>
                <p className="text-xs text-muted">
                  Já se passaram {diasDesdeConsulta} dias desde sua última consulta. Atualize seu peso e progresso para reajustar seu plano.
                </p>
              </div>
            </div>
            <Link href="/consulta" className="shrink-0">
              <Button variante="secundaria">Fazer consulta de retorno</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icone={Scale}
          titulo="Peso atual"
          valor={pesoAtual ? `${pesoAtual} kg` : "—"}
          sub={av.peso_meta_kg ? `Meta: ${av.peso_meta_kg} kg` : undefined}
        />
        <StatCard icone={Target} titulo="IMC" valor={av.imc.toString()} sub={av.classificacao_imc} />
        <StatCard
          icone={Droplets}
          titulo="Água hoje"
          valor={`${(aguaHojeMl / 1000).toFixed(1)} L`}
          progresso={{ atual: aguaHojeMl, meta: av.meta_agua_ml }}
        />
        <StatCard icone={Activity} titulo="Meta calórica" valor={`${av.meta_calorica} kcal`} sub={`TDEE: ${av.tdee} kcal`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Evolução do peso</CardTitle>
          </CardHeader>
          <CardContent>
            <WeightChart pontos={pesos.map((p) => ({ data: p.data, peso_kg: p.peso_kg }))} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Refeições de hoje</CardTitle>
          </CardHeader>
          <CardContent>
            <TodayMeals refeicoes={refeicoesHoje} />
          </CardContent>
        </Card>
      </div>

      {metas && metas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Suas metas</CardTitle>
            <Link href="/metas" className="text-sm font-medium text-brand-600 hover:underline">
              Ver todas
            </Link>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {metas.map((meta) => (
              <div key={meta.id} className="rounded-xl bg-black/[0.02] p-4">
                <p className="text-sm font-medium text-foreground">{meta.titulo}</p>
                {meta.valor_alvo != null && (
                  <p className="mt-1 text-xs text-muted">
                    {meta.valor_atual ?? 0} / {meta.valor_alvo} {meta.unidade}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
