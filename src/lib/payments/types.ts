import type { PlanoAssinatura, ProvedorPagamento } from "@/types/domain";

export interface IniciarCheckoutParams {
  usuarioId: string;
  email: string;
  plano: Extract<PlanoAssinatura, "premium" | "anual">;
  urlSucesso: string;
  urlCancelamento: string;
}

export interface ResultadoCheckout {
  /** URL para redirecionar o usuário (checkout hospedado) ou null se o
   *  provedor devolve outro formato (ex: link de pagamento assíncrono). */
  urlRedirecionamento: string | null;
  idExterno: string;
}

export interface EventoWebhookPagamento {
  tipo: "assinatura_ativada" | "assinatura_renovada" | "assinatura_cancelada" | "pagamento_falhou";
  idExterno: string;
  usuarioId: string | null;
  plano: PlanoAssinatura | null;
  dataEvento: string;
}

/**
 * Contrato que qualquer gateway de pagamento deve implementar. Isola o
 * resto do app da API específica de cada provedor — trocar de gateway
 * significa apenas implementar esta interface e registrar o adapter em
 * lib/payments/index.ts, sem tocar em rotas, telas ou banco de dados.
 */
export interface ProvedorPagamentoAdapter {
  nome: ProvedorPagamento;
  iniciarCheckout(params: IniciarCheckoutParams): Promise<ResultadoCheckout>;
  cancelarAssinatura(idExterno: string): Promise<void>;
  /** Valida a assinatura/segredo do webhook e normaliza o payload. */
  interpretarWebhook(corpoBruto: string, headers: Headers): Promise<EventoWebhookPagamento | null>;
}
