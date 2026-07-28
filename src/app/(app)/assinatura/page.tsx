"use client";

import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { useUser } from "@/hooks/useUser";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/ui/Toast";
import { PLANOS, formatarPreco } from "@/lib/subscriptions/plans";
import { temAcessoPremium, diasRestantesTrial } from "@/lib/subscriptions/access";

export default function AssinaturaPage() {
  const { assinatura } = useUser();
  const [carregando, setCarregando] = useState<"premium" | "anual" | null>(null);

  const premiumAtivo = assinatura ? temAcessoPremium(assinatura) : false;
  const diasTrial = assinatura ? diasRestantesTrial(assinatura) : 0;

  async function assinar(plano: "premium" | "anual") {
    setCarregando(plano);
    try {
      const resposta = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plano }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro ?? "Erro ao iniciar checkout.");

      if (dados.urlRedirecionamento) {
        window.location.href = dados.urlRedirecionamento;
      } else {
        toast.info("Checkout iniciado. Verifique seu e-mail para concluir o pagamento.");
      }
    } catch (erro) {
      toast.erro(erro instanceof Error ? erro.message : "Erro ao iniciar assinatura.");
    } finally {
      setCarregando(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-foreground">Assinatura</h1>
        <p className="mt-1 text-sm text-muted">
          {premiumAtivo
            ? assinatura?.plano === "trial"
              ? `Você está no trial Premium — ${diasTrial} dia(s) restante(s).`
              : "Você já é Premium. Aproveite todos os recursos!"
            : "Desbloqueie planos ilimitados e a biblioteca completa de receitas."}
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        {(["gratuito", "premium", "anual"] as const).map((id) => {
          const plano = PLANOS[id];
          const destaque = id === "anual";
          const ehPlanoAtual = assinatura?.plano === id || (id === "gratuito" && !premiumAtivo);

          return (
            <Card key={id} className={destaque ? "border-brand-500 shadow-md" : ""}>
              <CardContent className="p-6">
                {destaque && (
                  <Badge tom="accent" className="mb-3">
                    <Sparkles className="mr-1 inline h-3 w-3" /> Melhor custo-benefício
                  </Badge>
                )}
                <h3 className="text-lg font-semibold text-foreground">{plano.nome}</h3>
                <p className="mt-1 text-sm text-muted">{plano.descricao}</p>
                <p className="mt-4 text-3xl font-bold text-foreground">
                  {formatarPreco(plano.precoMensalCentavos)}
                  <span className="text-sm font-normal text-muted">/mês</span>
                </p>

                <ul className="mt-5 space-y-2 text-sm text-foreground">
                  {Object.entries(plano.funcionalidades)
                    .filter(([, v]) => v === true)
                    .map(([chave]) => (
                      <li key={chave} className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-brand-500" /> {traduzir(chave)}
                      </li>
                    ))}
                </ul>

                {id === "gratuito" ? (
                  <Button variante="secundaria" className="mt-6 w-full" disabled>
                    {ehPlanoAtual ? "Plano atual" : "Grátis"}
                  </Button>
                ) : (
                  <Button
                    className="mt-6 w-full"
                    disabled={ehPlanoAtual && premiumAtivo}
                    carregando={carregando === id}
                    onClick={() => assinar(id)}
                  >
                    {ehPlanoAtual && premiumAtivo ? "Plano atual" : "Assinar"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="mt-6 text-center text-xs text-muted">
        Pagamentos processados com segurança. Cancele quando quiser, sem multas.
      </p>
    </div>
  );
}

function traduzir(chave: string): string {
  const nomes: Record<string, string> = {
    consultaIA: "Consulta nutricional com IA",
    planosAlimentaresIlimitados: "Planos alimentares ilimitados",
    bibliotecaReceitasCompleta: "Biblioteca de receitas completa",
    listaComprasAutomatica: "Lista de compras automática",
    acompanhamentoAvancado: "Acompanhamento avançado",
    exportarRelatorios: "Exportar relatórios",
  };
  return nomes[chave] ?? chave;
}
