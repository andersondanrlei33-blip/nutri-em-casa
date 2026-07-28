"use client";

import { useState } from "react";
import { Plus, Pencil, Copy, Trash2 } from "lucide-react";
import { useSupabaseTable } from "@/hooks/useSupabaseTable";
import { useUser } from "@/hooks/useUser";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toast";
import { formatarData, hojeISO } from "@/lib/utils/date";
import { LucideIcon } from "lucide-react";

export interface CampoConfig {
  chave: string;
  label: string;
  tipo: "number" | "text" | "select" | "date";
  opcoes?: { valor: string; label: string }[];
  passo?: string;
  min?: number;
  max?: number;
  obrigatorio?: boolean;
  sufixo?: string;
}

interface TrackerSectionProps {
  tabela: string;
  icone: LucideIcon;
  tituloVazio: string;
  descricaoVazia: string;
  campos: CampoConfig[];
  renderResumo: (item: Record<string, unknown>) => string;
}

interface RegistroGenerico {
  id: string;
  data: string;
  [chave: string]: unknown;
}

export function TrackerSection({ tabela, icone: Icone, tituloVazio, descricaoVazia, campos, renderResumo }: TrackerSectionProps) {
  const { user } = useUser();
  const { itens, carregando, criar, atualizar, excluir, duplicar } = useSupabaseTable<RegistroGenerico>(
    tabela,
    user?.id
  );
  const [modalAberto, setModalAberto] = useState<RegistroGenerico | "novo" | null>(null);

  function valoresIniciais(): Record<string, unknown> {
    if (modalAberto && modalAberto !== "novo") return modalAberto;
    const base: Record<string, unknown> = { data: hojeISO() };
    campos.forEach((c) => (base[c.chave] = c.tipo === "number" ? "" : ""));
    return base;
  }

  async function aoSalvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const registro: Record<string, unknown> = { data: form.get("data") as string };
    for (const campo of campos) {
      const valorBruto = form.get(campo.chave) as string;
      registro[campo.chave] = campo.tipo === "number" ? (valorBruto ? Number(valorBruto) : null) : valorBruto || null;
    }

    const resultado =
      modalAberto !== "novo" && modalAberto
        ? await atualizar(modalAberto.id, registro as never)
        : await criar(registro as never);

    if (resultado.error) return toast.erro("Erro ao salvar registro.");
    toast.sucesso("Registro salvo com sucesso.");
    setModalAberto(null);
  }

  async function aoExcluir(id: string) {
    const { error } = await excluir(id);
    if (error) return toast.erro("Erro ao excluir registro.");
    toast.sucesso("Registro removido.");
  }

  async function aoDuplicar(id: string) {
    const { error } = await duplicar(id);
    if (error) return toast.erro("Erro ao duplicar registro.");
    toast.sucesso("Registro duplicado para hoje. Ajuste a data se necessário.");
  }

  if (carregando) return <div className="py-10 text-center text-sm text-muted">Carregando...</div>;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setModalAberto("novo")}>
          <Plus className="h-4 w-4" /> Novo registro
        </Button>
      </div>

      {itens.length === 0 ? (
        <EmptyState icone={Icone} titulo={tituloVazio} descricao={descricaoVazia} />
      ) : (
        <ul className="space-y-2">
          {itens.map((item) => (
            <li key={item.id} className="group flex items-center justify-between rounded-xl border border-border bg-white p-4">
              <div>
                <p className="text-sm font-medium text-foreground">{renderResumo(item)}</p>
                <p className="text-xs text-muted">{formatarData(item.data)}</p>
              </div>
              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button onClick={() => setModalAberto(item)} className="rounded-lg p-2 text-muted hover:bg-black/5 hover:text-foreground">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => aoDuplicar(item.id)} className="rounded-lg p-2 text-muted hover:bg-black/5 hover:text-foreground">
                  <Copy className="h-4 w-4" />
                </button>
                <button onClick={() => aoExcluir(item.id)} className="rounded-lg p-2 text-muted hover:bg-red-50 hover:text-danger-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modalAberto && (
        <Modal aberto aoFechar={() => setModalAberto(null)} titulo={modalAberto === "novo" ? "Novo registro" : "Editar registro"}>
          <form onSubmit={aoSalvar} className="space-y-4" key={modalAberto === "novo" ? "novo" : modalAberto.id}>
            <div>
              <Label htmlFor="data">Data</Label>
              <Input id="data" name="data" type="date" required defaultValue={(valoresIniciais().data as string) ?? hojeISO()} />
            </div>
            {campos.map((campo) => (
              <div key={campo.chave}>
                <Label htmlFor={campo.chave}>
                  {campo.label} {campo.sufixo && <span className="text-muted">({campo.sufixo})</span>}
                </Label>
                {campo.tipo === "select" ? (
                  <Select id={campo.chave} name={campo.chave} required={campo.obrigatorio} defaultValue={(valoresIniciais()[campo.chave] as string) ?? ""}>
                    <option value="" disabled>Selecione...</option>
                    {campo.opcoes?.map((op) => (
                      <option key={op.valor} value={op.valor}>{op.label}</option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    id={campo.chave}
                    name={campo.chave}
                    type={campo.tipo}
                    step={campo.passo}
                    min={campo.min}
                    max={campo.max}
                    required={campo.obrigatorio}
                    defaultValue={(valoresIniciais()[campo.chave] as string) ?? ""}
                  />
                )}
              </div>
            ))}
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
