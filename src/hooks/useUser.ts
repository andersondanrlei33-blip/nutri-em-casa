"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient, comTimeout } from "@/lib/supabase/client";
import type { Assinatura, Perfil } from "@/types/domain";

interface EstadoUsuario {
  user: User | null;
  perfil: Perfil | null;
  assinatura: Assinatura | null;
  carregando: boolean;
}

/** Hook central: usuário autenticado + perfil + assinatura, com listener de auth. */
export function useUser(): EstadoUsuario {
  const [estado, setEstado] = useState<EstadoUsuario>({
    user: null,
    perfil: null,
    assinatura: null,
    carregando: true,
  });

  useEffect(() => {
    const supabase = createClient();
    let ativo = true;

    async function carregar() {
      try {
        const {
          data: { user },
        } = await comTimeout(supabase.auth.getUser());

        if (!user) {
          if (ativo) setEstado({ user: null, perfil: null, assinatura: null, carregando: false });
          return;
        }

        const [{ data: perfil }, { data: assinatura }] = await Promise.all([
          supabase.from("perfis").select("*").eq("id", user.id).single(),
          supabase
            .from("assinaturas")
            .select("*")
            .eq("usuario_id", user.id)
            .order("criado_em", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        if (ativo) {
          setEstado({
            user,
            perfil: perfil as Perfil | null,
            assinatura: assinatura as Assinatura | null,
            carregando: false,
          });
        }
      } catch {
        // getUser() travou/expirou (ex: rede instável) — não deixa a Topbar/
        // Sidebar presas num "carregando" eterno; trata como deslogado, o
        // middleware cuida de redirecionar se a rota exigir autenticação.
        if (ativo) setEstado({ user: null, perfil: null, assinatura: null, carregando: false });
      }
    }

    carregar();

    const { data: listener } = supabase.auth.onAuthStateChange(() => carregar());
    return () => {
      ativo = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return estado;
}
