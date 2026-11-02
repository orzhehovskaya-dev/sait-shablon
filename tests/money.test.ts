import { test } from "node:test";
import assert from "node:assert/strict";
import { uah, parseNbu } from "../lib/money.ts";

test("UAH display rounds to tens", () => {
  assert.equal(uah(50, 50.31), "≈ 2 520 грн");
  assert.equal(uah(200, 50.31), "≈ 10 060 грн");
  assert.equal(uah(350, 50.31), "≈ 17 610 грн");
});

test("NBU response parsing", () => {
  const ok = parseNbu([{ r030: 978, txt: "Євро", rate: 50.31, cc: "EUR", exchangedate: "12.10.2026" }]);
  assert.deepEqual(ok, { rate: 50.31, date: "12.10.2026", source: "nbu" });
  assert.equal(parseNbu([]), null);
  assert.equal(parseNbu([{ rate: 41, cc: "USD" }]), null);
  assert.equal(parseNbu([{ rate: 0, cc: "EUR" }]), null);
  assert.equal(parseNbu({ error: "x" }), null);
});
