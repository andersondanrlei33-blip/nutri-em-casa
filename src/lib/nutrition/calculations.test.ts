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
  assert.equal(calcularMetaCalorica(2000, "emagrecimento"), 1600);
  assert.equal(calcularMetaCalorica(2000, "manutencao"), 2000);
  assert.equal(calcularMetaCalorica(2000, "ganho_massa"), 2240);
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
});

test("Rejeita peso/altura inválidos", () => {
  assert.throws(() =>
    calcularIMC({ pesoKg: 0, alturaCm: 175, idade: 30, genero: "masculino" })
  );
});

console.log(`\n${passed} testes passaram.`);
