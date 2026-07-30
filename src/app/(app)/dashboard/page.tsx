import Link from "next/link";
import { Scale, Target, Droplets, Activity, Stethoscope } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/dashboard/StatCard";
import { WeightChart } from "@/components/dashboard/WeightChart";
import { TodayMeals } from "@/components/dashboard/TodayMeals";
import { MacroBars } from "@/components/dashboard/MacroBars";
import { ConquistasCard } from "@/components/dashboard/ConquistasCard";
import { WeeklyAdherenceChart, type DiaAdesao } from "@/components/dashboard/WeeklyAdherenceChart";
import { QuickWaterButton } from "@/components/dashboard/QuickWaterButton";
import { QuickWeightModal } from "@/components/dashboard/QuickWeightModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import {
  hojeISO,
  formatarData,
  formatarDataLonga,
  diasDesde,
  calcularSequenciaAtual,
  semanaAtual,
  diaSemanaHoje,
  DIAS_SEMANA_LABEL,
} from "@/lib/utils/date";
import { calcularConquistas } from "@/lib/nutrition/conquistas";
import type {
  AvaliacaoNutricional,
  RefeicaoPlano,
  RegistroPeso,
  RegistroAgua,
  RegistroConsumo,
  Receita,
} from "@/types/domain";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const hoje = hojeISO();
  const diaHoje = diaSemanaHoje();
  const diasSemana = semanaAtual();
  const inicioSemanaISO = formatarData(diasSemana[0].data, "yyyy-MM-dd");
  const fimSemanaISO = formatarData(diasSemana[6].data, "yyyy-MM-dd");

  const [
    { data: avaliacao },
    { data: primeiraAvaliacao },
    { data: planoAtivo },
    { data: registrosPeso },
    { data: registrosAguaHoje },
    { data: registrosConsumoSemana },
    { data: datasAguaTodas },
    { data: datasSono },
    { data: datasHumor },
    { data: datasExercicio },
    { data: datasMedidas },
    { data: datasConsumoTodas },
  ] = await Promise.all([
    supabase
      .from("avaliacoes_nutricionais")
      .select("*")
      .eq("usuario_id", user.id)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("avaliacoes_nutricionais")
      .select("criado_em, peso_kg")
      .eq("usuario_id", user.id)
      .order("criado_em", { ascending: true })
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
    // Registros reais de consumo (data específica, não dia da semana genérico)
    // da semana corrente — fonte de verdade tanto pros macros de hoje quanto
    // pro gráfico de adesão semanal (ver lib/nutrition/registrarConsumo.ts).
    supabase
      .from("registros_consumo")
      .select("*")
      .eq("usuario_id", user.id)
      .gte("data", inicioSemanaISO)
      .lte("data", fimSemanaISO),
    // Consultas leves (só a data), usadas exclusivamente pra calcular a
    // sequência de dias seguidos com pelo menos um registro (ver
    // lib/utils/date.ts::calcularSequenciaAtual).
    supabase.from("registros_agua").select("data").eq("usuario_id", user.id),
    supabase.from("registros_sono").select("data").eq("usuario_id", user.id),
    supabase.from("registros_humor").select("data").eq("usuario_id", user.id),
    supabase.from("registros_exercicio").select("data").eq("usuario_id", user.id),
    supabase.from("registros_medidas").select("data").eq("usuario_id", user.id),
    supabase.from("registros_consumo").select("data").eq("usuario_id", user.id),
  ]);

  // Busca a semana inteira do plano (modelo recorrente por dia da semana) —
  // usada só pra saber quais refeições existem e montar "Refeições de hoje".
  // Quem manda no que foi realmente comido é registros_consumo, buscado acima.
  let refeicoesSemana: RefeicaoPlano[] = [];
  let receitasPorId = new Map<string, Receita>();
  if (planoAtivo) {
    const { data } = await supabase
      .from("refeicoes_plano")
      .select("*")
      .eq("plano_id", planoAtivo.id)
      .order("horario", { ascending: true });
    refeicoesSemana = (data ?? []) as RefeicaoPlano[];

    const idsReceitas = new Set<string>();
    refeicoesSemana.forEach((r) => r.receita_id && idsReceitas.add(r.receita_id));
    ((registrosConsumoSemana ?? []) as RegistroConsumo[]).forEach(
      (r) => r.receita_id && idsReceitas.add(r.receita_id)
    );

    if (idsReceitas.size > 0) {
      const { data: receitas } = await supabase.from("receitas").select("*").in("id", Array.from(idsReceitas));
      receitasPorId = new Map((receitas ?? []).map((r) => [r.id, r as Receita]));
    }
  }
  const refeicoesHoje = refeicoesSemana.filter((r) => r.dia_semana === diaHoje);
  const registrosSemana = (registrosConsumoSemana ?? []) as RegistroConsumo[];
  const registrosHoje = registrosSemana.filter((r) => r.data === hoje);

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

  // Macros consumidos hoje = soma direta dos registros reais de hoje (já
  // calculados no momento do registro — ver registrarConsumo.ts), nunca uma
  // estimativa a partir do plano.
  const macrosConsumidos = registrosHoje.reduce(
    (soma, registro) => ({
      proteinaG: soma.proteinaG + registro.proteina_g,
      carboidratoG: soma.carboidratoG + registro.carboidrato_g,
      gorduraG: soma.gorduraG + registro.gordura_g,
    }),
    { proteinaG: 0, carboidratoG: 0, gorduraG: 0 }
  );

  // Adesão ao plano por dia da semana (segunda a domingo) DESTA semana
  // específica — % das refeições prescritas naquele dia que já têm um
  // registro real de consumo na data correspondente. Como os registros são
  // por data (não por dia da semana genérico), a barra reseta sozinha toda
  // semana. Dias depois de hoje ainda não têm como ter adesão, então são
  // marcados como "futuro" e aparecem como barra vazia, não como 0%.
  const adesaoSemanal: DiaAdesao[] = diasSemana.map(({ dia, data }) => {
    const dataISO = formatarData(data, "yyyy-MM-dd");
    const totalDoDia = refeicoesSemana.filter((r) => r.dia_semana === dia).length;
    const consumidasDoDia = registrosSemana.filter((r) => r.data === dataISO).length;
    return {
      label: DIAS_SEMANA_LABEL[dia][0],
      percentual: totalDoDia > 0 ? (consumidasDoDia / totalDoDia) * 100 : 0,
      futuro: dataISO > hoje,
      hoje: dataISO === hoje,
    };
  });

  // Sequência atual de dias seguidos com pelo menos um registro em qualquer
  // frente (peso, água, sono, humor, exercício, medidas ou refeição comida).
  const todasAsDatas = [
    ...pesos.map((p) => p.data),
    ...((datasAguaTodas ?? []) as { data: string }[]).map((r) => r.data),
    ...((datasSono ?? []) as { data: string }[]).map((r) => r.data),
    ...((datasHumor ?? []) as { data: string }[]).map((r) => r.data),
    ...((datasExercicio ?? []) as { data: string }[]).map((r) => r.data),
    ...((datasMedidas ?? []) as { data: string }[]).map((r) => r.data),
    ...((datasConsumoTodas ?? []) as { data: string }[]).map((r) => r.data),
  ];
  const streakAtual = calcularSequenciaAtual(todasAsDatas);

  const pesoInicial = (primeiraAvaliacao as { peso_kg: number } | null)?.peso_kg ?? av.peso_kg;
  const dataInicioJornada = (primeiraAvaliacao as { criado_em: string } | null)?.criado_em ?? av.criado_em;
  const metaBatida = av.peso_meta_kg != null && pesoAtual != null && Math.abs(pesoAtual - av.peso_meta_kg) < 0.5;

  const conquistas = calcularConquistas({
    diasTotais: diasDesde(dataInicioJornada),
    objetivo: av.objetivo,
    pesoInicial,
    pesoAtual,
    metaBatida,
    streakAtual,
  });

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
          acao={<QuickWaterButton usuarioId={user.id} />}
        />
        <StatCard icone={Activity} titulo="Meta calórica" valor={`${av.meta_calorica} kcal`} sub={`TDEE: ${av.tdee} kcal`} />
      </div>

      <MacroBars
        consumido={macrosConsumidos}
        meta={{
          proteinaG: av.meta_proteina_g,
          carboidratoG: av.meta_carboidrato_g,
          gorduraG: av.meta_gordura_g,
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Adesão ao plano essa semana</CardTitle>
        </CardHeader>
        <CardContent>
          <WeeklyAdherenceChart dados={adesaoSemanal} />
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Refeições de hoje</CardTitle>
          </CardHeader>
          <CardContent>
            <TodayMeals
              refeicoes={refeicoesHoje}
              registros={registrosHoje}
              receitasPorId={receitasPorId}
              usuarioId={user.id}
              hoje={hoje}
            />
          </CardContent>
        </Card>

        <ConquistasCard conquistas={conquistas} />

        <Card>
          <CardHeader>
            <CardTitle>Evolução do peso</CardTitle>
          </CardHeader>
          <CardContent>
            {pesos.length < 2 ? (
              <EmptyState
                icone={Scale}
                titulo="Ainda sem histórico suficiente"
                descricao="Registre seu peso por alguns dias para ver a evolução aqui."
                acao={<QuickWeightModal usuarioId={user.id} />}
              />
            ) : (
              <WeightChart pontos={pesos.map((p) => ({ data: p.data, peso_kg: p.peso_kg }))} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
