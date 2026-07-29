/**
 * Smoke tests do motor de cálculo. Executar com:
 *   node --experimental-strip-types src/lib/nutrition/calculations.test.ts
 * (ou `npm test`, que roda o mesmo comando).
 *
 * Usa apenas node:assert para não depender de um test runner externo —
 * mantém a suíte executável mesmo antes de `npm install` terminar.
 */
import assert from "node:assert/strict";
import {
  calcularIMC,
  classificarIMC,
  calcularTMB,
  calcularTDEE,
  calcularMetaCalorica,
  calcularMacros,
  calcularAguaRecomendada,
  avaliarCondicoesSaude,
  avaliarSonoEEstresse,
  calcularRCQ,
  gerarResultadoAvaliacao,
} from "./calculations.ts";

let passed = 0;
function test(nome: string, fn: () => void) {
  fn();
  passed++;
  console.log(`✓ ${nome}`);
}

test("IMC de referência (70kg, 175cm) ≈ 22.9", () => {
  const imc = calcularIMC({ pesoKg: 70, alturaCm: 175, idade: 30, genero: "masculino" });
  assert.equal(imc, 22.9);
  assert.equal(classificarIMC(imc), "Peso normal");
});

test("Classificação de IMC nas faixas limite", () => {
  assert.equal(classificarIMC(17), "Abaixo do peso");
  assert.equal(classificarIMC(27), "Sobrepeso");
  assert.equal(classificarIMC(32), "Obesidade grau I");
  assert.equal(classificarIMC(42), "Obesidade grau III");
});

test("TMB Mifflin-St Jeor — homem 70kg/175cm/30 anos", () => {
  const tmb = calcularTMB({ pesoKg: 70, alturaCm: 175, idade: 30, genero: "masculino" });
  // 10*70 + 6.25*175 - 5*30 + 5 = 700 + 1093.75 - 150 + 5 = 1648.75 -> 1649
  assert.equal(tmb, 1649);
});

test("TMB Mifflin-St Jeor — mulher 60kg/165cm/28 anos", () => {
  const tmb = calcularTMB({ pesoKg: 60, alturaCm: 165, idade: 28, genero: "feminino" });
  // 10*60 + 6.25*165 - 5*28 - 161 = 600 + 1031.25 - 140 - 161 = 1330.25 -> 1330
  assert.equal(tmb, 1330);
});

test("TDEE aplica o fator de atividade correto", () => {
  assert.equal(calcularTDEE(1650, "sedentario"), 1980);
  assert.equal(calcularTDEE(1650, "atleta"), Math.round(1650 * 1.9));
});

test("Meta calórica por objetivo aplica déficit/superávit esperado", () => {
  assert.equal(calcularMetaCalorica(2000, "emagrecimento", "masculino").valor, 1600);
  assert.equal(calcularMetaCalorica(2000, "manutencao", "masculino").valor, 2000);
  assert.equal(calcularMetaCalorica(2000, "ganho_massa", "masculino").valor, 2240);
});

test("Meta calórica nunca fica abaixo do piso seguro por gênero", () => {
  const resultado = calcularMetaCalorica(1300, "emagrecimento", "feminino");
  assert.equal(resultado.valor, 1200); // 1300*0.8=1040 < piso 1200 -> usa o piso
  assert.ok(resultado.avisoSeguranca);
});

test("Gestante/lactante/histórico de TA nunca recebem déficit ou superávit automático", () => {
  const gestante = calcularMetaCalorica(2200, "emagrecimento", "feminino", { gestante: true });
  assert.equal(gestante.valor, 2200); // mantém o TDEE, sem déficit
  assert.ok(gestante.avisoSeguranca?.includes("gravidez"));

  const historico = calcularMetaCalorica(2200, "ganho_massa", "masculino", {
    historicoTranstornoAlimentar: true,
  });
  assert.equal(historico.valor, 2200); // mantém o TDEE, sem superávit
  assert.ok(historico.avisoSeguranca?.includes("transtorno alimentar"));
});

test("IMC abaixo do peso + objetivo emagrecimento bloqueia déficit (sinal indireto de possível TA)", () => {
  const resultado = calcularMetaCalorica(2000, "emagrecimento", "feminino", {
    imcAbaixoDoPesoComObjetivoEmagrecimento: true,
  });
  assert.equal(resultado.valor, 2000); // mantém o TDEE, sem déficit
  assert.ok(resultado.avisoSeguranca?.includes("abaixo do peso"));
});

