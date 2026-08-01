import { ProgressBar } from "@/components/ui/ProgressBar";

interface ItemConsistencia {
  label: string;
  valorExibido: string;
  percentual: number;
  corClasse?: string;
}

interface ConsistenciaSemanaProps {
  diasComAgua: number;
  diasComMetaAguaBatida: number;
  mediaSono: number | null;
  mediaHumor: number | null;
  totalDias: number;
}

/** Meta de referência usada só pra desenhar a barra (não é meta clínica —
 *  a meta clínica real de sono/água já vem de outro lugar). */
const REFERENCIA_SONO_H = 8;
const REFERENCIA_HUMOR = 5;

export function ConsistenciaSemana({
  diasComAgua,
  diasComMetaAguaBatida,
  mediaSono,
  mediaHumor,
  totalDias,
}: ConsistenciaSemanaProps) {
  const itens: ItemConsistencia[] = [
    {
      label: "Dias com água registrada",
      valorExibido: `${diasComAgua}/${totalDias}`,
      percentual: totalDias > 0 ? (diasComAgua / totalDias) * 100 : 0,
    },
    {
      label: "Dias com meta de água batida",
      valorExibido: `${diasComMetaAguaBatida}/${totalDias}`,
      percentual: totalDias > 0 ? (diasComMetaAguaBatida / totalDias) * 100 : 0,
    },
    {
      label: "Sono médio",
      valorExibido: mediaSono != null ? `${mediaSono.toFixed(1)}h` : "Sem registros",
      percentual: mediaSono != null ? (mediaSono / REFERENCIA_SONO_H) * 100 : 0,
      corClasse: "bg-brand-400",
    },
    {
      label: "Humor médio",
      valorExibido: mediaHumor != null ? `${mediaHumor.toFixed(1)}/5` : "Sem registros",
      percentual: mediaHumor != null ? (mediaHumor / REFERENCIA_HUMOR) * 100 : 0,
      corClasse: "bg-brand-400",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {itens.map((item) => (
        <div key={item.label}>
          <div className="mb-1.5 flex items-baseline justify-between">
            <p className="text-xs text-muted">{item.label}</p>
            <p className="text-sm font-semibold text-foreground">{item.valorExibido}</p>
          </div>
          <ProgressBar valor={item.percentual} max={100} corClasse={item.corClasse} />
        </div>
      ))}
    </div>
  );
}
