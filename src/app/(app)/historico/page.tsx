import { History, Stethoscope, Scale, Dumbbell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatarData } from "@/lib/utils/date";
import type { AvaliacaoNutricional, RegistroPeso, RegistroExercicio } from "@/types/domain";

interface EventoHistorico {
  data: string;
  titulo: string;
  descricao: string;
  icone: typeof History;
}

export default async function HistoricoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: avaliacoes }, { data: pesos }, { data: exercicios }] = await Promise.all([
    supabase.from("avaliacoes_nutricionais").select("*").eq("usuario_id", user.id).order("criado_em", { ascending: false }),
    supabase.from("registros_peso").select("*").eq("usuario_id", user.id).order("data", { ascending: false }).limit(20),
    supabase.from("registros_exercicio").select("*").eq("usuario_id", user.id).order("data", { ascending: false }).limit(20),
  ]);

  const eventos: EventoHistorico[] = [
    ...((avaliacoes ?? []) as AvaliacaoNutricional[]).map((a) => ({
      data: a.criado_em,
      titulo: "Consulta nutricional realizada",
      descricao: `IMC ${a.imc} (${a.classificacao_imc}) · Meta calórica ${a.meta_calorica} kcal`,
      icone: Stethoscope,
    })),
    ...((pesos ?? []) as RegistroPeso[]).map((p) => ({
      data: p.data,
      titulo: "Peso registrado",
      descricao: `${p.peso_kg} kg${p.observacoes ? ` — ${p.observacoes}` : ""}`,
      icone: Scale,
    })),
    ...((exercicios ?? []) as RegistroExercicio[]).map((ex) => ({
      data: ex.data,
      titulo: "Exercício registrado",
      descricao: `${ex.tipo} · ${ex.duracao_min} min · intensidade ${ex.intensidade}`,
      icone: Dumbbell,
    })),
  ].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Histórico</h1>
        <p className="mt-1 text-sm text-muted">Linha do tempo completa da sua jornada no Nutri em Casa.</p>
      </div>

      {eventos.length === 0 ? (
        <EmptyState
          icone={History}
          titulo="Ainda não há histórico"
          descricao="À medida que você usa o app, seus eventos importantes aparecerão aqui."
        />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border">
            {eventos.map((evento, i) => (
              <div key={i} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                  <evento.icone className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{evento.titulo}</p>
                  <p className="text-xs text-muted">{evento.descricao}</p>
                  <p className="mt-0.5 text-xs text-muted">{formatarData(evento.data, "dd/MM/yyyy 'às' HH:mm")}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
