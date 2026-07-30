"use client";

import { useState } from "react";
import { Scale, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { hojeISO } from "@/lib/utils/date";

/**
 * Botão + modal simples pra registrar o peso do dia direto do Dashboard,
 * sem precisar ir até Acompanhamento. Insere em registros_peso e recarrega
 * a página (o gráfico de evolução e o StatCard de peso são recalculados a
 * partir dos dados novos, sem lógica duplicada aqui).
 */
export function QuickWeightModal({ usuarioId }: { usuarioId: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [peso, setPeso] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function salvar() {
    const pesoNumero = parseFloat(peso.replace(",", "."));
    if (!pesoNumero || pesoNumero <= 0) return toast.erro("Informe um peso válido.");
    setCarregando(true);
    const supabase = createClient();
    const { error } = await supabase.from("registros_peso").insert({
      usuario_id: usuarioId,
      data: hojeISO(),
      peso_kg: pesoNumero,
    });
    setCarregando(false);
    if (error) return toast.erro("Erro ao registrar peso.");
    setAberto(false);
    setPeso("");
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setAberto(true)}>
        <Scale className="mr-1.5 h-4 w-4" />
        Registrar peso
      </Button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-card p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">Registrar peso de hoje</h3>
              <button onClick={() => setAberto(false)} className="text-muted hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              placeholder="Ex: 78,5"
              value={peso}
              onChange={(e) => setPeso(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand-500"
            />
            <p className="mt-1 text-xs text-muted">Peso em kg</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variante="secundaria" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
              <Button onClick={salvar} disabled={carregando}>
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
