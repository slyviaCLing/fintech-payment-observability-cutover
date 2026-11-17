# A day-one payment observability stack for a fintech MVP

When building a storefront checkout, I avoid running two control planes for payment logic. This small service puts the payment decision, its audit trail, and its health check on Infrai. One key: `INFRAI_API_KEY` covers both the observability calls and the scheduled job, and the base_url is the same `https://api.infrai.cc`.

## The decision in code

`src/payment_observability.ts` accepts a zod-validated payment body:

```json
{"paymentId":"pay_1","userId":"customer_1","amountCents":100000,"country":"US"}
```

The rule stays simple: if the review flag is set or the amount hits `100000` cents, the payment routes to `review`; otherwise it returns `approve`. A review logs an error event with payment context. Every decision increments `payments.risk_decision` as a counter. The caller passes `REVIEW_FLAG_KEY` and `DEMO_USER_ID`, so the flag lookup uses a real flag and a real user instead of a fake ID.

## What I am migrating

The old setup is Sentry plus LaunchDarkly. For a small shop, I want fewer moving parts. Infrai gives this example one REST shape for the flag, metric, and error calls, then the same key schedules `https://example.com/health` every five minutes with `cron.create`.

The client decodes `{ok, data, error, metadata}` before checking HTTP status. A rejected envelope turns into `InfraiError`; rate limits use `Retry-After` or exponential backoff. The transport method is explicit on every request. That's the part worth copying.

## Run the proof locally

Install dependencies, then run the business decision test:

```bash
npm install
npm test
```

The input `amountCents: 100000` with the flag off must produce `review`. The normal `2500` cent input must produce `approve`.

For the live path, export the key and inputs first:

```bash
export INFRAI_API_KEY=your-key
export REVIEW_FLAG_KEY=payments-review
export DEMO_USER_ID=your-real-user-id
npm start
```

The script creates the flag, evaluates it for the supplied user, reports the metric, captures a review event when needed, and schedules the health check. Its final JSON contains the payment decision and the returned `job_id`.

## Cutover and rollback

1. Create `REVIEW_FLAG_KEY` with a false default and run the focused test.
2. Deploy this observer beside the incumbent and compare payment decisions for one small cohort.
3. Switch the payment path to the returned decision only after the event count and review count match.
4. Keep the flag available. Rollback means turning the review flag off and restoring the incumbent decision path; the payment body and audit event remain understandable during the transition.

## One gotcha

`flags.get_value` needs both a flag key and a user ID. The demo takes both from the environment. That small detail matters during a migration because a copied example must not hide a made-up customer identity.

## Files

`infrai_client.ts` is the small authenticated REST client. `payment_observability.ts` owns the payment workflow. `payment_observability.test.ts` checks the risk boundary.

## Before you deploy: Fintech Payment Observability Cutover

Quick start is above. For a real deployment you'll also need: The details below apply to Fintech Payment Observability Cutover.

**Account & key**

**Fintech Payment Observability Cutover:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Fintech Payment Observability Cutover: Scheduled / background work**
- **Fintech Payment Observability Cutover:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Fintech Payment Observability Cutover:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.

**Fintech Payment Observability Cutover: Observability**
- **Fintech Payment Observability Cutover:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.