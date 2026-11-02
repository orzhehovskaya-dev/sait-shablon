import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  buildPurchaseFields,
  verifyTransaction,
  transactionSignature,
  buildAcceptResponse,
  parseCallbackBody,
  checkStatus,
  refund,
  formatAmount,
} from "../lib/wayforpay.ts";

const cfg = { merchantAccount: "test_merch", secretKey: "secret-key", merchantDomainName: "site.example" };
const md5 = (s: string) => createHmac("md5", cfg.secretKey).update(s, "utf8").digest("hex");

test("purchase signature follows WayForPay field order", () => {
  const f = buildPurchaseFields(cfg, {
    orderReference: "MG-1",
    orderDate: 1760000000,
    amount: 200,
    currency: "EUR",
    productName: "Особиста консультація — 25.10.2026 14:00",
    returnUrl: "https://site.example/r",
    serviceUrl: "https://site.example/s",
    orderTimeout: 1200,
  });
  const expected = md5("test_merch;site.example;MG-1;1760000000;200;EUR;Особиста консультація — 25.10.2026 14:00;1;200");
  assert.equal(f.merchantSignature, expected);
  assert.equal(f["productPrice[]"], "200");
  assert.equal(f.orderTimeout, "1200");
  assert.ok(!("secretKey" in f));
  assert.ok(!Object.values(f).includes(cfg.secretKey));
});

test("amount formatting", () => {
  assert.equal(formatAmount(50), "50");
  assert.equal(formatAmount(9118.5), "9118.5");
  assert.equal(formatAmount(0.1 + 0.2), "0.3");
});

const tx = {
  merchantAccount: "test_merch",
  orderReference: "MG-1",
  amount: 200,
  currency: "EUR",
  authCode: "541963",
  cardPan: "41****8217",
  transactionStatus: "Approved",
  reasonCode: 1100,
};

test("callback signature verification", () => {
  const signed = { ...tx, merchantSignature: md5("test_merch;MG-1;200;EUR;541963;41****8217;Approved;1100") };
  assert.equal(transactionSignature(tx, cfg.secretKey), signed.merchantSignature);
  assert.equal(verifyTransaction(signed, cfg), true);
  assert.equal(verifyTransaction({ ...signed, amount: 1 }, cfg), false, "змінена сума");
  assert.equal(verifyTransaction({ ...signed, transactionStatus: "Declined" }, cfg), false, "змінений статус");
  assert.equal(verifyTransaction({ ...signed, merchantAccount: "other" }, cfg), false, "чужий мерчант");
  assert.equal(verifyTransaction({ ...tx } as never, cfg), false, "без підпису");
});

test("accept response is signed", () => {
  const r = buildAcceptResponse("MG-1", cfg.secretKey, 1700000000);
  assert.equal(r.status, "accept");
  assert.equal(r.signature, md5("MG-1;accept;1700000000"));
});

test("callback body parsing: JSON and form-wrapped JSON", () => {
  const json = JSON.stringify(tx);
  assert.equal(parseCallbackBody(json)?.orderReference, "MG-1");
  assert.equal(parseCallbackBody(new URLSearchParams({ [json]: "" }).toString())?.orderReference, "MG-1");
  assert.equal(parseCallbackBody("garbage"), null);
});

test("CHECK_STATUS verifies response signature", async () => {
  const good = { ...tx, merchantSignature: transactionSignature(tx, cfg.secretKey) };
  let sent: Record<string, unknown> = {};
  const fakeFetch = (async (_url: string, init: { body: string }) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify(good), { status: 200 });
  }) as unknown as typeof fetch;
  const r = await checkStatus(cfg, "MG-1", fakeFetch);
  assert.equal(r?.transactionStatus, "Approved");
  assert.equal(sent.merchantSignature, md5("test_merch;MG-1"));

  const forged = (async () => new Response(JSON.stringify({ ...tx, merchantSignature: "bad" }))) as unknown as typeof fetch;
  await assert.rejects(() => checkStatus(cfg, "MG-1", forged));
});

test("REFUND request signature", async () => {
  let sent: Record<string, unknown> = {};
  const fakeFetch = (async (_url: string, init: { body: string }) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ transactionStatus: "Refunded", reason: "Ok", reasonCode: 1100 }));
  }) as unknown as typeof fetch;
  const r = await refund(cfg, { orderReference: "MG-1", amount: 50, currency: "EUR", comment: "test" }, fakeFetch);
  assert.equal(r.ok, true);
  assert.equal(sent.merchantSignature, md5("test_merch;MG-1;50;EUR"));
  assert.equal(sent.transactionType, "REFUND");
});

test("credential probe interprets WayForPay reason codes", async () => {
  const { probeCredentials } = await import("../lib/wayforpay.ts");
  const reply = (code: number, reason: string) => (async () => new Response(JSON.stringify({ reasonCode: code, reason }))) as unknown as typeof fetch;
  assert.equal((await probeCredentials(cfg, reply(1127, "Order Not Found"))).ok, true);
  const bad = await probeCredentials(cfg, reply(1113, "Invalid signature"));
  assert.equal(bad.ok, false);
  assert.match(bad.hint, /Secret Key/);
  assert.equal((await probeCredentials(cfg, reply(1121, "Account Not Found"))).ok, false);
});
