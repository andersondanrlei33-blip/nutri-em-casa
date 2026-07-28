"use client";

import { useState } from "react";
import { Scale, Ruler, Droplets, Moon, Smile, Dumbbell } from "lucide-react";
import { TrackerSection, type CampoConfig } from "@/components/tracking/TrackerSection";

const ABAS = [
  { id: "peso", label: "Peso", icone: Scale },
  { id: "medidas", label: "Medidas", icone: Ruler },
  { id: "agua", label: "Água", icone: Droplets },
  { id: "sono", label: "Sono", icone: Moon },
  { id: "humor", label: "Humor", icone: Smile },
  { id: "exercicio", label: "Exercícios", icone: Dumbbell },
] as const;

type AbaId = (typeof ABAS)[number]["id"];

const CAMPOS_PESO: CampoConfig[] = [
  { chave: "peso_kg", label: "Peso", tipo: "number", passo: "0.1", min: 1, obrigatorio: true, sufixo: "kg" },
  { chave: "observacoes", label: "Observações", tipo: "text" },
];

const CAMPOS_MEDIDAS: CampoConfig[] = [
  { chave: "cintura_cm", label: "Cintura", tipo: "number", passo: "0.1", sufixo: "cm" },
  { chave: "quadril_cm", label: "Quadril", tipo: "number", passo: "0.1", sufixo: "cm" },
  { chave: "peito_cm", label: "Peito", tipo: "number", passo: "0.1", sufixo: "cm" },
  { chave: "braco_cm", label: "Braço", tipo: "number", passo: "0.1", sufixo: "cm" },
  { chave: "coxa_cm", label: "Coxa", tipo: "number", passo: "0.1", sufixo: "cm" },
  { chave: "pescoco_cm", label: "Pescoço", tipo: "number", passo: "0.1", sufixo: "cm" },
  { chave: "percentual_gordura", label: "% de gordura", tipo: "number", passo: "0.1", sufixo: "%" },
];

const CAMPOS_AGUA: CampoConfig[] = [
  { chave: "quantidade_ml", label: "Quantidade", tipo: "number", min: 1, obrigatorio: true, sufixo: "ml" },
];

const CAMPOS_SONO: CampoConfig[] = [
  { chave: "horas", label: "Horas dormidas", tipo: "number", passo: "0.5", min: 0, max: 24, obrigatorio: true },
  {
    chave: "qualidade",
    label: "Qualidade do sono",
    tipo: "select",
    obrigatorio: true,
    opcoes: [1, 2, 3, 4, 5].map((n) => ({ valor: String(n), label: `${n}` })),
  },
];

const CAMPOS_HUMOR: CampoConfig[] = [
  {
    chave: "humor",
    label: "Humor",
    tipo: "select",
    obrigatorio: true,
    opcoes: [1, 2, 3, 4, 5].map((n) => ({ valor: String(n), label: `${n}` })),
  },
  {
    chave: "energia",
    label: "Energia",
    tipo: "select",
    obrigatorio: true,
    opcoes: [1, 2, 3, 4, 5].map((n) => ({ valor: String(n), label: `${n}` })),
  },
  { chave: "observacoes", label: "Observações", tipo: "text" },
];

const CAMPOS_EXERCICIO: CampoConfig[] = [
  { chave: "tipo", label: "Tipo de exercício", tipo: "text", obrigatorio: true },
  { chave: "duracao_min", label: "Duração", tipo: "number", min: 1, obrigatorio: true, sufixo: "min" },
  {
    chave: "intensidade",
    label: "Intensidade",
    tipo: "select",
    obrigatorio: true,
    opcoes: [
      { valor: "leve", label: "Leve" },
      { valor: "moderada", label: "Moderada" },
      { valor: "intensa", label: "Intensa" },
    ],
  },
  { chave: "calorias_estimadas", label: "Calorias estimadas", tipo: "number", sufixo: "kcal" },
  { chave: "observacoes", label: "Observações", tipo: "text" },
];

export default function AcompanhamentoPage() {
  const [abaAtiva, setAbaAtiva] = useState<AbaId>("peso");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Acompanhamento</h1>
        <p className="mt-1 text-sm text-muted">Registre seu progresso diário em todas as frentes.</p>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-black/[0.03] p-1">
        {ABAS.map(({ id, label, icone: Icone }) => (
          <button
            key={id}
            onClick={() => setAbaAtiva(id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              abaAtiva === id ? "bg-white text-brand-700 shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            <Icone className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {abaAtiva === "peso" && (
        <TrackerSection
          tabela="registros_peso"
          icone={Scale}
          tituloVazio="Nenhum registro de peso"
          descricaoVazia="Registre seu peso regularmente para acompanhar sua evolução no dashboard."
          campos={CAMPOS_PESO}
          renderResumo={(item) => `${item.peso_kg} kg`}
        />
      )}
      {abaAtiva === "medidas" && (
        <TrackerSection
          tabela="registros_medidas"
          icone={Ruler}
          tituloVazio="Nenhuma medida registrada"
          descricaoVazia="Registre suas medidas corporais para acompanhar sua composição física ao longo do tempo."
          campos={CAMPOS_MEDIDAS}
          renderResumo={(item) =>
            [
              item.cintura_cm ? `Cintura ${item.cintura_cm}cm` : null,
              item.quadril_cm ? `Quadril ${item.quadril_cm}cm` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Medidas registradas"
          }
        />
      )}
      {abaAtiva === "agua" && (
        <TrackerSection
          tabela="registros_agua"
          icone={Droplets}
          tituloVazio="Nenhum registro de água hoje"
          descricaoVazia="Registre cada copo ou garrafa de água que você bebe ao longo do dia."
          campos={CAMPOS_AGUA}
          renderResumo={(item) => `${item.quantidade_ml} ml`}
        />
      )}
      {abaAtiva === "sono" && (
        <TrackerSection
          tabela="registros_sono"
          icone={Moon}
          tituloVazio="Nenhum registro de sono"
          descricaoVazia="Registre quantas horas você dormiu e a qualidade do seu sono."
          campos={CAMPOS_SONO}
          renderResumo={(item) => `${item.horas}h · qualidade ${item.qualidade}/5`}
        />
      )}
      {abaAtiva === "humor" && (
        <TrackerSection
          tabela="registros_humor"
          icone={Smile}
          tituloVazio="Nenhum registro de humor"
          descricaoVazia="Registre seu humor e energia diários — eles impactam diretamente seus resultados."
          campos={CAMPOS_HUMOR}
          renderResumo={(item) => `Humor ${item.humor}/5 · Energia ${item.energia}/5`}
        />
      )}
      {abaAtiva === "exercicio" && (
        <TrackerSection
          tabela="registros_exercicio"
          icone={Dumbbell}
          tituloVazio="Nenhum exercício registrado"
          descricaoVazia="Registre seus treinos e atividades físicas."
          campos={CAMPOS_EXERCICIO}
          renderResumo={(item) => `${item.tipo} · ${item.duracao_min}min`}
        />
      )}
    </div>
  );
}
