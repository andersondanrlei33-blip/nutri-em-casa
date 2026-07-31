"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import type { RefeicaoPlano, Receita } from "@/types/domain";

export interface DadosFormularioRefeicao {
  nome_refeicao: string;
  horario: string;
  quantidade_porcoes: number;
  receita_id: string | null;
}

interface MealFormProps {
  aberto: boolean;
  aoFechar: () => void;
  aoSalvar: (dados: DadosFormularioRefeicao) => Promise<void>;
  refeicaoExistente?: RefeicaoPlano | null;
  receitas: Receita[];
}

export function MealForm({ aberto, aoFechar, aoSalvar, refeicaoExistente, receitas }: MealFormProps) {
  const [nome, setNome] = useState(refeicaoExistente?.nome_refeicao ?? "");
  const [horario, setHorario] = useState(refeicaoExistente?.horario?.slice(0, 5) ?? "12:00");
  const [porcoes, setPorcoes] = useState(refeicaoExistente?.quantidade_porcoes ?? 1);
  const [receitaId, setReceitaId] = useState<string>(refeicaoExistente?.receita_id ?? "");
  const [salvando, setSalvando] = useState(false);

  function aoEscolherReceita(id: string) {
    setReceitaId(id);
    const receita = receitas.find((r) => r.id === id);
    if (receita && !nome) setNome(receita.nome);
  }

  async function aoSubmeter(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    await aoSalvar({
      nome_refeicao: nome,
      horario,
      quantidade_porcoes: porcoes,
      receita_id: receitaId || null,
    });
    setSalvando(false);
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={refeicaoExistente ? "Editar refeição" : "Nova refeição"}>
      <form onSubmit={aoSubmeter} className="space-y-4">
        <div>
          <Label htmlFor="receita-vinculada">Vincular receita da biblioteca (opcional)</Label>
          <Select id="receita-vinculada" value={receitaId} onChange={(e) => aoEscolherReceita(e.target.value)}>
            <option value="">Nenhuma — refeição livre</option>
            {receitas.map((r) => (
              <option key={r.id} value={r.id}>{r.nome}</option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-muted">
            Vincular uma receita preenche automaticamente as calorias e os macros dessa refeição.
          </p>
        </div>
        <div>
          <Label htmlFor="nome-refeicao">Nome da refeição</Label>
          <Input
            id="nome-refeicao"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Frango grelhado com batata-doce"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="horario-refeicao">Horário</Label>
            <Input id="horario-refeicao" type="time" required value={horario} onChange={(e) => setHorario(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="porcoes-refeicao">Porções</Label>
            <Input
              id="porcoes-refeicao"
              type="number"
              min={0.5}
              step={0.5}
              required
              value={porcoes}
              onChange={(e) => setPorcoes(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variante="secundaria" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" carregando={salvando}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
