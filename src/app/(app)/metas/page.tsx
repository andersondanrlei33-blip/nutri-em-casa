"use client";

import { useState } from "react";
import { Plus, Target, Pencil, Trash2, CheckCircle2, Circle } from "lucide-react";
import { useUser } from "@/hooks/useUser";
import { useSupabaseTable } from "@/hooks/useSupabaseTable";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { toast } from "@/components/ui/Toast";
import type { Meta } from "@/types/domain";

const TIPOS = [
  { valor: "peso", label: "Peso" },
  { valor: "medida", label: "Medida corporal" },
  { valor: "agua", label: "Hidratação" },
  { valor: "habito", label: "Hábito" },
  { valor: "personalizada", label: "Personalizada" },
];

export default function MetasPage() {
  const { user } = useUser();
  const { itens, carregando, criar, atualizar, excluir } = useSupabaseTable<Meta>("metas", user?.id, {
    ordenarPor: "criado_em",
  });
  const [modalAberto, setModalAberto] = useState<Meta | "novo" | null>(null);

  async function aoSalvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const dados = {
      tipo: form.get("tipo") as Meta["tipo"],
      titulo: form.get("titulo") as string,
      valor_alvo: form.get("valor_alvo") ? Number(form.get("valor_alvo")) : null,
      valor_atual: form.get("valor_atual") ? Number(form.get("valor_atual")) : null,
      unidade: (form.get("unidade") as string) || null,
      prazo: (form.get("prazo") as string) || null,
    };

    const resultado =
      modalAberto !== "novo" && modalAberto ? await atualizar(modalAberto.id, dados) : await criar(dados);
    if (resultado.error) return toast.erro("Erro ao salvar meta.");
    toast.sucesso("Meta salva com sucesso.");
    setModalAberto(null);
  }

  async function alternarConcluida(meta: Meta) {
    const { error } = await atualizar(meta.id, { concluida: !meta.concluida });
    if (error) toast.erro("Erro ao atualizar meta.");
  }

  async function aoExcluir(id: string) {
    const { error } = await excluir(id);
    if (error) return toast.erro("Erro ao excluir meta.");
    toast.sucesso("Meta removida.");
  }

  if (carregando) return <div className="py-20 text-center text-sm text-muted">Carregando metas...</div>;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Metas</h1>
          <p className="mt-1 text-sm text-muted">Defina e acompanhe seus objetivos.</p>
        </div>
        <Button onClick={() => setModalAberto("novo")}>
          <Plus className="h-4 w-4" /> Nova meta
        </Button>
      </div>

      {itens.length === 0 ? (
        <EmptyState
          icone={Target}
          titulo="Nenhuma meta definida"
          descricao="Crie metas de peso, medidas, hidratação ou hábitos para se manter motivado."
        />
      ) : (
        <ul className="space-y-3">
          {itens.map((meta) => (
            <li key={meta.id} className="group rounded-xl border border-border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => alternarConcluida(meta)} className="mt-0.5 shrink-0 text-brand-500">
                  {meta.concluida ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5 text-muted" />}
                </button>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${meta.concluida ? "text-muted line-through" : "text-foreground"}`}>
                    {meta.titulo}
                  </p>
                  {meta.valor_alvo != null && (
                    <>
                      <p className="mt-1 text-xs text-muted">
                        {meta.valor_atual ?? 0} / {meta.valor_alvo} {meta.unidade}
                      </p>
                      <div className="mt-2">
                        <ProgressBar valor={meta.valor_atual ?? 0} max={meta.valor_alvo} />
                      </div>
                    </>
                  )}
                  {meta.prazo && <p className="mt-1 text-xs text-muted">Prazo: {meta.prazo}</p>}
                </div>
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button onClick={() => setModalAberto(meta)} className="rounded-lg p-2 text-muted hover:bg-black/5">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => aoExcluir(meta.id)} className="rounded-lg p-2 text-muted hover:bg-red-50 hover:text-danger-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modalAberto && (
        <Modal aberto aoFechar={() => setModalAberto(null)} titulo={modalAberto === "novo" ? "Nova meta" : "Editar meta"}>
          <form onSubmit={aoSalvar} className="space-y-4" key={modalAberto === "novo" ? "novo" : modalAberto.id}>
            <div>
              <Label htmlFor="titulo">Título</Label>
              <Input id="titulo" name="titulo" required defaultValue={modalAberto !== "novo" ? modalAberto.titulo : ""} placeholder="Ex: Chegar aos 70kg" />
            </div>
            <div>
              <Label htmlFor="tipo">Tipo</Label>
              <Select id="tipo" name="tipo" defaultValue={modalAberto !== "novo" ? modalAberto.tipo : "personalizada"}>
                {TIPOS.map((t) => (
                  <option key={t.valor} value={t.valor}>{t.label}</option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="valor_atual">Atual</Label>
                <Input id="valor_atual" name="valor_atual" type="number" step="0.1" defaultValue={modalAberto !== "novo" ? modalAberto.valor_atual ?? "" : ""} />
              </div>
              <div>
                <Label htmlFor="valor_alvo">Alvo</Label>
                <Input id="valor_alvo" name="valor_alvo" type="number" step="0.1" defaultValue={modalAberto !== "novo" ? modalAberto.valor_alvo ?? "" : ""} />
              </div>
              <div>
                <Label htmlFor="unidade">Unidade</Label>
                <Input id="unidade" name="unidade" placeholder="kg, L..." defaultValue={modalAberto !== "novo" ? modalAberto.unidade ?? "" : ""} />
              </div>
            </div>
            <div>
              <Label htmlFor="prazo">Prazo</Label>
              <Input id="prazo" name="prazo" type="date" defaultValue={modalAberto !== "novo" ? modalAberto.prazo ?? "" : ""} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variante="secundaria" onClick={() => setModalAberto(null)}>
                Cancelar
              </Button>
              <Button type="submit">Salvar</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
