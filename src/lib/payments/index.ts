import type { ProvedorPagamento } from "@/types/domain";
import type { ProvedorPagamentoAdapter } from "./types";
import { stripeAdapter } from "./stripeAdapter";
import { mercadoPagoAdapter } from "./mercadoPagoAdapter";
import { asaasAdapter } from "./asaasAdapter";
import { hotmartAdapter } from "./hotmartAdapter";
import { kiwifyAdapter } from "./kiwifyAdapter";
import { caktoAdapter } from "./caktoAdapter";

const ADAPTERS: Record<ProvedorPagamento, ProvedorPagamentoAdapter> = {
  stripe: stripeAdapter,
  mercadopago: mercadoPagoAdapter,
  asaas: asaasAdapter,
  hotmart: hotmartAdapter,
  kiwify: kiwifyAdapter,
  cakto: caktoAdapter,
};

/**
 * Ponto único de acesso aos gateways de pagamento. Trocar o provedor
 * padrão da aplicação é uma mudança de UMA linha (env var), sem tocar
 * em nenhuma rota ou componente.
 */
export function getProvedorPagamento(
  nome: ProvedorPagamento = (process.env.PAYMENT_PROVIDER as ProvedorPagamento) || "stripe"
): ProvedorPagamentoAdapter {
  const adapter = ADAPTERS[nome];
  if (!adapter) throw new Error(`Provedor de pagamento desconhecido: ${nome}`);
  return adapter;
}

export type { ProvedorPagamentoAdapter } from "./types";
export * from "./types";
