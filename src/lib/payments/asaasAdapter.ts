import type {
  ProvedorPagamentoAdapter,
  IniciarCheckoutParams,
  ResultadoCheckout,
  EventoWebhookPagamento,
} from "./types";

const VALORES_CENTAVOS: Record<"premium" | "anual", number> = {
  premium: 2990,
  anual: 23880,
};

/**
 * Adapter para Asaas (cobranças recorrentes via link de pagamento).
 * Requer ASAAS_API_KEY. Documentação: https://docs.asaas.com
 */
export const asaasAdapter: ProvedorPagamentoAdapter = {
  nome: "asaas",

  async iniciarCheckout(params: IniciarCheckoutParams): Promise<ResultadoCheckout> {
    const apiKey = process.env.ASAAS_API_KEY;
    if (!apiKey) {
      throw new Error("ASAAS_API_KEY não configurada. Defina em .env.local para ativar o Asaas.");
    }
    const baseUrl = process.env.ASAAS_BASE_URL ?? "https://api.asaas.com/v3";

    const resposta = await fetch(`${baseUrl}/paymentLinks`, {
      method: "POST",
      headers: { access_token: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Nutri em Casa — ${params.plano === "anual" ? "Plano Anual" : "Plano Premium"}`,
        billingType: "UNDEFINED",
        chargeType: "RECURRENT",
        value: VALORES_CENTAVOS[params.plano] / 100,
        subscriptionCycle: params.plano === "anual" ? "YEARLY" : "MONTHLY",
        externalReference: params.usuarioId,
      }),
    });

    if (!resposta.ok) {
      throw new Error(`Erro ao criar link de pagamento no Asaas: ${resposta.status}`);
    }

    const dados = await resposta.json();
    return { urlRedirecionamento: dados.url ?? null, idExterno: dados.id };
  },

  async cancelarAssinatura(idExterno: string): Promise<void> {
    const apiKey = process.env.ASAAS_API_KEY;
    const baseUrl = process.env.ASAAS_BASE_URL ?? "https://api.asaas.com/v3";
    await fetch(`${baseUrl}/subscriptions/${idExterno}`, {
      method: "DELETE",
      headers: { access_token: apiKey ?? "" },
    });
  },

  async interpretarWebhook(corpoBruto: string): Promise<EventoWebhookPagamento | null> {
    const payload = JSON.parse(corpoBruto);
    const evento = payload.event as string | undefined;

    const mapa: Record<string, EventoWebhookPagamento["tipo"]> = {
      PAYMENT_CONFIRMED: "assinatura_ativada",
      PAYMENT_RECEIVED: "assinatura_renovada",
      SUBSCRIPTION_DELETED: "assinatura_cancelada",
      PAYMENT_OVERDUE: "pagamento_falhou",
    };

    if (evento && mapa[evento]) {
      return {
        tipo: mapa[evento],
        idExterno: payload.payment?.subscription ?? payload.payment?.id ?? "",
        usuarioId: payload.payment?.externalReference ?? null,
        plano: null,
        dataEvento: new Date().toISOString(),
      };
    }
    return null;
  },
};
