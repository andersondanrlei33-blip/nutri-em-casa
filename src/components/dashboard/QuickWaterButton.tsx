"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/ui/Toast";
import { hojeISO } from "@/lib/utils/date";

/**
 * Botão rápido "+250ml" — registra um copo de água sem precisar ir até a
 * tela de Acompanhamento. Insere em registros_agua e recarrega a página pra
 * atualizar o StatCard de "Água hoje".
 */
export function QuickWaterButton({ usuarioId }: { usuarioId: string }) {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);

  async function registrar() {
    setCarregando(true);
    const supabase = createClient();
    const { error } = await supabase.from("registros_agua").insert({
      usuario_id: usuarioId,
      data: hojeISO(),
      quantidade_ml: 250,
    });
    setCarregando(false);
    if (error) return toast.erro("Erro ao registrar água.");
    router.refresh();
  }

  return (
    <button
      onClick={registrar}
      disabled={carregando}
      className="flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100 disabled:opacity-50"
    >
      <Plus className="h-3.5 w-3.5" />
      250ml
    </button>
  );
}
