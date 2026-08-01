import Link from "next/link";
import { TrendingUp, CalendarClock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { CardProgresso } from "@/components/evolucao/CardProgresso";
import { CardRCQ } from "@/components/evolucao/CardRCQ";
import { CardMetaPeso } from "@/components/evolucao/CardMetaPeso";
import { CardInsightComposicao } from "@/components/evolucao/CardInsightComposicao";
import { ComparadorConsultas } from "@/components/evolucao/ComparadorConsultas";
import { GraficoMedidas } from "@/components/evolucao/GraficoMedidas";
import { GraficoLinhaConsulta } from "@/components/evolucao/GraficoLinhaConsulta";
import { GraficoComposicaoCorporal } from "@/components/evolucao/GraficoComposicaoCorporal";
import { TimelineConsultas } from "@/components/evolucao/TimelineConsultas";
import { HeroProgresso } from "@/components/evolucao/HeroProgresso";
import { ConquistasFaixa } from "@/components/evolucao/ConquistasFaixa";
import { ConsistenciaSemana } from "@/components/evolucao/ConsistenciaSemana";
import { ComparacaoSemanal } from "@/components/evolucao/ComparacaoSemanal";
import { WeightChart } from "@/components/dashboard/WeightChart";
import { gerarMensagemMotivacional } from "@/lib/nutrition/mensagensMotivacionais";
import { calcularConquistas } from "@/lib/nutrition/conquistas";
import { estimarProgressoMeta, compararUltimasDuasSemanas } from "@/lib/nutrition/metaProgresso";
import { gerarInsightComposicaoCorporal } from "@/lib/nutrition/composicaoTrend";
import { diasDesde, calcularSequenciaAtual, calcularProximaLiberacao } from "@/lib/utils/date";
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

  // Avaliações físicas (laudos de bioimpedância anexados nas consultas), em
  // ordem cronológica — usadas como fallback pra % de gordura, RCQ, massa
  // magra e massa gorda sempre que o paciente não usa o registro manual de
  // medidas em Acompanhamento. Sem isso, esses cartões e gráficos ficavam
  // vazios pra quem só faz consulta e nunca abre a tela de Acompanhamento —
  // era exatamente o dado que a página deveria estar acompanhando.
  const avaliacoesComLaudo = avaliacoes.filter((a) => a.avaliacao_fisica_dados != null);
  const laudoInicial = avaliacoesComLaudo[0]?.avaliacao_fisica_dados ?? null;
  const laudoAtual = avaliacoesComLaudo.at(-1)?.avaliacao_fisica_dados ?? null;

  const gorduraInicial = medidasComGordura[0]?.percentual_gordura ?? laudoInicial?.percentualGordura ?? null;
  const gorduraAtual = medidasComGordura.at(-1)?.percentual_gordura ?? laudoAtual?.percentualGordura ?? null;
  const massaMagraInicial = laudoInicial?.massaMagraKg ?? null;
  const massaMagraAtual = laudoAtual?.massaMagraKg ?? null;
  const massaGordaInicial = laudoInicial?.massaGordaKg ?? null;
  const massaGordaAtual = laudoAtual?.massaGordaKg ?? null;

  // RCQ precisa de cintura e quadril da MESMA medição.
  const medidaComAmbos = [...medidas].reverse().find((m) => m.cintura_cm != null && m.quadril_cm != null);

  // Recado acolhedor sobre a tendência geral de composição corporal — só
  // faz sentido com pelo menos duas avaliações físicas diferentes (ver
  // lib/nutrition/composicaoTrend.ts). numeroConsulta serve de semente pra
  // não repetir sempre a mesma frase pro mesmo paciente.
  const insightComposicao =
    laudoInicial && laudoAtual && laudoInicial !== laudoAtual
      ? gerarInsightComposicaoCorporal(laudoInicial, laudoAtual, avaliacoes.length)
      : null;

  // Selo "próxima consulta liberada em" — mesma trava de 15 dias aplicada de
  // verdade em app/api/gerar-plano/route.ts e no bloqueio visual de
  // consulta/page.tsx; aqui é só informativo.
  const proximaLiberacao = calcularProximaLiberacao(ultima.criado_em);
  const consultaJaLiberada = proximaLiberacao.getTime() <= Date.now();

  const diasTotais = diasDesde(primeira.criado_em);

  const mensagem = gerarMensagemMotivacional({
    pesoInicial,
    pesoAtual,
    diasTotais,
    objetivo: ultima.objetivo,
  });

  // Sequência de dias seguidos com algum registro (peso, água, sono, humor,
  // exercício ou medidas) — qualquer atividade no app conta.
  const todasAsDatas = [
    ...pesos.map((p) => p.data),
    ...agua.map((a) => a.data),
    ...sono.map((s) => s.data),
    ...humor.map((h) => h.data),
    ...exercicios.map((e) => e.data),
    ...medidas.map((m) => m.data),
  ];
  const streakAtual = calcularSequenciaAtual(todasAsDatas);

  // Progresso até a meta de peso (usado no anel do topo e no card de meta).
  let percentualMeta: number | null = null;
  let metaBatida = false;
  if (ultima.peso_meta_kg != null && pesoInicial != null && pesoAtual != null) {
    const progresso = estimarProgressoMeta({
      pesoAtual,
      pesoMeta: ultima.peso_meta_kg,
      pesoInicial,
      diasDecorridos: diasTotais,
    });
    metaBatida = progresso.faltamKg === 0;
    const progressoTotal = Math.abs(pesoInicial - ultima.peso_meta_kg);
    const progressoFeito = Math.max(0, progressoTotal - progresso.faltamKg);
    percentualMeta = progressoTotal > 0 ? (progressoFeito / progressoTotal) * 100 : metaBatida ? 100 : 0;
  }

  const conquistas = calcularConquistas({
    diasTotais,
    objetivo: ultima.objetivo,
    pesoInicial,
    pesoAtual,
    metaBatida,
    streakAtual,
  });

  const comparacaoSemanal = compararUltimasDuasSemanas(pesos.map((p) => ({ data: p.data, peso_kg: p.peso_kg })));

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Evolução</h1>
          <p className="mt-1 text-sm text-muted">Tudo que comparamos numa consulta de retorno, num só lugar.</p>
        </div>
        {!consultaJaLiberada && (
          <div className="flex items-center gap-2 rounded-xl bg-black/[0.02] px-3 py-2 text-xs text-muted">
            <CalendarClock className="h-4 w-4" />
            Próxima consulta liberada em {proximaLiberacao.toLocaleDateString("pt-BR")}
          </div>
        )}
      </div>

      <HeroProgresso mensagem={mensagem} percentualMeta={percentualMeta} streakAtual={streakAtual} />

      <ConquistasFaixa conquistas={conquistas} />

      {insightComposicao && (
        <CardInsightComposicao texto={insightComposicao.texto} tendencia={insightComposicao.tendencia} />
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
          rotuloVazio="Registre em Acompanhamento, ou anexe uma avaliação física numa consulta."
        />
        <CardProgresso
          titulo="Massa magra"
          valorInicial={massaMagraInicial}
          valorAtual={massaMagraAtual}
          unidade=" kg"
          favoravel="alta"
          rotuloVazio="Anexe uma avaliação física com esse dado numa consulta para ver aqui."
        />
        <CardProgresso
          titulo="Massa gorda"
          valorInicial={massaGordaInicial}
          valorAtual={massaGordaAtual}
          unidade=" kg"
          favoravel="queda"
          rotuloVazio="Anexe uma avaliação física com esse dado numa consulta para ver aqui."
        />
        <CardRCQ
          cinturaCm={medidaComAmbos?.cintura_cm ?? null}
          quadrilCm={medidaComAmbos?.quadril_cm ?? null}
          genero={ultima.genero}
          valorDoLaudo={laudoAtual?.relacaoCinturaQuadril ?? null}
        />
      </div>

      {comparacaoSemanal && (
        <ComparacaoSemanal
          mediaAtual={comparacaoSemanal.mediaAtual}
          mediaAnterior={comparacaoSemanal.mediaAnterior}
          deltaKg={comparacaoSemanal.deltaKg}
          favoravel={favoravelPeso}
        />
      )}

      <CardMetaPeso pesoAtual={pesoAtual} pesoMeta={ultima.peso_meta_kg} pesoInicial={pesoInicial} diasDecorridos={diasTotais} />

      {avaliacoesComLaudo.length >= 2 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Peso nas consultas</CardTitle>
            </CardHeader>
            <CardContent>
              <GraficoLinhaConsulta
                pontos={avaliacoes.map((a) => ({ data: a.criado_em, valor: a.peso_kg }))}
                unidade="kg"
                cor="#22a86a"
                rotulo="Peso"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Gordura corporal nas consultas</CardTitle>
            </CardHeader>
            <CardContent>
              <GraficoLinhaConsulta
                pontos={avaliacoesComLaudo.map((a) => ({
                  data: a.criado_em,
                  valor: a.avaliacao_fisica_dados!.percentualGordura,
                }))}
                unidade="%"
                cor="#e34948"
                rotulo="Gordura corporal"
              />
            </CardContent>
          </Card>
        </div>
      )}

      {avaliacoesComLaudo.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Composição corporal por consulta</CardTitle>
          </CardHeader>
          <CardContent>
            <GraficoComposicaoCorporal avaliacoes={avaliacoesComLaudo} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Peso registrado no dia a dia</CardTitle>
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

      <Card>
        <CardHeader>
          <CardTitle>Consistência nos últimos 30 dias</CardTitle>
        </CardHeader>
        <CardContent>
          <ConsistenciaSemana
            diasComAgua={diasComAgua}
            diasComMetaAguaBatida={diasComMetaAguaBatida}
            mediaSono={mediaSono}
            mediaHumor={mediaHumor}
            totalDias={30}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Linha do tempo das consultas</CardTitle>
        </CardHeader>
        <CardContent>
          <TimelineConsultas avaliacoes={avaliacoes} />
        </CardContent>
      </Card>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Comparação clínica detalhada</p>
        <ComparadorConsultas avaliacoes={avaliacoes} />
      </div>
    </div>
  );
}
