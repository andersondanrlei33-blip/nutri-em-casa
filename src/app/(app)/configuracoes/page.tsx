"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/hooks/useUser";
import { createClient, sairComForca } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { formatarData } from "@/lib/utils/date";
import type { PlanoAlimentar } from "@/types/domain";

export default function ConfiguracoesPage() {
  const { user } = useUser();
  const supabase = createClient();

  const [planos, setPlanos] = useState<PlanoAlimentar[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ativandoId, setAtivandoId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("planos_alimentares")
      .select("*")
      .eq("usuario_id", user.id)
      .order("criado_em", { ascending: false })
      .then(({ data }) => {
        setPlanos((data ?? []) as PlanoAlimentar[]);
        setCarregando(false);
      });
  }, [user]);

  async function ativarPlano(id: string) {
    if (!user || ativandoId) return; // evita clique duplo enquanto já está ativando um plano
    setAtivandoId(id);
    try {
      const { error: erroDesativar } = await supabase
        .from("planos_alimentares")
        .update({ ativo: false })
        .eq("usuario_id", user.id);
      if (erroDesativar) return toast.erro("Erro ao ativar plano.");

      const { error } = await supabase.from("planos_alimentares").update({ ativo: true }).eq("id", id);
      if (error) return toast.erro("Erro ao ativar plano.");

      setPlanos((prev) => prev.map((p) => ({ ...p, ativo: p.id === id })));
      toast.sucesso("Plano alimentar ativado.");
    } catch {
      toast.erro("Erro ao ativar plano.");
    } finally {
      setAtivandoId(null);
    }
  }

  async function sairDeTodosDispositivos() {
    await sairComForca({ escopo: "global" });
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="mt-1 text-sm text-muted">Gerencie seus planos alimentares e sua conta.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Meus planos alimentares</CardTitle>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <p className="text-sm text-muted">Carregando...</p>
          ) : planos.length === 0 ? (
            <p className="text-sm text-muted">Nenhum plano alimentar criado ainda.</p>
          ) : (
            <ul className="space-y-2">
              {planos.map((plano) => (
                <li key={plano.id} className="flex items-center justify-between rounded-xl border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{plano.nome}</p>
                    <p className="text-xs text-muted">Criado em {formatarData(plano.criado_em)}</p>
                  </div>
                  {plano.ativo ? (
                    <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-medium text-brand-700">Ativo</span>
                  ) : (
                    <Button
                      variante="secundaria"
                      tamanho="sm"
                      carregando={ativandoId === plano.id}
                      disabled={ativandoId !== null && ativandoId !== plano.id}
                      onClick={() => ativarPlano(plano.id)}
                    >
                      Ativar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Segurança</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variante="secundaria" onClick={sairDeTodosDispositivos}>
            Sair de todos os dispositivos
          </Button>
        </CardContent>
      </Card>

      <Card className="border-danger-500/30">
        <CardHeader>
          <CardTitle className="text-danger-500">Zona de risco</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted">
            Para excluir sua conta e todos os seus dados permanentemente, entre em contato com o
            suporte. Essa ação não pode ser desfeita.
          </p>
          <Button variante="perigo" disabled>
            Excluir minha conta
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
