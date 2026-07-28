import { ConsultaWizard } from "@/components/consulta/ConsultaWizard";

export default function ConsultaPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Consulta Nutricional</h1>
        <p className="mt-1 text-sm text-muted">
          Responda com atenção — essas informações são a base do seu plano alimentar personalizado.
        </p>
      </div>
      <ConsultaWizard />
    </div>
  );
}
