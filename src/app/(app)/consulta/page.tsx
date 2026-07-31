import { ConsultaWizard } from "@/components/consulta/ConsultaWizard";
import { createClient } from "@/lib/supabase/server";
import type { AvaliacaoNutricional } from "@/types/domain";

export default async function ConsultaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let avaliacaoAnterior: AvaliacaoNutricional | null = null;
  if (user) {
    const { data } = await supabase
      .from("avaliacoes_nutricionais")
      .select("*")
      .eq("usuario_id", user.id)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    avaliacaoAnterior = data as AvaliacaoNutricional | null;
  }

  const retorno = Boolean(avaliacaoAnterior);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          {retorno ? "Consulta de Retorno" : "Consulta Nutricional"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {retorno
            ? "Vamos atualizar seus dados e reajustar seu plano com base no seu progresso desde a última consulta."
            : "Responda com atenção — essas informações são a base do seu plano alimentar personalizado."}
        </p>
      </div>
      <ConsultaWizard avaliacaoAnterior={avaliacaoAnterior} />
    </div>
  );
}
