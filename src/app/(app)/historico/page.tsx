import { createClient } from "@/lib/supabase/server";
import { FiltroTimelineHistorico, type EventoHistorico } from "@/components/historico/FiltroTimelineHistorico";
import type {
  AvaliacaoNutricional,
  RegistroPeso,
  RegistroExercicio,
  RegistroMedidas,
  RegistroSono,
  RegistroHumor,
} from "@/types/domain";

export default async function HistoricoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: avaliacoes }, { data: pesos }, { data: exercicios }, { data: medidas }, { data: sono }, { data: humor }] =
    await Promise.all([
      supabase.from("avaliacoes_nutricionais").select("*").eq("usuario_id", user.id).order("criado_em", { ascending: false }),
      supabase.from("registros_peso").select("*").eq("usuario_id", user.id).order("data", { ascending: false }).limit(20),
      supabase.from("registros_exercicio").select("*").eq("usuario_id", user.id).order("data", { ascending: false }).limit(20),
      supabase.from("registros_medidas").select("*").eq("usuario_id", user.id).order("data", { ascending: false }).limit(20),
      supabase.from("registros_sono").select("*").eq("usuario_id", user.id).order("data", { ascending: false }).limit(20),
      supabase.from("registros_humor").select("*").eq("usuario_id", user.id).order("data", { ascending: false }).limit(20),
    ]);

  // Cada evento carrega `tipo` (não o componente do ícone — ver comentário
  // em FiltroTimelineHistorico.tsx sobre por que o ícone é resolvido lá
  // dentro, não aqui) pra alimentar tanto a listagem quanto os chips de
  // filtro por tipo de evento.
  const eventos: EventoHistorico[] = [
    ...((avaliacoes ?? []) as AvaliacaoNutricional[]).map((a) => ({
      data: a.criado_em,
      titulo: "Consulta nutricional realizada",
      descricao: `IMC ${a.imc} (${a.classificacao_imc}) · Meta calórica ${a.meta_calorica} kcal`,
      tipo: "consulta" as const,
      href: `/historico/consulta/${a.id}`,
    })),
    ...((pesos ?? []) as RegistroPeso[]).map((p) => ({
      data: p.data,
      titulo: "Peso registrado",
      descricao: `${p.peso_kg} kg${p.observacoes ? ` — ${p.observacoes}` : ""}`,
      tipo: "peso" as const,
    })),
    ...((medidas ?? []) as RegistroMedidas[]).map((m) => ({
      data: m.data,
      titulo: "Medidas registradas",
      descricao:
        [
          m.cintura_cm ? `Cintura ${m.cintura_cm}cm` : null,
          m.quadril_cm ? `Quadril ${m.quadril_cm}cm` : null,
          m.percentual_gordura ? `${m.percentual_gordura}% gordura` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "Medidas atualizadas",
      tipo: "medidas" as const,
    })),
    ...((exercicios ?? []) as RegistroExercicio[]).map((ex) => ({
      data: ex.data,
      titulo: "Exercício registrado",
      descricao: `${ex.tipo} · ${ex.duracao_min} min · intensidade ${ex.intensidade}`,
      tipo: "exercicio" as const,
    })),
    ...((sono ?? []) as RegistroSono[]).map((s) => ({
      data: s.data,
      titulo: "Sono registrado",
      descricao: `${s.horas}h · qualidade ${s.qualidade}/5`,
      tipo: "sono" as const,
    })),
    ...((humor ?? []) as RegistroHumor[]).map((h) => ({
      data: h.data,
      titulo: "Humor registrado",
      descricao: `Humor ${h.humor}/5 · Energia ${h.energia}/5${h.observacoes ? ` — ${h.observacoes}` : ""}`,
      tipo: "humor" as const,
    })),
  ].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Histórico</h1>
        <p className="mt-1 text-sm text-muted">Linha do tempo completa da sua jornada no Nutri em Casa.</p>
      </div>

      <FiltroTimelineHistorico eventos={eventos} />
    </div>
  );
}

