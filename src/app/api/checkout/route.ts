import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProvedorPagamento } from "@/lib/payments";

const CorpoSchema = z.object({
  plano: z.enum(["premium", "anual"]),
});

/**
 * Inicia o checkout no gateway de pagamento configurado (PAYMENT_PROVIDER,
 * padrão "stripe") e devolve a URL de redirecionamento. Trocar de gateway
 * é uma mudança de variável de ambiente — nenhuma rota muda.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }

  const parse = CorpoSchema.safeParse(await request.json());
  if (!parse.success) {
    return NextResponse.json({ erro: "Plano inválido." }, { status: 400 });
  }

  const origin = new URL(request.url).origin;

  try {
    const provedor = getProvedorPagamento();
    const resultado = await provedor.iniciarCheckout({
      usuarioId: user.id,
      email: user.email,
      plano: parse.data.plano,
      urlSucesso: `${origin}/assinatura?status=sucesso`,
      urlCancelamento: `${origin}/assinatura?status=cancelado`,
    });

    return NextResponse.json(resultado);
  } catch (erro) {
    console.error("Erro ao iniciar checkout:", erro);
    return NextResponse.json(
      { erro: erro instanceof Error ? erro.message : "Erro ao iniciar checkout." },
      { status: 500 }
    );
  }
}
