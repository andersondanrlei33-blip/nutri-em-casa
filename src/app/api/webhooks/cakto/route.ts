import { NextResponse } from "next/server";
import { caktoAdapter } from "@/lib/payments/caktoAdapter";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * A Cakto não faz passthrough de um identificador nosso no checkout
 * hospedado (diferente do Mercado Pago/Stripe), então o evento chega só
 * com o e-mail do comprador — aqui a gente resolve o usuario_id
 * consultando a tabela `perfis` por e-mail antes de gravar/atualizar a
 * assinatura. Ver comentário completo em lib/payments/caktoAdapter.ts.
 */
async function resolverUsuarioIdPorEmail(
  supabase: ReturnType<typeof createServiceRoleClient>,
  email: string | null
): Promise<string | null> {
  if (!email) return null;
  const { data } = await supabase.from("perfis").select("id").eq("email", email).maybeSingle();
  return data?.id ?? null;
}

export async function POST(request: Request) {
  const corpo = await request.text();

  const evento = await caktoAdapter.interpretarWebhook(corpo, request.headers);
  if (!evento) return NextResponse.json({ recebido: true });

  const supabase = createServiceRoleClient();
  const usuarioId = evento.usuarioId ?? (await resolverUsuarioIdPorEmail(supabase, evento.email));

  if (!usuarioId) {
    // Sem e-mail correspondente a um perfil cadastrado — não há como
    // vincular o pagamento a uma conta. Só loga pra investigação manual;
    // não falha a requisição (a Cakto reenviaria o mesmo evento à toa).
    console.warn("Webhook da Cakto recebido sem usuário correspondente:", evento);
    return NextResponse.json({ recebido: true });
  }

  switch (evento.tipo) {
    case "assinatura_ativada": {
      // Upsert manual por usuario_id (em vez de só INSERT, como Stripe e
      // Mercado Pago fazem): a Cakto pode reenviar "purchase_approved" em
      // renovações, e sem isso cada reenvio criaria uma linha duplicada em
      // `assinaturas` pra quem já tem assinatura ativa.
      const { data: existente } = await supabase
        .from("assinaturas")
        .select("id")
        .eq("usuario_id", usuarioId)
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existente) {
        await supabase
          .from("assinaturas")
          .update({
            status: "ativa",
            provedor: "cakto",
            id_externo: evento.idExterno,
            renovacao_em: new Date().toISOString(),
          })
          .eq("id", existente.id);
      } else {
        await supabase.from("assinaturas").insert({
          usuario_id: usuarioId,
          plano: evento.plano ?? "premium",
          status: "ativa",
          provedor: "cakto",
          id_externo: evento.idExterno,
        });
      }
      break;
    }
    case "assinatura_renovada": {
      await supabase
        .from("assinaturas")
        .update({ status: "ativa", renovacao_em: new Date().toISOString() })
        .eq("usuario_id", usuarioId);
      break;
    }
    case "assinatura_cancelada": {
      await supabase
        .from("assinaturas")
        .update({ status: "cancelada", cancelada_em: new Date().toISOString() })
        .eq("usuario_id", usuarioId);
      break;
    }
    case "pagamento_falhou": {
      await supabase.from("assinaturas").update({ status: "inadimplente" }).eq("usuario_id", usuarioId);
      break;
    }
  }

  return NextResponse.json({ recebido: true });
}
