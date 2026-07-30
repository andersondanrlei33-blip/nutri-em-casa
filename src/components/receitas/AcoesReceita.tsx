"use client";

import { useState } from "react";
import { Utensils, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { hojeISO, diaSemanaHoje } from "@/lib/utils/date";
import { montarRegistroConsumo } from "@/lib/nutrition/registrarConsumo";
import type { Receita, RefeicaoPlano } from "@/types/domain";

/**
 * Botão "Usar essa receita hoje" na tela de Receitas — deixa o paciente
 * registrar que comeu essa receita no lugar da sugerida pelo plano (sem
 * mudar o plano), ou trocar a receita sugerida daquele horário pra sempre.
 * Busca as refeições de hoje do plano ativo só quando o modal é aberto, pra
 * não pesar o carregamento da lista inteira de receitas.
 */
export function AcoesReceita({ receita, usuarioId }: { receita: Receita; usuarioId: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [refeicoesHoje, setRefeicoesHoje] = useState<RefeicaoPlano[] | null>(null);
  const [refeicaoEscolhidaId, setRefeicaoEscolhidaId] = useState("");

  async function abrir() {
    setAberto(true);
    if (refeicoesHoje !== null) return;
    const supabase = createClient();
    const { data: plano } = await supabase
      .from("planos_alimentares")
      .select("id")
      .eq("usuario_id", usuarioId)
      .eq("ativo", true)
      .maybeSingle();
    if (!plano) {
      setRefeicoesHoje([]);
      return;
    }
    const { data } = await supabase
      .from("refeicoes_plano")
      .select("*")
      .eq("plano_id", plano.id)
      .eq("dia_semana", diaSemanaHoje())
      .order("horario", { ascending: true });
    const lista = (data ?? []) as RefeicaoPlano[];
    setRefeicoesHoje(lista);
    if (lista.length > 0) setRefeicaoEscolhidaId(lista[0].id);
  }

  const refeicaoEscolhida = refeicoesHoje?.find((r) => r.id === refeicaoEscolhidaId) ?? null;

  async function registrarSoHoje() {
    if (!refeicaoEscolhida) return;
    setCarregando(true);
    const supabase = createClient();
    const { error } = await supabase.from("registros_consumo").upsert(
      {
        usuario_id: usuarioId,
        data: hojeISO(),
        refeicao_plano_id: refeicaoEscolhida.id,
        ...montarRegistroConsumo(receita, refeicaoEscolhida.quantidade_porcoes || 1),
      },
      { onConflict: "usuario_id,data,refeicao_plano_id" }
    );
    setCarregando(false);
    if (error) return toast.erro("Erro ao registrar consumo.");
    toast.sucesso("Registrado só para hoje.");
    setAberto(false);
    router.refresh();
  }

  async function trocarParaSempre() {
    if (!refeicaoEscolhida) return;
    setCarregando(true);
    const supabase = createClient();
    const { error: erroTroca } = await supabase
      .from("refeicoes_plano")
      .update({ receita_id: receita.id })
      .eq("id", refeicaoEscolhida.id);
    if (erroTroca) {
      setCarregando(false);
      return toast.erro("Erro ao trocar a refeição do plano.");
    }
    const { error: erroRegistro } = await supabase.from("registros_consumo").upsert(
      {
        usuario_id: usuarioId,
        data: hojeISO(),
        refeicao_plano_id: refeicaoEscolhida.id,
        ...montarRegistroConsumo(receita, refeicaoEscolhida.quantidade_porcoes || 1),
      },
      { onConflict: "usuario_id,data,refeicao_plano_id" }
    );
    setCarregando(false);
    if (erroRegistro) return toast.erro("Refeição trocada no plano, mas houve erro ao registrar hoje.");
    toast.sucesso("Refeição trocada no plano a partir de hoje.");
    setAberto(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={abrir}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border py-2 text-xs font-medium text-muted transition-colors hover:border-brand-300 hover:text-brand-700"
      >
        <Utensils className="h-3.5 w-3.5" />
        Usar essa receita hoje
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-card p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">Usar &quot;{receita.nome}&quot;</h3>
              <button onClick={() => setAberto(false)} className="text-muted hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            {refeicoesHoje === null ? (
              <p className="text-sm text-muted">Carregando refeições de hoje...</p>
            ) : refeicoesHoje.length === 0 ? (
              <p className="text-sm text-muted">Você não tem refeições cadastradas no plano de hoje.</p>
            ) : (
              <>
                <label className="mb-1.5 block text-xs font-medium text-muted">
                  No lugar de qual refeição de hoje?
                </label>
                <select
                  value={refeicaoEscolhidaId}
                  onChange={(e) => setRefeicaoEscolhidaId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-brand-500"
                >
                  {refeicoesHoje.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome_refeicao} · {r.horario.slice(0, 5)}
                    </option>
                  ))}
                </select>

                <div className="mt-5 flex flex-col gap-2">
                  <Button onClick={registrarSoHoje} disabled={carregando}>
                    Comi isso só hoje
                  </Button>
                  <Button variante="secundaria" onClick={trocarParaSempre} disabled={carregando}>
                    Trocar essa refeição pra sempre
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
