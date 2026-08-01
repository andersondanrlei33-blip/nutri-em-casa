import { formatarData } from "@/lib/utils/date";
import type { AvaliacaoNutricional } from "@/types/domain";

/** Linha do tempo com os números principais de TODAS as consultas do
 *  paciente, mais recente primeiro — pensada pra nutricionista bater o olho
 *  e ver a trajetória inteira sem precisar abrir cada consulta no Histórico.
 *  Mostra gordura/massa magra só quando o laudo daquela consulta trouxe o
 *  dado (nem toda consulta tem avaliação física anexada). */
export function TimelineConsultas({ avaliacoes }: { avaliacoes: AvaliacaoNutricional[] }) {
  const ordenadas = [...avaliacoes].reverse();

  return (
    <div className="space-y-2">
      {ordenadas.map((a, i) => {
        const laudo = a.avaliacao_fisica_dados;
        const rotulo = i === 0 ? "Mais recente" : i === ordenadas.length - 1 ? "1ª consulta" : "Retorno";

        return (
          <div
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/[0.02] px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{formatarData(a.criado_em)}</p>
              <p className="text-xs text-muted">
                {a.peso_kg}kg · IMC {a.imc}
                {laudo?.percentualGordura != null && ` · gordura ${laudo.percentualGordura}%`}
                {laudo?.massaMagraKg != null && ` · massa magra ${laudo.massaMagraKg}kg`}
              </p>
            </div>
            <span className={`text-xs ${i === 0 ? "text-brand-600" : "text-muted"}`}>{rotulo}</span>
          </div>
        );
      })}
    </div>
  );
}

