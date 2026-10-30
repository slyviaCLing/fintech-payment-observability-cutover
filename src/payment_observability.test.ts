import test from "node:test";
import assert from "node:assert/strict";
import { decideRisk } from "./payment_observability.ts";

test("a high-value payment enters review even when the flag is off", () => {
  const decision = decideRisk({ paymentId: "pay_1", userId: "customer_1", amountCents: 100000, country: "US" }, false);
  assert.equal(decision, "review");
});

test("a normal payment is approved when the review flag is off", () => {
  const decision = decideRisk({ paymentId: "pay_2", userId: "customer_2", amountCents: 2500, country: "US" }, false);
  assert.equal(decision, "approve");
});
