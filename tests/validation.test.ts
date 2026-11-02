import { test } from "node:test";
import assert from "node:assert/strict";
import { validateForm, normalizeInstagram, emptyForm } from "../lib/validation.ts";

const good = {
  ...emptyForm,
  fullName: "Анна Коваленко",
  email: "Anna@Example.com",
  contact: "@anna",
  instagram: "@anna.brand",
  occupation: "Стилістка",
  mainRequest: "Хочу більше клієнтів з блогу",
  desiredResult: "Стабільні заявки",
  questions: "Як покращити контент?",
  consent: true,
};

test("valid form passes and is normalized", () => {
  const r = validateForm(good, { extended: false });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.data.email, "anna@example.com");
    assert.equal(r.data.instagram, "https://instagram.com/anna.brand");
    assert.equal(r.data.products, "", "додаткові поля ігноруються для інших послуг");
  }
});

test("required fields, consent and full name", () => {
  const r = validateForm({ ...good, fullName: "Анна", questions: "  ", consent: false }, { extended: false });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.errors.fullName);
    assert.ok(r.errors.questions);
    assert.ok(r.errors.consent);
  }
});

test("strategy requires extended answers", () => {
  const r = validateForm(good, { extended: true });
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual(Object.keys(r.errors).sort(), ["acquisitionProblems", "averageCheck", "goal3m", "products"]);
});

test("bad email and links rejected; extra socials limited", () => {
  const r = validateForm(
    { ...good, email: "anna@", website: "not a url", otherSocials: Array.from({ length: 10 }, (_, i) => ({ label: "x", url: `https://t.me/a${i}` })) },
    { extended: false },
  );
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.errors.email);
    assert.ok(r.errors.website);
  }
  const ok = validateForm({ ...good, otherSocials: Array.from({ length: 10 }, (_, i) => ({ label: "x", url: `t.me/a${i}` })) }, { extended: false });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.data.otherSocials.length, 6);
    assert.equal(ok.data.otherSocials[0].url, "https://t.me/a0");
  }
});

test("instagram normalization", () => {
  assert.equal(normalizeInstagram("instagram.com/x"), "https://instagram.com/x");
  assert.equal(normalizeInstagram("https://www.instagram.com/x/"), "https://www.instagram.com/x/");
  assert.equal(normalizeInstagram("my_brand"), "https://instagram.com/my_brand");
});

test("garbage input does not throw", () => {
  assert.equal(validateForm(null, { extended: true }).ok, false);
  assert.equal(validateForm({ fullName: 5, otherSocials: "x" }, { extended: false }).ok, false);
});

test("contact stage needs only contacts and consent", () => {
  const r = validateForm({ fullName: "Анна Коваленко", email: "a@b.co", contact: "@a", instagram: "@a", consent: true }, { extended: true, stage: "contact" });
  assert.equal(r.ok, true);
  const bad = validateForm({ fullName: "Анна", email: "x", consent: false }, { extended: false, stage: "contact" });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.deepEqual(Object.keys(bad.errors).sort(), ["consent", "contact", "email", "fullName", "instagram"]);
});

test("questionnaire stage ignores contacts and consent", () => {
  const q = { occupation: "Стилістка", mainRequest: "Клієнти", desiredResult: "10 заявок", questions: "Як?" };
  assert.equal(validateForm(q, { extended: false, stage: "questionnaire" }).ok, true);
  const s = validateForm(q, { extended: true, stage: "questionnaire" });
  assert.equal(s.ok, false);
  if (!s.ok) assert.deepEqual(Object.keys(s.errors).sort(), ["acquisitionProblems", "averageCheck", "goal3m", "products"]);
});
