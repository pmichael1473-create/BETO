# BetArena Firestore Security Specification

## 1. Data Invariants
- `/players/{userId}` is strictly owned by `request.auth.uid == userId` with a verified email (`request.auth.token.email_verified == true`). No collection `list` or cross-user `get` is permitted.
- `/leaderboard/{userId}` stores only public non-PII player metrics (`uid`, `displayName`, `avatar`, `balance`, `totalWins`, `totalLosses`, `title`, `isPublic`, `updatedAt`), readable by signed-in users when `isPublic == true`, writable only by the owner (`request.auth.uid == userId`) with verified email.
- `/rooms/{roomId}` represents a multiplayer match requiring a **minimum of 2 real players** (`minPlayers == 2`, `maxPlayers` in `[2, 6]`):
  - Only signed-in, verified users can create rooms (`hostId == request.auth.uid`, `playerIds == [hostId]`, `status == "waiting"`, `currentPlayers == 1`, `minPlayers == 2`).
  - Public rooms (`visibility == "public"`) have `inviteToken == ""` and `invitedHandles == []` so anyone can join from the lobby or public link.
  - Private rooms (`visibility == "private"`) generate a secret `inviteToken` (size >= 8) and optional lowercase `invitedHandles` allowlist (up to 20 usernames/emails).
  - `list` queries on `/rooms` enforce `resource.data.visibility == "public" || request.auth.uid in resource.data.playerIds` so private invite-only rooms cannot be scraped.
  - `get` on `/rooms/{roomId}` requires authentication (`isSignedIn()`), allowing invited users with the exact room ID link to inspect and join the room.
  - Joining a room is an explicit action branch only allowed when `existing().status == "waiting"`, `existing().currentPlayers < existing().maxPlayers`, `!(request.auth.uid in existing().playerIds)`, and for private rooms with non-empty `invitedHandles`, the user's verified email or saved player `displayName` (lowercase) is in `existing().invitedHandles`:
    - Appends `request.auth.uid` to `playerIds`, adds profile to `playerProfiles`, increments `currentPlayers` by 1.
    - Only transitions to `status == "in_progress"` if `incoming().currentPlayers >= 2 && incoming().currentPlayers == existing().maxPlayers`. Otherwise remains `"waiting"`.
  - Host may update `invitedHandles` on a `private`, `waiting` room via a dedicated action branch.
  - Starting early (when `maxPlayers > 2`) is an explicit action branch only allowed by `hostId` while `existing().status == "waiting"` AND `existing().currentPlayers >= 2`.
  - Playing moves is an explicit action branch only allowed by seated players (`request.auth.uid in existing().playerIds`) while `existing().status == "in_progress"` AND `existing().currentPlayers >= 2`, keeping `hostId`, `playerIds`, `playerProfiles`, `stake`, `minPlayers`, `maxPlayers`, `gameType`, `visibility`, `inviteToken`, `invitedHandles`, and `createdAt` immutable.
  - Once `existing().status == "completed"`, all further updates are denied (Terminal State Locking).
  - Deleting a room is only permitted by `hostId` while `existing().status == "waiting"`.
- `/transactions/{txRef}` records verified Squad Naira (`NGN`) deposits and Naira wallet withdrawals for idempotency and wallet history:
  - Only signed-in, verified users can create a transaction document where `id == txRef`, `uid == request.auth.uid`, `currency == "NGN"`, and `createdAt == request.time`.
  - Deposits require `type == "deposit"`, `provider == "squad"`, `status == "success"`, and `amountNaira` between `100` and `500000`.
  - Withdrawals require `type == "withdrawal"`, `provider == "beto_payout"`, `status == "pending"` on creation (admin/backend changes it to `"approved"`), `displayName` (player username), `amountNaira` strictly in `[1700, 3500, 5300, 8000, 10700]`, `balanceAfter` matching the player's post-withdrawal balance, valid `bankName`, `accountName` (2–80 chars), and 10-digit `accountNumber`, with atomic balance deduction on `/players/{uid}` verified via `get()`/`getAfter()`.
  - `get` is permitted for non-existent documents (`resource == null`, to support `runTransaction` idempotency checks) or strictly by the owner (`resource.data.uid == request.auth.uid`).
  - `list` strictly enforces `resource.data.uid == request.auth.uid`.
  - Updates and deletes are unconditionally denied (`allow update, delete: if false`) so verified deposit and withdrawal ledger records remain immutable and cannot be replayed.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated `get` on `/players/user-123` or `/rooms/room-1` or `/transactions/BA_123`.
2. Authenticated user A attempting `get` or `list` on `/players/user-B` or `/transactions` belonging to user B.
3. Authenticated user A attempting `create`/`update` on `/leaderboard/user-B` or `/transactions/tx-1` with `uid: "user-B"`.
4. Unverified email user (`email_verified == false`) attempting `create` on `/rooms/{roomId}` or `/transactions/{txRef}`.
5. Identity spoofing: user A creating `/rooms/room-x` with `hostId: "user-B"` or `playerIds: ["user-B"]`.
6. Bypassing 2-player minimum: host or guest attempting to set `status: "in_progress"` when `currentPlayers < 2` (e.g., 1 solo player).
7. Ghost/shadow field injection on `create`: adding `isAdmin: true` or `freeCoins: 9999` to `/players`, `/leaderboard`, `/rooms`, or `/transactions`.
8. Resource poisoning: `title` > 60 chars, `hostName` > 40 chars, `maxPlayers > 6`, oversized `gameState` (> 16 keys), or `amountNaira > 500000`.
9. Path ID poisoning: invalid characters in `{roomId}`, `{userId}`, or `{txRef}` (e.g. `room$bad!id`).
10. Duplicate seat / kick attack: seated user attempting to join twice or remove another UID from `playerIds` during join.
11. Third-party tampering: non-seated user C attempting to mutate `gameState` or `status` of an `in_progress` room, or mutating/deleting `/transactions/{txRef}`.
12. Terminal state / stake tampering: attempting to update after `existing().status == "completed"` or alter `stake`, `playerIds`, or `winnerId` outside `[playerIds..., 'tie']`.
