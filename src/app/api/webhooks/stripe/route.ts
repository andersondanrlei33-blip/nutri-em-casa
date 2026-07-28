import { NextResponse } from "next/server";
import { stripeAdapter } from "@/lib/payments/stripeAdapter";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const corpo = await request.text();

  let evento;
  try {
    evento = await stripeAdapter.interpretarWebhook(corpo, request.headers);
  } catch (erro) {
    console.error("Falha ao validar webhook do Stripe:", erro);
    return NextResponse.json({ erro: "Assinatura inválida." }, { status: 400 });
  }

  if (!evento) return NextResponse.json({ recebido: true });

  const supabase = createServiceRoleClient();

  switch (evento.tipo) {
    case "assinatura_ativada": {
      if (evento.usuarioId) {
        await supabase.from("assinaturas").insert({
          usuario_id: evento.usuarioId,
          plano: evento.plano ?? "premium",
          status: "ativa",
          provedor: "stripe",
          id_externo: evento.idExterno,
        });
      }
      break;
    }
    case "assinatura_cancelada": {
      await supabase
        .from("assinaturas")
        .update({ status: "cancelada", cancelada_em: new Date().toISOString() })
        .eq("id_externo", evento.idExterno);
      break;
    }
    case "pagamento_falhou": {
      await supabase.from("assinaturas").update({ status: "inadimplente" }).eq("id_externo", evento.idExterno);
      break;
    }
    case "assinatura_renovada": {
      await supabase
        .from("assinaturas")
        .update({ status: "ativa", renovacao_em: new Date().toISOString() })
        .eq("id_externo", evento.idExterno);
      break;
    }
  }

  return NextResponse.json({ recebido: true });
}
