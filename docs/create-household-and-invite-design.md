# Create household, set budget, and invite members via link — design note

Story: [docs/stories/create-household-and-invite.md](stories/create-household-and-invite.md)

## Order of work

1. **Schema**: `households` collection (id, name, monthly_budget number > 0, created_at) and `household_members` (household_id, user_id, joined_at, unique on `user_id` to enforce one household per user), plus `household_invites` (household_id, token, created_at) — token is a random opaque string, no expiry/usage fields needed since links are non-expiring and reusable. Security rules: members can read/update their own household and its members; creating a membership fails if the user already has one.
2. **Onboarding state (client-only, pre-signup)**: local/session state holding draft name+budget, not persisted to Firestore until signup succeeds.
3. **Signup integration**: on successful signup (email or Google callback), atomically create the household + membership from draft state, then clear draft state.
4. **Invite link generation + display**: generate/fetch a token for the caller's household, render the shareable URL.
5. **Join-via-link flow**: route reads the token → looks up household → if no session, routes through signup then joins; if a session exists, checks existing membership (block with a message if already in a different household) then inserts membership.
6. **Leave household**: deletes the caller's membership row.
7. **Budget edit UI**: form bound to the household's `monthly_budget`, updated via a React Query mutation.

## Tickets

1. Household & membership schema + security rules
2. Pre-signup household+budget onboarding form
3. Signup finalizes household creation
4. Generate and display invite link
5. Join household via invite link
6. Block join when already in a household
7. Leave household
8. Edit household budget

See the GitHub issues for full acceptance criteria and dependencies.
