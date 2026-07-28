import { Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { estimarProgressoMeta } from "@/lib/nutrition/metaProgresso";

interface CardMetaPesoProps {
  pesoAtual: number | null;
  pesoMeta: number | null;
  pesoInicial: number | null;
  diasDecorridos: number;
}

export function CardMetaPeso({ pesoAtual, pesoMeta, pesoInicial, diasDecorridos }: CardMetaPesoProps) {
  if (pesoAtual == null || pesoMeta == null || pesoInicial == null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Meta de peso</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted">
            Defina um peso desejado numa consulta (Consulta Nutricional → Peso desejado) para acompanhar seu progresso
            até a meta aqui.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { faltamKg, precisaPerder, direcaoCorreta, semanasEstimadas } = estimarProgressoMeta({
    pesoAtual,
    pesoMeta,
    pesoInicial,
    diasDecorridos,
  });

  const progressoTotal = Math.abs(pesoInicial - pesoMeta);
  const progressoFeito = Math.max(0, progressoTotal - faltamKg);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Meta de peso</CardTitle>
      </CardHeader>
      <CardContent>
        {faltamKg === 0 ? (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-500/10 text-success-500">
              <Target className="h-5 w-5" />
            </div>
            <p className="text-sm text-foreground">
              Parabéns, você bateu sua meta de {pesoMeta}kg! Se quiser, defina uma nova meta na próxima consulta.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <p className="text-sm text-muted">
                Faltam <span className="text-base font-semibold text-foreground">{faltamKg}kg</span> para{" "}
                {pesoMeta}kg
              </p>
              <p className="text-xs text-muted">
                {pesoAtual}kg → {pesoMeta}kg
              </p>
            </div>
            {progressoTotal > 0 && (
              <div className="mt-3">
                <ProgressBar valor={progressoFeito} max={progressoTotal} />
              </div>
            )}
            <p className="mt-3 text-sm text-foreground">
              {direcaoCorreta && semanasEstimadas != null
                ? `No ritmo atual, você deve chegar lá em cerca de ${semanasEstimadas} semana${semanasEstimadas === 1 ? "" : "s"}.`
                : direcaoCorreta
                  ? "Continue registrando seu peso para vermos uma estimativa de prazo."
                  : `Seu peso está indo na direção contrária à meta (${precisaPerder ? "precisa perder" : "precisa ganhar"} peso). Vale revisar isso numa consulta de retorno.`}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
