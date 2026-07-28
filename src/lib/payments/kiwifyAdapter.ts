import type {
  ProvedorPagamentoAdapter,
  IniciarCheckoutParams,
  ResultadoCheckout,
  EventoWebhookPagamento,
} from "./types";

/**
 * Adapter para Kiwify — mesmo modelo de checkout hospedado da Hotmart.
 * Documentação: https://docs.kiwify.com.br
 */
const CHECKOUT_URLS: Record<"premium" | "anual", string | undefined> = {
  premium: process.env.KIWIFY_CHECKOUT_URL_PREMIUM,
  anual: process.env.KIWIFY_CHECKOUT_URL_ANUAL,
};

export const kiwifyAdapter: ProvedorPagamentoAdapter = {
  nome: "kiwify",

  async iniciarCheckout(params: IniciarCheckoutParams): Promise<ResultadoCheckout> {
    const base = CHECKOUT_URLS[params.plano];
    if (!base) {
      throw new Error(`Checkout da Kiwify não configurado para o plano "${params.plano}".`);
    }
    const url = new URL(base);
    url.searchParams.set("email", params.email);
    url.searchParams.set("ref", params.usuarioId);

    return { urlRedirecionamento: url.toString(), idExterno: params.usuarioId };
  },

  async cancelarAssinatura(): Promise<void> {
    throw new Error("Cancelamento via Kiwify deve ser feito pela área de membros do comprador.");
  },

  async interpretarWebhook(corpoBruto: string, headers: Headers): Promise<EventoWebhookPagamento | null> {
    const assinatura = headers.get("x-kiwify-signature");
    if (!assinatura || assinatura !== process.env.KIWIFY_WEBHOOK_TOKEN) return null;

    const payload = JSON.parse(corpoBruto);
    const status = payload.order_status as string | undefined;

    const mapa: Record<string, EventoWebhookPagamento["tipo"]> = {
      paid: "assinatura_ativada",
      subscription_renewed: "assinatura_renovada",
      subscription_canceled: "assinatura_cancelada",
      refused: "pagamento_falhou",
    };

    if (status && mapa[status]) {
      return {
        tipo: mapa[status],
        idExterno: payload.order_id ?? "",
        usuarioId: payload.ref ?? null,
        plano: null,
        dataEvento: new Date().toISOString(),
      };
    }
    return null;
  },
};
