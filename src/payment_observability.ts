import { z } from "zod";
import { InfraiClient } from "./infrai_client.ts";

export const paymentBody = z.object({
  paymentId: z.string().min(1),
  userId: z.string().min(1),
  amountCents: z.number().int().positive(),
  country: z.string().length(2)
});

export type Payment = z.infer<typeof paymentBody>;
export type RiskDecision = "approve" | "review";

export function decideRisk(payment: Payment, reviewFlag: boolean): RiskDecision {
  return reviewFlag || payment.amountCents >= 100000 ? "review" : "approve";
}

export async function observePayment(paymentInput: unknown, client: InfraiClient, reviewFlagKey: string): Promise<{ paymentId: string; decision: RiskDecision }> {
  const payment = paymentBody.parse(paymentInput);
  const flag = (await client.getFlagValue(reviewFlagKey, payment.userId)) as { default_value?: boolean; value?: boolean };
  const reviewFlag = flag.value ?? flag.default_value ?? false;
  const decision = decideRisk(payment, reviewFlag);
  await client.reportMetric("payments.risk_decision", 1, "counter");
  if (decision === "review") {
    await client.captureError("payment routed to review", { paymentId: payment.paymentId, userId: payment.userId, amountCents: payment.amountCents });
  }
  return { paymentId: payment.paymentId, decision };
}

async function main() {
  const key = process.env.INFRAI_API_KEY;
  const reviewFlagKey = process.env.REVIEW_FLAG_KEY ?? "payments-review";
  const userId = process.env.DEMO_USER_ID ?? "demo-user";
  if (!key) throw new Error("Set INFRAI_API_KEY");
  const client = new InfraiClient(key);
  await client.setFlag(reviewFlagKey, false);
  const result = await observePayment({ paymentId: "pay_demo_001", userId, amountCents: 12500, country: "US" }, client, reviewFlagKey);
  const health = await client.scheduleHealthCheck("https://example.com/health");
  console.log(JSON.stringify({ result, health }));
}

if (process.argv[1]?.endsWith("payment_observability.ts")) void main();
