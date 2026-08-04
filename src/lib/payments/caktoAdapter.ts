import type {
  ProvedorPagamentoAdapter,
  IniciarCheckoutParams,
  ResultadoCheckout,
  EventoWebhookPagamento,
} from "./types";

/**
 * Adapter para Cakto. Assim como a Hotmart, a Cakto não expõe uma API de
 * criação de checkout por chamada — o checkout é um link fixo do produto,
 * configurado no painel da Cakto (aba "Links" do produto). Este adapter
 * redireciona pra esse link com o e-mail do usuário como query param (pra
 * prefill do checkout) e valida o campo "secret" enviado no corpo do
 * webhook.
 *
 * Formato confirmado do webhook (tela de criação de webhook da própria
 * Cakto — o mesmo formato já usado em produção no app Saladas no Pote):
 *   { "secret": "...", "event": "purchase_approved",
 *     "data": { "id", "refId", "customer": { "name", "email", "phone" },
 *               "baseAmount", "status": "paid", ... } }
 *
 * Diferença importante em relação à Hotmart: a Cakto NÃO faz passthrough
 * de um identificador nosso (usuarioId) no link de checkout hospedado —
 * por isso a resolução do usuário no webhook é feita por e-mail (ver
 * EventoWebhookPagamento.email e a rota /api/webhooks/cakto, que consulta
 * a tabela `perfis`), não por idExterno.
 *
 * Nomes de evento de renovação/cancelamento de assinatura ainda não foram
 * confirmados na documentação pública da Cakto — os regexes abaixo cobrem
 * as variações mais prováveis (pt/en) e devem ser ajustados depois de
 * observar o `raw_payload` de um evento real usando o botão "Testar" do
 * webhook no painel da Cakto.
 */
const CHECKOUT_URLS: Record<"premium" | "anual", string | undefined> = {
  premium: process.env.CAKTO_CHECKOUT_URL_PREMIUM,
  anual: process.env.CAKTO_CHECKOUT_URL_ANUAL,
};

function primeiroValor(obj: unknown, caminhos: string[]): string | null {
  for (const caminho of caminhos) {
    let atual: unknown = obj;
    for (const chave of caminho.split(".")) {
      if (atual && typeof atual === "object" && chave in (atual as Record<string, unknown>)) {
        atual = (atual as Record<string, unknown>)[chave];
      } else {
        atual = undefined;
        break;
      }
    }
    if (typeof atual === "string" && atual.trim() !== "") return atual;
    if (typeof atual === "number") return String(atual);
  }
  return null;
}

export const caktoAdapter: ProvedorPagamentoAdapter = {
  nome: "cakto",

  async iniciarCheckout(params: IniciarCheckoutParams): Promise<ResultadoCheckout> {
    const base = CHECKOUT_URLS[params.plano];
    if (!base) {
      throw new Error(`Checkout da Cakto não configurado para o plano "${params.plano}".`);
    }
    const url = new URL(base);
    url.searchParams.set("email", params.email);

    return { urlRedirecionamento: url.toString(), idExterno: params.usuarioId };
  },

  async cancelarAssinatura(): Promise<void> {
    // Cancelamentos na Cakto são feitos pelo comprador na área de membros
    // ou solicitados via suporte — não há API pública de cancelamento
    // self-service documentada até o momento.
    throw new Error(
      "Cancelamento via Cakto deve ser feito pela área de membros do comprador ou pelo suporte da Cakto."
    );
  },

  async interpretarWebhook(corpoBruto: string, _headers: Headers): Promise<EventoWebhookPagamento | null> {
    let payload: unknown;
    try {
      payload = JSON.parse(corpoBruto);
    } catch {
      return null;
    }

    const secretEsperado = process.env.CAKTO_WEBHOOK_SECRET;
    const secretRecebido = primeiroValor(payload, ["secret"]);
    if (!secretEsperado || secretRecebido !== secretEsperado) return null;

    const evento = primeiroValor(payload, ["event", "evento", "data.status", "status"]);
    if (!evento) return null;

    const email = primeiroValor(payload, [
      "data.customer.email",
      "customer.email",
      "data.email",
      "email",
    ]);
    const idExterno =
      primeiroValor(payload, ["data.subscriptionId", "data.refId", "data.id", "id"]) ?? "";

    let tipo: EventoWebhookPagamento["tipo"] | null = null;
    if (/renov|renew/i.test(evento)) tipo = "assinatura_renovada";
    else if (/cancel|reembols|refund|chargeback|estorn/i.test(evento)) tipo = "assinatura_cancelada";
    else if (/recus|failed|falh|atras|overdue/i.test(evento)) tipo = "pagamento_falhou";
    else if (/aprovad|approved|paid|pago/i.test(evento)) tipo = "assinatura_ativada";

    if (!tipo) return null;

    return {
      tipo,
      idExterno,
      usuarioId: null,
      email,
      plano: null,
      dataEvento: new Date().toISOString(),
    };
  },
};
