import Link from "next/link";
import { ConsultaWizard } from "@/components/consulta/ConsultaWizard";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { UserRound, CalendarClock } from "lucide-react";
import { calcularProximaLiberacao, INTERVALO_MINIMO_ENTRE_CONSULTAS_DIAS } from "@/lib/utils/date";
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

  // Gênero e data de nascimento vêm do cadastro/"Meu Perfil" — não são mais
  // perguntados aqui (ver ConsultaWizard.tsx). Contas criadas antes dessa
  // mudança podem não ter esses dados ainda, então bloqueamos a consulta e
  // pedimos pra completar o perfil primeiro, em vez de deixar a consulta
  // prosseguir sem um dado que entra direto na fórmula de TMB/TDEE.
  const { data: perfil } = user
    ? await supabase.from("perfis").select("genero, data_nascimento").eq("id", user.id).maybeSingle()
    : { data: null };

  const perfilIncompleto = !perfil?.genero || !perfil?.data_nascimento;

  // Trava de intervalo mínimo entre consultas (mesma regra aplicada de
  // verdade em app/api/gerar-plano/route.ts) — aqui é só o bloqueio visual,
  // pra não deixar a pessoa preencher os 40 campos da anamnese pra depois
  // levar um erro ao finalizar. A data usada é sempre a da última consulta
  // já feita (avaliacaoAnterior), buscada acima.
  let proximaLiberacao: Date | null = null;
  if (avaliacaoAnterior) {
    const data = calcularProximaLiberacao(avaliacaoAnterior.criado_em);
    if (data.getTime() > Date.now()) {
      proximaLiberacao = data;
    }
  }

  if (perfilIncompleto) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <CardContent className="py-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100">
              <UserRound className="h-6 w-6 text-brand-600" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Complete seu perfil primeiro</h2>
            <p className="mt-2 text-sm text-muted">
              Precisamos do seu gênero e data de nascimento pra calcular sua consulta com segurança. Isso leva
              menos de um minuto.
            </p>
            <Link href="/perfil">
              <Button className="mt-6">Ir para Meu Perfil</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (proximaLiberacao) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <CardContent className="py-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100">
              <CalendarClock className="h-6 w-6 text-brand-600" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Sua próxima consulta ainda não foi liberada</h2>
            <p className="mt-2 text-sm text-muted">
              Pra acompanhar sua evolução com segurança, as consultas acontecem a cada{" "}
              {INTERVALO_MINIMO_ENTRE_CONSULTAS_DIAS} dias. Você poderá fazer sua próxima consulta a partir de{" "}
              <strong className="text-foreground">{proximaLiberacao.toLocaleDateString("pt-BR")}</strong>.
            </p>
            <Link href="/evolucao">
              <Button className="mt-6">Ver minha evolução</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
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
      <ConsultaWizard
        avaliacaoAnterior={avaliacaoAnterior}
        perfil={{ genero: perfil!.genero!, dataNascimento: perfil!.data_nascimento! }}
        usuarioId={user!.id}
      />
    </div>
  );
}