test("gerarResultadoAvaliacao bloqueia déficit quando IMC calculado já é abaixo do peso", () => {
  const resultado = gerarResultadoAvaliacao({
    pesoKg: 45,
    alturaCm: 165,
    idade: 25,
    genero: "feminino",
    nivelAtividade: "leve",
    objetivo: "emagrecimento",
  });
  assert.ok(resultado.imc < 18.5);
  assert.equal(resultado.metaCalorica, resultado.tdee); // sem déficit aplicado
  assert.equal(resultado.avisos.length, 1);
});

test("Macros somam aproximadamente a meta calórica", () => {
  const meta = 2000;
  const macros = calcularMacros(meta, 70, "emagrecimento");
  const caloriasCalculadas =
    macros.proteinaG * 4 + macros.carboidratoG * 4 + macros.gorduraG * 9;
  assert.ok(Math.abs(caloriasCalculadas - meta) <= 5, "macros devem fechar a meta calórica");
  assert.equal(macros.fibraG, 28); // 14g / 1000kcal * 2000kcal
});

test("Água recomendada soma extra para atividade moderada+", () => {
  assert.equal(calcularAguaRecomendada(70, "sedentario"), 2450);
  assert.equal(calcularAguaRecomendada(70, "moderado"), 2950);
});

test("gerarResultadoAvaliacao integra todo o pipeline sem erros", () => {
  const resultado = gerarResultadoAvaliacao({
    pesoKg: 80,
    alturaCm: 178,
    idade: 35,
    genero: "masculino",
    nivelAtividade: "leve",
    objetivo: "emagrecimento",
  });
  assert.ok(resultado.imc > 0);
  assert.ok(resultado.tdee > resultado.tmb);
  assert.ok(resultado.metaCalorica < resultado.tdee);
  assert.ok(resultado.macros.proteinaG > 0);
  assert.ok(resultado.aguaMl > 0);
  assert.deepEqual(resultado.avisos, []);
});

test("Rejeita peso/altura inválidos", () => {
  assert.throws(() =>
    calcularIMC({ pesoKg: 0, alturaCm: 175, idade: 30, genero: "masculino" })
  );
});

test("Doença renal limita a proteína e gera aviso", () => {
  const { avisos, limiteProteinaPorKg } = avaliarCondicoesSaude(["doenca_renal"]);
  assert.equal(limiteProteinaPorKg, 1.0);
  assert.equal(avisos.length, 1);

  const macrosSemLimite = calcularMacros(2000, 70, "emagrecimento");
  const macrosComLimite = calcularMacros(2000, 70, "emagrecimento", limiteProteinaPorKg);
  assert.ok(macrosComLimite.proteinaG < macrosSemLimite.proteinaG);
  assert.equal(macrosComLimite.proteinaG, 70); // 1.0g/kg * 70kg
});

test("Diabetes e hipertensão geram avisos mas não limitam proteína", () => {
  const { avisos, limiteProteinaPorKg } = avaliarCondicoesSaude(["diabetes_tipo2", "hipertensao"]);
  assert.equal(limiteProteinaPorKg, null);
  assert.equal(avisos.length, 2);
});

test("Sono ruim e estresse alto geram avisos; sono/estresse ok não gera nada", () => {
  assert.equal(avaliarSonoEEstresse(1, 1).length, 1); // só sono ruim
  assert.equal(avaliarSonoEEstresse(5, 5).length, 1); // só estresse alto
  assert.equal(avaliarSonoEEstresse(1, 5).length, 2); // os dois
  assert.equal(avaliarSonoEEstresse(3, 3).length, 0); // nenhum
});

test("gerarResultadoAvaliacao combina avisos de condição de saúde e sono", () => {
  const resultado = gerarResultadoAvaliacao({
    pesoKg: 70,
    alturaCm: 165,
    idade: 40,
    genero: "feminino",
    nivelAtividade: "leve",
    objetivo: "emagrecimento",
    condicoesSaude: ["doenca_renal"],
    qualidadeSono: 1,
    nivelEstresse: 3,
  });
  assert.equal(resultado.avisos.length, 2); // doença renal + sono ruim
  assert.ok(resultado.macros.proteinaG <= 70); // 1.0g/kg respeitado
});

test("RCQ classifica risco por gênero", () => {
  const mulherRisco = calcularRCQ(90, 100, "feminino"); // 0.9 >= 0.85
  assert.equal(mulherRisco.classificacao, "Risco aumentado");

  const homemBaixo = calcularRCQ(80, 100, "masculino"); // 0.8 < 0.90
  assert.equal(homemBaixo.classificacao, "Risco baixo");
});

console.log(`\n${passed} testes passaram.`);
