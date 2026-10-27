# Architecture

## Layers

```
Next.js server-rendered page → authorized workspace data → React client UI
React server action → context (session + membership) → Zod + role/ownership policy
  → service transaction → PostgreSQL + audit log → revalidate UI
Device payload → integration adapter → API-key verification → same attendance tables
Approved HRM records → accounting adapter → CSV
Assigned published lesson text → tenant-scoped retrieval → optional AI → cited response
```

- `src/lib/auth.ts`: Auth.js credentials + optional enterprise OAuth; bcrypt; database login throttling
- `src/lib/session.ts`: active global user + active employment + membership → tenant/role context
- `src/lib/data.ts`: queries scope employees to company and direct reports/self before assembling response
- `src/lib/service.ts`: transactional business rules; no browser-supplied role or company ID trusted
- `src/lib/policy.ts`: permission helpers, score computation, readiness, CSV sanitation, Bangkok date
- `src/lib/integrations/adapters.ts`: provider-neutral attendance/accounting contracts and sample mappings
- `src/lib/db.ts`: pg pool for PostgreSQL; serialized PGlite access for local single-process mode
- `db/001_initial.sql`: repeatable initial schema; add numbered migrations for future schema changes

Use composite foreign keys `(company_id, entity_id)` for tenant-bound references. Every service query
uses company_id from the server-side context. Do not accept an actor supplied by the client.
Current isolation is application filters plus relational constraints, not PostgreSQL RLS.
When adding endpoints, test both read and write cross-tenant failures; future RLS must use transaction-local tenant settings.

## Learning state

```
Draft → add lessons/questions → Publish → automatic/manual assignment
Assigned → acknowledge each lesson → Quiz
Quiz below threshold → record attempt → reset lesson acknowledgements → revisit lessons → retake
Quiz pass → preserve best score/pass timestamp → practical signoff if required → ready
```

A successful pass is not revoked by later practice attempts. Published assessments are immutable in MVP.
Practical signoff locks enrollment, requires quiz pass, checks direct-report relationship for managers,
rejects self-certification, and retains reviewer/time/note. A learner is fully ready only when all assigned
published required enrollments are ready. Assignment changes can therefore change readiness.

## Local operation

Run migration/seed while the app is stopped. PGlite supports a single process opening its files.
To back it up: stop the server, copy `data/peopleflow` as a unit, restore only while stopped.
For PostgreSQL use normal pg_dump/restore and test recovery. Never commit data or .env.
Production must use a separate PostgreSQL service, persistent secrets, HTTPS, backups and operations monitoring.

## Extension points

1. Extract per-module UI components from Workspace as feature depth grows; replace broad workspace preload with paginated module-specific queries.
2. Add policy tables for holiday calendar, leave types, entitlement, overtime rules and multi-stage approval.
3. Add object storage with signed URLs, MIME/size checks and malware screening before internal document uploads.
4. Add outbox tables + job worker for automatic LINE/email notices, accounting delivery and retries.
5. Add user invitation, password recovery and session revocation, MFA and stronger edge-wide rate limits.
6. Add tenant-specific secret manager references and adapter selection after real providers are chosen.
7. Add subscription/tenant lifecycle/platform-operator role separately from company admin; no billing is implied by company creation.

## Validation limits

Automated workflows run against PGlite's PostgreSQL engine. A PostgreSQL server smoke test is separately required
for production migrations/driver behavior. Live OAuth, LINE, AI and physical devices require real provider credentials
and are not verified by mocked/sample protocol tests.
