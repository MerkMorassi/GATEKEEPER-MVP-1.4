# GateKeeper Financial Architecture & Settlement Engine

## 1. System Overview & Flow Diagram

**Version: 1.4 — Canonical Release Candidate**

```text
Provider-Configured Payment Method
(Credit/Debit / Apple Pay / Google Pay / Stripe Link / Cash App Pay)
        │
        ▼
Payment Collection Processor
(Stripe — sole v1.4 payment rail)
        │
        ▼
GateKeeper Financial Ledger
(Order, PaymentRecord)
        │
        ▼
Settlement Engine
(Deterministic 85/15 Split)
        │
        ▼
PayoutProviderAdapter
        │
        ▼
Talentir
(Sole v1.4 Payout Boundary)
```

### 1.1 Architectural Roles & Wording
GateKeeper's core financial architecture is conceptually decoupled from any single collection processor or payment rail. The canonical transaction lifecycle follows:
`Payment method → collection processor → GateKeeper financial authority → settlement → provider disbursement`.

*   **Payment**: Stripe is the sole GateKeeper customer payment processor/payment rail for v1.4. Supported customer-facing payment methods are those provided through Stripe's supported integrations/configuration (e.g., Credit/Debit Cards, Apple Pay, Google Pay, Stripe Link, and Cash App Pay). PayPal is unsupported.
*   **Payout**: Talentir is the sole provider payout/disbursement boundary for v1.4. GateKeeper determines and records settlement; Talentir performs recipient-side payout/disbursement. PayPal is not a provider payout mechanism.
*   **GateKeeper Financial Ledger**: Regardless of the collection method or processor configured, GateKeeper owns the final, authoritative transaction state and database models (`Order` and `PaymentRecord`). It controls the order workflow, ledger, entitlement, and double-entry settlements.
*   **Settlement Engine**: Processes payment notifications captured at the collection boundary, automatically executing the deterministic 85/15 financial splits to separate platform fees from creator earnings.
*   **PayoutProviderAdapter**: The abstraction layer managing disbursement execution via downstream interfaces.

### 1.2 Legacy Schema Compatibility (CRITICAL)
`PaymentRecord` is a valid, active GateKeeper v1.4 ledger object. Its `paypalOrderId` and `paypalCaptureId` property names are:

> **LEGACY DATABASE FIELD NAMES ONLY — NOT PAYMENT PROVIDERS, NOT PAYMENT METHODS, AND NOT ACTIVE PAYPAL INTEGRATION.**

These fields are retained solely for backward compatibility. During Stripe payment fulfillment, Stripe checkout transaction and payment intent identifiers are stored within these legacy-named database properties.
- Current Stripe identifiers may be stored in legacy-named fields only if required for database compatibility.
- No current payment logic may interpret those fields as PayPal identifiers.
- No PayPal SDK/API/credential/configuration may depend on them.
- They must not appear as active provider/payment capabilities.

---

## 2. Core Financial Invariants

1. **85/15 Deterministic Settlement**:
   - Provider Share = `Math.floor(grossCents * 0.85)`
   - Agent/Platform Share = `grossCents - providerCents` (Guarantees zero-cent rounding drift).

2. **Server-Authoritative Pricing**:
   - Order fee and payout amounts originate from database `ProviderConfig` / `ServiceDefinition`.
   - Client payload amount injections are strictly ignored.

3. **Payout Invariants**:
   - **Server-Authoritative Creator**: `creatorId` comes from settlement/order.
   - **Server-Authoritative Amount**: `payoutAmount <= creatorSettlementAmount`.
   - **No Duplicate Payouts**: Payout ID (`GK-{orderId}-PROVIDER`) acts as custom idempotency key.
   - **Ledger Invariance**: Provider payout status tracks disbursement delivery but does not alter contractual settlement obligations.
   - **Tenant Isolation**: Creator financials isolated by `creatorId === session.providerId`.
   - **Immutable Completed Payouts**: Completed payouts cannot be edited or rolled back without new explicit audit events.

---

## 3. AI AGENT SAFETY RULE

> **AI AGENTS MUST NOT REINTRODUCE PAYPAL.**
>
> PayPal references appearing in historical documentation or legacy database field names do not authorize implementation of PayPal functionality.
>
> Before changing payment or payout architecture, agents MUST read the current v1.4 financial architecture and Talentir integration documents.
