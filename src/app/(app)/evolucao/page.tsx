import Link from "next/link";
import { TrendingUp, Stethoscope } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { CardProgresso } from "@/components/evolucao/CardProgresso";
import { CardRCQ } from "@/components/evolucao/CardRCQ";
import { CardMetaPeso } from "@/components/evolucao/CardMetaPeso";
import { ComparadorConsultas } from "@/components/evolucao/ComparadorConsultas";
import { GraficoMedidas } from "@/components/evolucao/GraficoMedidas";
import { WeightChart } from "@/components/dashboard/WeightChart";
import { gerarMensagemMotivacional } from "@/lib/nutrition/mensagensMotivacionais";
import { diasDesde } from "@/lib/utils/date";
import type {
  AvaliacaoNutricional,
  RegistroPeso,
  RegistroMedidas,
  RegistroAgua,
  RegistroSono,
  RegistroHumor,
  RegistroExercicio,
} from "@/types/domain";

export default async function EvolucaoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [
    { data: avaliacoesData },
    { data: pesosData },
    { data: medidasData },
    { data: aguaData },
    { data: sonoData },
    { data: humorData },
    { data: exerciciosData },
  ] = await Promise.all([
    supabase.from("avaliacoes_nutricionais").select("*").eq("usuario_id", user.id).order("criado_em", { ascending: true }),
    supabase.from("registros_peso").select("*").eq("usuario_id", user.id).order("data", { ascending: true }),
    supabase.from("registros_medidas").select("*").eq("usuario_id", user.id).order("data", { ascending: true }),
    supabase.from("registros_agua").select("*").eq("usuario_id", user.id).gte("data", trintaDiasAtras),
    supabase.from("registros_sono").select("*").eq("usuario_id", user.id).gte("data", trintaDiasAtras),
    supabase.from("registros_humor").select("*").eq("usuario_id", user.id).gte("data", trintaDiasAtras),
    supabase.from("registros_exercicio").select("*").eq("usuario_id", user.id).gte("data", trintaDiasAtras),
  ]);

  const avaliacoes = (avaliacoesData ?? []) as AvaliacaoNutricional[];
  const pesos = (pesosData ?? []) as RegistroPeso[];
  const medidas = (medidasData ?? []) as RegistroMedidas[];
  const agua = (aguaData ?? []) as RegistroAgua[];
  const sono = (sonoData ?? []) as RegistroSono[];
  const humor = (humorData ?? []) as RegistroHumor[];
  const exercicios = (exerciciosData ?? []) as RegistroExercicio[];

  if (avaliacoes.length === 0) {
    return (
      <EmptyState
        icone={TrendingUp}
        titulo="Sua evolução aparece aqui"
        descricao="Faça sua primeira consulta nutricional para começarmos a acompanhar seu progresso ao longo do tempo — peso, medidas e tudo que a gente compara numa consulta de retorno."
        acao={
          <Link href="/consulta">
            <Button>Iniciar consulta nutricional</Button>
          </Link>
        }
      />
    );
  }

  const primeira = avaliacoes[0];
  const ultima = avaliacoes[avaliacoes.length - 1];
  const favoravelPeso: "queda" | "alta" = ultima.objetivo === "ganho_massa" ? "alta" : "queda";

  const pesoInicial = pesos[0]?.peso_kg ?? primeira.peso_kg;
  const pesoAtual = pesos.at(-1)?.peso_kg ?? ultima.peso_kg;

  const medidasComCintura = medidas.filter((m) => m.cintura_cm != null);
  const cinturaInicial = medidasComCintura[0]?.cintura_cm ?? null;
  const cinturaAtual = medidasComCintura.at(-1)?.cintura_cm ?? null;

  const medidasComGordura = medidas.filter((m) => m.percentual_gordura != null);
  const gorduraInicial = medidasComGordura[0]?.percentual_gordura ?? null;
  const gorduraAtual = medidasComGordura.at(-1)?.percentual_gordura ?? null;

  // RCQ precisa de cintura e quadril da MESMA medição.
  const medidaComAmbos = [...medidas].reverse().find((m) => m.cintura_cm != null && m.quadril_cm != null);

  const diasTotais = diasDesde(primeira.criado_em);

  const mensagem = gerarMensagemMotivacional({
    pesoInicial,
    pesoAtual,
    diasTotais,
    objetivo: ultima.objetivo,
  });

  // Consistência nos últimos 30 dias — o quanto o paciente vem seguindo a
  // rotina recomendada, não só o resultado na balança.
  const totalPorDiaAgua = agua.reduce<Record<string, number>>((acc, a) => {
    acc[a.data] = (acc[a.data] ?? 0) + a.quantidade_ml;
    return acc;
  }, {});
  const diasComAgua = Object.keys(totalPorDiaAgua).length;
  const diasComMetaAguaBatida = Object.values(totalPorDiaAgua).filter((total) => total >= ultima.meta_agua_ml).length;
  const mediaSono = sono.length > 0 ? sono.reduce((s, r) => s + r.horas, 0) / sono.length : null;
  const mediaHumor = humor.length > 0 ? humor.reduce((s, r) => s + r.humor, 0) / humor.length : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Evolução</h1>
        <p className="mt-1 text-sm text-muted">Tudo que comparamos numa consulta de retorno, num só lugar.</p>
      </div>

      <Card className="border-brand-200 bg-brand-50">
        <CardContent className="flex items-start gap-3 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-brand-600">
            <Stethoscope className="h-4.5 w-4.5" />
          </div>
          <p className="text-sm text-foreground">{mensagem}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <CardProgresso titulo="Peso" valorInicial={pesoInicial} valorAtual={pesoAtual} unidade=" kg" favoravel={favoravelPeso} />
        <CardProgresso titulo="IMC" valorInicial={primeira.imc} valorAtual={ultima.imc} unidade="" favoravel={favoravelPeso} />
        <CardProgresso
          titulo="Cintura"
          valorInicial={cinturaInicial}
          valorAtual={cinturaAtual}
          unidade=" cm"
          favoravel="queda"
          rotuloVazio="Registre sua cintura em Acompanhamento para ver aqui."
        />
        <CardProgresso
          titulo="% Gordura"
          valorInicial={gorduraInicial}
          valorAtual={gorduraAtual}
          unidade="%"
          favoravel="queda"
          rotuloVazio="Registre seu % de gordura em Acompanhamento para ver aqui."
        />
        <CardRCQ
          cinturaCm={medidaComAmbos?.cintura_cm ?? null}
          quadrilCm={medidaComAmbos?.quadril_cm ?? null}
          genero={ultima.genero}
        />
      </div>

      <CardMetaPeso pesoAtual={pesoAtual} pesoMeta={ultima.peso_meta_kg} pesoInicial={pesoInicial} diasDecorridos={diasTotais} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Evolução do peso</CardTitle>
          </CardHeader>
          <CardContent>
            <WeightChart pontos={pesos.map((p) => ({ data: p.data, peso_kg: p.peso_kg }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Evolução das medidas</CardTitle>
          </CardHeader>
          <CardContent>
            <GraficoMedidas registros={medidas} />
          </CardContent>
        </Card>
      </div>

      <ComparadorConsultas avaliacoes={avaliacoes} />

      <Card>
        <CardHeader>
          <CardTitle>Consistência nos últimos 30 dias</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ResumoItem label="Dias com água registrada" valor={`${diasComAgua}/30`} />
          <ResumoItem label="Dias com meta de água batida" valor={`${diasComMetaAguaBatida}/30`} />
          <ResumoItem label="Sono médio" valor={mediaSono != null ? `${mediaSono.toFixed(1)}h` : "—"} />
          <ResumoItem label="Humor médio" valor={mediaHumor != null ? `${mediaHumor.toFixed(1)}/5` : "—"} />
        </CardContent>
      </Card>
    </div>
  );
}

function ResumoItem({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-xl bg-black/[0.02] p-4 text-center">
      <p className="text-lg font-semibold text-foreground">{valor}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}
