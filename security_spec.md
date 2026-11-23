# Security Specification — Creps Urca Transition Platform

## 1. Data Invariants
1. **Strict RBAC Boundary**: Only verified Master Admins (`tiago.rodrigues2933@gmail.com` with `email_verified == true`, or active users in `/users/{uid}` with `role == 'master'`) can create, update, or delete tasks, payments, and user profiles. Store Managers (`role == 'manager'`) have strict read-only access to `tasks` and `payments`, and zero write privileges anywhere.
2. **PII Isolation**: `/users/{userId}` contains personal emails. `get` is restricted to the profile owner or a Master Admin. `list` is restricted exclusively to Master Admins.
3. **Immutable Audit Trail**: `/audit_logs/{logId}` is append-only (`create` allowed only for Master Admins with `actorUid == request.auth.uid` and `timestamp == request.time`; `update` and `delete` are unconditionally denied).
4. **Temporal & Identity Integrity**: Every `create` requires `createdAt == request.time` and `createdByUid == request.auth.uid`. Every `update` preserves immutable `createdAt`, `createdByUid`, and `workspaceId`, while enforcing `updatedAt == request.time`.
5. **Strict Key & Volumetric Guards**: All document IDs match `^[a-zA-Z0-9_\-]+$` (`<= 128` chars), all strings enforce `maxLength` bounds, and `keys().hasOnly(...)` rejects shadow fields.

## 2. "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Read/Write**: Read `/tasks/t1` with `auth == null` -> `PERMISSION_DENIED`.
2. **Manager Privilege Escalation (Self-Promotion)**: User with `role: 'manager'` updates `/users/{ownUid}` setting `role: 'master'` -> `PERMISSION_DENIED`.
3. **Manager Task Mutation**: User with `role: 'manager'` attempts `create`, `update`, or `delete` on `/tasks/{taskId}` -> `PERMISSION_DENIED`.
4. **Manager Payment Mutation**: User with `role: 'manager'` attempts `create`, `update`, or `delete` on `/payments/{paymentId}` -> `PERMISSION_DENIED`.
5. **Spoofed Admin Email (Unverified)**: Attacker authenticates with `email: 'tiago.rodrigues2933@gmail.com'` and `email_verified: false` -> `PERMISSION_DENIED`.
6. **Shadow Field Injection**: Master Admin sends `tasks` payload with an extra `{ isVerified: true }` field -> `PERMISSION_DENIED`.
7. **Audit Log Tampering**: Master Admin attempts `update` or `delete` on `/audit_logs/{logId}` -> `PERMISSION_DENIED`.
8. **Actor Spoofing in Audit Log**: Master Admin attempts to create `/audit_logs/{logId}` with `actorUid` set to another user's UID -> `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: Master Admin attempts `create` on `/payments/{paymentId}` with backdated `createdAt` (`createdAt != request.time`) -> `PERMISSION_DENIED`.
10. **Negative or Zero Payment Amount**: Master Admin submits `/payments/{paymentId}` with `amount: -500` or `amount: 0` -> `PERMISSION_DENIED`.
11. **ID Poisoning / Resource Exhaustion**: Attacker targets `/tasks/<200-char-invalid-id!@#>` -> `PERMISSION_DENIED`.
12. **PII Enumeration by Manager**: Store Manager attempts `list` on `/users` or `get` on another user's `/users/{otherUid}` -> `PERMISSION_DENIED`.
