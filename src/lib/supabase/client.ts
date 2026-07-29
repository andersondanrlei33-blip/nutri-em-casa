"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components.
 * Reads the public URL/anon key — safe to expose to the browser because
 * Row Level Security (see supabase/migrations) enforces all access control.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/** Apaga na força qualquer cookie de sessão do Supabase (prefixo "sb-").
 *  Existe porque em alguns casos supabase.auth.signOut() não termina de
 *  limpar a sessão local (trava, dá erro de rede, etc.) e o middleware
 *  continua vendo o cookie antigo como válido — o usuário parecia "preso"
 *  no app mesmo depois de clicar em Sair. Isso garante a limpeza mesmo
 *  quando signOut() falha silenciosamente. */
function limparCookiesDeSessao() {
  document.cookie.split(";").forEach((parte) => {
    const nome = parte.split("=")[0].trim();
    if (nome.startsWith("sb-")) {
      document.cookie = `${nome}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;`;
    }
  });
}

/**
 * Executa uma promise com um limite de tempo — evita que uma chamada de auth
 * (login, cadastro, buscar usuário) fique pendurada pra sempre em caso de
 * rede instável ou de um lock interno do supabase-js travado, como aconteceu
 * com o signOut() antes da correção. Se o tempo esgotar, rejeita com uma
 * mensagem amigável em vez de deixar o botão "carregando" para sempre.
 */
export function comTimeout<T>(promessa: Promise<T>, ms = 8000): Promise<T> {
  return Promise.race([
    promessa,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Tempo esgotado. Verifique sua conexão e tente novamente.")), ms)
    ),
  ]);
}

interface OpcoesSignOut {
  escopo?: "global" | "local" | "others";
}

/**
 * Sai da conta de forma robusta: tenta o signOut() normal (com limite de 3s,
 * já que ele pode ficar pendurado sem nunca resolver), e independentemente
 * do resultado, força a limpeza dos cookies de sessão antes de redirecionar.
 * Usa navegação "dura" (window.location.href) em vez de router.push pra
 * garantir que o middleware veja os cookies já limpos na próxima requisição.
 */
export async function sairComForca(opcoes: OpcoesSignOut = {}) {
  const supabase = createClient();
  try {
    await Promise.race([
      supabase.auth.signOut(opcoes.escopo ? { scope: opcoes.escopo } : undefined),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch {
    // Mesmo se signOut() der erro, ainda assim limpamos e redirecionamos.
  }
  limparCookiesDeSessao();
  window.location.href = "/login";
}
