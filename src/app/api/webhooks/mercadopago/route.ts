import { NextResponse } from "next/server";
import { mercadoPagoAdapter } from "@/lib/payments/mercadoPagoAdapter";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * O Mercado Pago envia apenas o tipo + id do recurso alterado; aqui
 * consultamos a API para confirmar o status antes de gravar no banco,
 * evitando confiar cegamente no payload do webhook.
 */
export async function POST(request: Request) {
  const corpo = await request.text();
  const evento = await mercadoPagoAdapter.interpretarWebhook(corpo, request.headers);
  if (!evento) return NextResponse.json({ recebido: true });

  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const resposta = await fetch(`https://api.mercadopago.com/preapproval/${evento.idExterno}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resposta.ok) return NextResponse.json({ recebido: true });

  const detalhes = await resposta.json();
  const supabase = createServiceRoleClient();

  if (detalhes.status === "authorized") {
    await supabase.from("assinaturas").insert({
      usuario_id: detalhes.external_reference,
      plano: "premium",
      status: "ativa",
      provedor: "mercadopago",
      id_externo: evento.idExterno,
    });
  } else if (detalhes.status === "cancelled") {
    await supabase
      .from("assinaturas")
      .update({ status: "cancelada", cancelada_em: new Date().toISOString() })
      .eq("id_externo", evento.idExterno);
  }

  return NextResponse.json({ recebido: true });
}
