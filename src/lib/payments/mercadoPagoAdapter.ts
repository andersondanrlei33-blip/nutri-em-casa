import type {
  ProvedorPagamentoAdapter,
  IniciarCheckoutParams,
  ResultadoCheckout,
  EventoWebhookPagamento,
} from "./types";

const PLAN_IDS: Record<"premium" | "anual", string | undefined> = {
  premium: process.env.MERCADOPAGO_PLAN_PREMIUM,
  anual: process.env.MERCADOPAGO_PLAN_ANUAL,
};

/**
 * Adapter para Mercado Pago (assinaturas via "preapproval"). Requer
 * MERCADOPAGO_ACCESS_TOKEN e os IDs de plano configurados no painel do
 * Mercado Pago. Documentação: https://www.mercadopago.com.br/developers
 */
export const mercadoPagoAdapter: ProvedorPagamentoAdapter = {
  nome: "mercadopago",

  async iniciarCheckout(params: IniciarCheckoutParams): Promise<ResultadoCheckout> {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) {
      throw new Error(
        "MERCADOPAGO_ACCESS_TOKEN não configurado. Defina em .env.local para ativar o Mercado Pago."
      );
    }
    const planId = PLAN_IDS[params.plano];
    if (!planId) {
      throw new Error(`Plano do Mercado Pago não configurado para "${params.plano}".`);
    }

    const resposta = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        preapproval_plan_id: planId,
        payer_email: params.email,
        external_reference: params.usuarioId,
        back_url: params.urlSucesso,
      }),
    });

    if (!resposta.ok) {
      throw new Error(`Erro ao criar assinatura no Mercado Pago: ${resposta.status}`);
    }

    const dados = await resposta.json();
    return {
      urlRedirecionamento: dados.init_point ?? null,
      idExterno: dados.id,
    };
  },

  async cancelarAssinatura(idExterno: string): Promise<void> {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    await fetch(`https://api.mercadopago.com/preapproval/${idExterno}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "cancelled" }),
    });
  },

  async interpretarWebhook(corpoBruto: string): Promise<EventoWebhookPagamento | null> {
    // Mercado Pago envia notificações leves (tipo + id) e espera que a
    // aplicação consulte a API para obter o status completo. Aqui fazemos
    // o parse do payload; a consulta detalhada acontece na rota do webhook.
    const payload = JSON.parse(corpoBruto);
    const tipo = payload.type ?? payload.topic;

    if (tipo === "preapproval") {
      return {
        tipo: "assinatura_ativada",
        idExterno: payload.data?.id ?? payload.id,
        usuarioId: null,
        plano: null,
        dataEvento: new Date().toISOString(),
      };
    }
    return null;
  },
};
