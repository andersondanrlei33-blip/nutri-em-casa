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

/**
 * Cria a conta quando o comprador ainda não tem uma no Nutri em Casa.
 *
 * Isso acontece quando o produto é vendido como order bump de outro app
 * (ex.: Saladas no Pote) — a pessoa nunca passou pelo /cadastro daqui.
 * Sem isso, o pagamento ficava "perdido": a Cakto confirmava a compra,
 * mas não havia usuário pra vincular a assinatura, e ninguém recebia
 * acesso.
 *
 * O trigger `on_auth_user_created` (supabase/migrations/0001_init.sql) cria
 * o `perfil` e uma assinatura trial automaticamente assim que a conta é
 * criada — a gente só precisa criar o usuário no auth e mandar o convite
 * por e-mail (mesmo padrão já usado no Saladas no Pote e no Renda no
 * Pote). O link do convite leva pra /definir-senha, onde a pessoa escolhe
 * a senha e cai direto no /dashboard.
 */
async function resolverOuCriarUsuarioId(
  supabase: ReturnType<typeof createServiceRoleClient>,
  email: string | null
): Promise<string | null> {
  const existente = await resolverUsuarioIdPorEmail(supabase, email);
  if (existente) return existente;
  if (!email) return null;

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/definir-senha`,
  });

  if (error) {
    // Corrida rara (dois webhooks quase simultâneos já criaram a conta) —
    // tenta resolver de novo por e-mail antes de desistir.
    if (/already/i.test(error.message)) {
      return resolverUsuarioIdPorEmail(supabase, email);
    }
    console.error("Falha ao criar conta a partir do webhook da Cakto:", error);
    return null;
  }

  return data.user?.id ?? null;
}

export async function POST(request: Request) {
  const corpo = await request.text();

  const evento = await caktoAdapter.interpretarWebhook(corpo, request.headers);
  if (!evento) return NextResponse.json({ recebido: true });

  const supabase = createServiceRoleClient();
  const usuarioId = evento.usuarioId ?? (await resolverOuCriarUsuarioId(supabase, evento.email));

  if (!usuarioId) {
    // Sem e-mail no evento (não deveria acontecer) ou falha ao criar a
    // conta — só loga pra investigação manual; não falha a requisição (a
    // Cakto reenviaria o mesmo evento à toa).
    console.warn("Webhook da Cakto recebido sem usuário correspondente:", evento);
    return NextResponse.json({ recebido: true });
  }

  switch (evento.tipo) {
    case "assinatura_ativada": {
      // Upsert manual por usuario_id (em vez de só INSERT, como Stripe e
      // Mercado Pago fazem): a Cakto pode reenviar "purchase_approved" em
      // renovações, e sem isso cada reenvio criaria uma linha duplicada em
      // `assinaturas` pra quem já tem assinatura ativa. Também cobre o
      // caso de conta recém-criada acima: o trigger já inseriu uma linha
      // trial, e aqui ela é promovida pra ativa/cakto em vez de duplicar.
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
