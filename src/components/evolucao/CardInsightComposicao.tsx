import { MessageCircle } from "lucide-react";
import type { TendenciaComposicaoCorporal } from "@/lib/nutrition/composicaoTrend";

const CORES_TENDENCIA: Record<TendenciaComposicaoCorporal, { bg: string; icone: string }> = {
  favoravel: { bg: "bg-success-500/10", icone: "text-success-500" },
  estavel: { bg: "bg-black/[0.04]", icone: "text-muted" },
  atencao: { bg: "bg-brand-100", icone: "text-brand-600" },
};

/** Recado acolhedor sobre a tendência de composição corporal do paciente ao
 *  longo de todas as consultas — ver gerarInsightComposicaoCorporal em
 *  lib/nutrition/composicaoTrend.ts. Fica logo no topo da página de
 *  Evolução, antes dos cartões de número, pra dar à nutricionista uma
 *  leitura rápida da trajetória antes de entrar nos detalhes. */
export function CardInsightComposicao({
  texto,
  tendencia,
}: {
  texto: string;
  tendencia: TendenciaComposicaoCorporal;
}) {
  const cor = CORES_TENDENCIA[tendencia];

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-white px-4 py-4 sm:px-5">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${cor.bg}`}>
        <MessageCircle className={`h-4 w-4 ${cor.icone}`} />
      </div>
      <p className="text-sm leading-relaxed text-foreground">{texto}</p>
    </div>
  );
}

