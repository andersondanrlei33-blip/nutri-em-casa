import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets, images, the PWA
     * manifest/service worker and API routes (webhooks e outras rotas de
     * API fazem sua própria validação — ex.: secret do webhook da Cakto —
     * e não devem passar pelo middleware de sessão do Supabase, que
     * redireciona requisições não autenticadas para /login e quebra
     * qualquer POST de webhook externo).
     */
    "/((?!api/|_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)",
  ],
};
