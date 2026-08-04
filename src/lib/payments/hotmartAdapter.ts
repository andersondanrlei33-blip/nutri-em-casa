import type {
  ProvedorPagamentoAdapter,
  IniciarCheckoutParams,
  ResultadoCheckout,
  EventoWebhookPagamento,
} from "./types";

/**
 * Adapter para Hotmart. Diferente do Stripe/Mercado Pago, a Hotmart não
 * expõe uma API de criação de checkout por chamada — o checkout é um link
 * fixo do produto configurado no painel da Hotmart. Este adapter apenas
 * redireciona para esse link (com o e-mail e referência do usuário como
 * query params, que a Hotmart repassa no webhook) e faz a validação do
 * HOTTOK no evento recebido.
 * Documentação: https://developers.hotmart.com
 */
const CHECKOUT_URLS: Record<"premium" | "anual", string | undefined> = {
  premium: process.env.HOTMART_CHECKOUT_URL_PREMIUM,
  anual: process.env.HOTMART_CHECKOUT_URL_ANUAL,
};

export const hotmartAdapter: ProvedorPagamentoAdapter = {
  nome: "hotmart",

  async iniciarCheckout(params: IniciarCheckoutParams): Promise<ResultadoCheckout> {
    const base = CHECKOUT_URLS[params.plano];
    if (!base) {
      throw new Error(`Checkout da Hotmart não configurado para o plano "${params.plano}".`);
    }
    const url = new URL(base);
    url.searchParams.set("email", params.email);
    url.searchParams.set("src", params.usuarioId); // repassado no webhook como "src"

    return { urlRedirecionamento: url.toString(), idExterno: params.usuarioId };
  },

  async cancelarAssinatura(): Promise<void> {
    // Cancelamentos na Hotmart são feitos pelo comprador na área de membros
    // ou via API de assinaturas com token de Client Credentials — a
    // implementação completa depende do fluxo comercial escolhido.
    throw new Error(
      "Cancelamento via Hotmart deve ser feito pela área de membros do comprador ou pela API de assinaturas da Hotmart."
    );
  },

  async interpretarWebhook(corpoBruto: string, headers: Headers): Promise<EventoWebhookPagamento | null> {
    const hottok = headers.get("x-hotmart-hottok");
    if (!hottok || hottok !== process.env.HOTMART_HOTTOK) return null;

    const payload = JSON.parse(corpoBruto);
    const evento = payload.event as string | undefined;

    const mapa: Record<string, EventoWebhookPagamento["tipo"]> = {
      PURCHASE_APPROVED: "assinatura_ativada",
      PURCHASE_COMPLETE: "assinatura_ativada",
      SUBSCRIPTION_CANCELLATION: "assinatura_cancelada",
      PURCHASE_REFUNDED: "assinatura_cancelada",
      PURCHASE_DELAYED: "pagamento_falhou",
    };

    if (evento && mapa[evento]) {
      return {
        tipo: mapa[evento],
        idExterno: payload.data?.purchase?.transaction ?? "",
        usuarioId: payload.data?.purchase?.src ?? null,
        email: payload.data?.buyer?.email ?? null,
        plano: null,
        dataEvento: new Date().toISOString(),
      };
    }
    return null;
  },
};
