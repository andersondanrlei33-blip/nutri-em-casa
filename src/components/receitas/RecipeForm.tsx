"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import type { CategoriaReceita, IngredienteReceita, Receita } from "@/types/domain";

export interface DadosFormularioReceita {
  nome: string;
  descricao: string;
  categoria: CategoriaReceita;
  ingredientes: IngredienteReceita[];
  modo_preparo: string[];
  tempo_preparo_min: number;
  porcoes: number;
  calorias: number;
  proteina_g: number;
  carboidrato_g: number;
  gordura_g: number;
  fibra_g: number;
}

interface RecipeFormProps {
  aberto: boolean;
  aoFechar: () => void;
  aoSalvar: (dados: DadosFormularioReceita) => Promise<void>;
  receitaExistente?: Receita | null;
}

const CATEGORIAS: { valor: CategoriaReceita; label: string }[] = [
  { valor: "cafe_da_manha", label: "Café da manhã" },
  { valor: "almoco", label: "Almoço" },
  { valor: "jantar", label: "Jantar" },
  { valor: "lanche", label: "Lanche" },
  { valor: "sobremesa", label: "Sobremesa" },
  { valor: "pre_treino", label: "Pré-treino" },
  { valor: "pos_treino", label: "Pós-treino" },
  { valor: "complemento", label: "Complemento" },
];

export function RecipeForm({ aberto, aoFechar, aoSalvar, receitaExistente }: RecipeFormProps) {
  const [nome, setNome] = useState(receitaExistente?.nome ?? "");
  const [descricao, setDescricao] = useState(receitaExistente?.descricao ?? "");
  const [categoria, setCategoria] = useState<CategoriaReceita>(receitaExistente?.categoria ?? "almoco");
  const [ingredientes, setIngredientes] = useState<IngredienteReceita[]>(
    receitaExistente?.ingredientes ?? [{ nome: "", quantidade: 0, unidade: "g" }]
  );
  const [passos, setPassos] = useState<string[]>(receitaExistente?.modo_preparo ?? [""]);
  const [tempo, setTempo] = useState(receitaExistente?.tempo_preparo_min ?? 15);
  const [porcoes, setPorcoes] = useState(receitaExistente?.porcoes ?? 1);
  const [calorias, setCalorias] = useState(receitaExistente?.calorias ?? 0);
  const [proteina, setProteina] = useState(receitaExistente?.proteina_g ?? 0);
  const [carboidrato, setCarboidrato] = useState(receitaExistente?.carboidrato_g ?? 0);
  const [gordura, setGordura] = useState(receitaExistente?.gordura_g ?? 0);
  const [fibra, setFibra] = useState(receitaExistente?.fibra_g ?? 0);
  const [salvando, setSalvando] = useState(false);

  async function aoSubmeter(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    await aoSalvar({
      nome,
      descricao,
      categoria,
      ingredientes: ingredientes.filter((i) => i.nome.trim()),
      modo_preparo: passos.filter((p) => p.trim()),
      tempo_preparo_min: tempo,
      porcoes,
      calorias,
      proteina_g: proteina,
      carboidrato_g: carboidrato,
      gordura_g: gordura,
      fibra_g: fibra,
    });
    setSalvando(false);
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={receitaExistente ? "Editar receita" : "Nova receita"}>
      <form onSubmit={aoSubmeter} className="space-y-4">
        <div>
          <Label htmlFor="nome-receita">Nome</Label>
          <Input id="nome-receita" required value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="descricao-receita">Descrição</Label>
          <Textarea id="descricao-receita" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="categoria-receita">Categoria</Label>
            <Select id="categoria-receita" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaReceita)}>
              {CATEGORIAS.map((c) => (
                <option key={c.valor} value={c.valor}>{c.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="tempo-receita">Tempo de preparo (min)</Label>
            <Input id="tempo-receita" type="number" min={1} value={tempo} onChange={(e) => setTempo(Number(e.target.value))} />
          </div>
        </div>

        <div>
          <Label>Ingredientes</Label>
          <div className="space-y-2">
            {ingredientes.map((ing, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder="Ingrediente"
                  value={ing.nome}
                  onChange={(e) => {
                    const novos = [...ingredientes];
                    novos[i] = { ...novos[i], nome: e.target.value };
                    setIngredientes(novos);
                  }}
                />
                <Input
                  type="number"
                  placeholder="Qtd."
                  className="w-24"
                  value={ing.quantidade || ""}
                  onChange={(e) => {
                    const novos = [...ingredientes];
                    novos[i] = { ...novos[i], quantidade: Number(e.target.value) };
                    setIngredientes(novos);
                  }}
                />
                <Input
                  placeholder="Un."
                  className="w-20"
                  value={ing.unidade}
                  onChange={(e) => {
                    const novos = [...ingredientes];
                    novos[i] = { ...novos[i], unidade: e.target.value };
                    setIngredientes(novos);
                  }}
                />
                <button
                  type="button"
                  onClick={() => setIngredientes(ingredientes.filter((_, idx) => idx !== i))}
                  className="shrink-0 rounded-lg p-2 text-muted hover:bg-red-50 hover:text-danger-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setIngredientes([...ingredientes, { nome: "", quantidade: 0, unidade: "g" }])}
              className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar ingrediente
            </button>
          </div>
        </div>

        <div>
          <Label>Modo de preparo</Label>
          <div className="space-y-2">
            {passos.map((passo, i) => (
              <div key={i} className="flex gap-2">
                <span className="mt-2.5 text-xs font-medium text-muted">{i + 1}.</span>
                <Textarea
                  value={passo}
                  onChange={(e) => {
                    const novos = [...passos];
                    novos[i] = e.target.value;
                    setPassos(novos);
                  }}
                  className="min-h-[2.5rem]"
                />
                <button
                  type="button"
                  onClick={() => setPassos(passos.filter((_, idx) => idx !== i))}
                  className="shrink-0 rounded-lg p-2 text-muted hover:bg-red-50 hover:text-danger-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setPassos([...passos, ""])}
              className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar passo
            </button>
          </div>
        </div>

        <div>
          <Label>Informações nutricionais (por porção)</Label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <CampoNumerico label="Porções" valor={porcoes} aoMudar={setPorcoes} />
            <CampoNumerico label="Calorias" valor={calorias} aoMudar={setCalorias} />
            <CampoNumerico label="Proteína (g)" valor={proteina} aoMudar={setProteina} />
            <CampoNumerico label="Carbo (g)" valor={carboidrato} aoMudar={setCarboidrato} />
            <CampoNumerico label="Gordura (g)" valor={gordura} aoMudar={setGordura} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variante="secundaria" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" carregando={salvando}>
            Salvar receita
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CampoNumerico({ label, valor, aoMudar }: { label: string; valor: number; aoMudar: (v: number) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" min={0} value={valor} onChange={(e) => aoMudar(Number(e.target.value))} />
    </div>
  );
}

