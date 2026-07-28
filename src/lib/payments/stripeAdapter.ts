import Stripe from "stripe";
import type {
  ProvedorPagamentoAdapter,
  IniciarCheckoutParams,
  ResultadoCheckout,
  EventoWebhookPagamento,
} from "./types";

const PRICE_IDS: Record<"premium" | "anual", string | undefined> = {
  premium: process.env.STRIPE_PRICE_PREMIUM_MENSAL,
  anual: process.env.STRIPE_PRICE_PREMIUM_ANUAL,
};

function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error(
      "STRIPE_SECRET_KEY não configurada. Defina-a em .env.local para ativar pagamentos via Stripe."
    );
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

export const stripeAdapter: ProvedorPagamentoAdapter = {
  nome: "stripe",

  async iniciarCheckout(params: IniciarCheckoutParams): Promise<ResultadoCheckout> {
    const stripe = getStripe();
    const priceId = PRICE_IDS[params.plano];
    if (!priceId) {
      throw new Error(`Price ID do Stripe não configurado para o plano "${params.plano}".`);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: params.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: params.urlSucesso,
      cancel_url: params.urlCancelamento,
      client_reference_id: params.usuarioId,
      metadata: { usuarioId: params.usuarioId, plano: params.plano },
    });

    return { urlRedirecionamento: session.url, idExterno: session.id };
  },

  async cancelarAssinatura(idExterno: string): Promise<void> {
    const stripe = getStripe();
    await stripe.subscriptions.cancel(idExterno);
  },

  async interpretarWebhook(corpoBruto: string, headers: Headers): Promise<EventoWebhookPagamento | null> {
    const stripe = getStripe();
    const assinatura = headers.get("stripe-signature");
    const segredo = process.env.STRIPE_WEBHOOK_SECRET;
    if (!assinatura || !segredo) return null;

    const evento = stripe.webhooks.constructEvent(corpoBruto, assinatura, segredo);

    switch (evento.type) {
      case "checkout.session.completed": {
        const session = evento.data.object as Stripe.Checkout.Session;
        return {
          tipo: "assinatura_ativada",
          idExterno: String(session.subscription ?? session.id),
          usuarioId: session.client_reference_id ?? session.metadata?.usuarioId ?? null,
          plano: (session.metadata?.plano as EventoWebhookPagamento["plano"]) ?? "premium",
          dataEvento: new Date().toISOString(),
        };
      }
      case "invoice.paid": {
        const invoice = evento.data.object as Stripe.Invoice;
        return {
          tipo: "assinatura_renovada",
          idExterno: String(invoice.subscription ?? invoice.id),
          usuarioId: null,
          plano: null,
          dataEvento: new Date().toISOString(),
        };
      }
      case "customer.subscription.deleted": {
        const sub = evento.data.object as Stripe.Subscription;
        return {
          tipo: "assinatura_cancelada",
          idExterno: sub.id,
          usuarioId: null,
          plano: null,
          dataEvento: new Date().toISOString(),
        };
      }
      case "invoice.payment_failed": {
        const invoice = evento.data.object as Stripe.Invoice;
        return {
          tipo: "pagamento_falhou",
          idExterno: String(invoice.subscription ?? invoice.id),
          usuarioId: null,
          plano: null,
          dataEvento: new Date().toISOString(),
        };
      }
      default:
        return null;
    }
  },
};
