# Create household, set budget, and invite members via link

As a user, I want to create my household, set its monthly budget, and invite other people to join via a shareable link, so that my household can start tracking shared expenses against a common budget.

## Context

This is the first onboarding flow for the app: no household, budget, or invite features exist yet. Rather than requiring signup first, the flow builds value up front — the user creates the household and sets its budget as a guided onboarding sequence, and only creates their account (signup) at the end to save it. Once the household exists, the creator can invite others via a reusable link; anyone without an account is taken through signup as part of joining.

## Acceptance criteria

- [ ] A new user can start the onboarding flow without an account: name the household (non-empty name; duplicate names across different households are allowed) and set its monthly budget (a single positive total amount, recurring monthly, decimals allowed).
- [ ] Nothing is persisted until signup is completed. If the user abandons signup after configuring the household and budget, that configuration is discarded and they must start the flow again.
- [ ] At the end of onboarding, the user completes signup (creates an account via email or Google), which persists the household and budget and finalizes the user as its first member.
- [ ] After the household exists, the user can generate a shareable invite link for it.
- [ ] The invite link is reusable (not single-use) and does not expire.
- [ ] Opening the invite link lets a person join the household automatically, with no confirmation step: if they don't have an account, the link takes them through signup first (via email or Google), then joins them; if they already have an account, they are joined immediately on opening the link.
- [ ] All household members (creator and invited members) have equal permissions — anyone can edit the budget or generate/share the invite link.
- [ ] A user can edit the household's monthly budget amount after creation (must remain a positive number).
- [ ] A user can belong to only one household at a time.
- [ ] A user can leave their current household. Leaving removes their membership so they can subsequently join or create another household.
- [ ] If a user who already belongs to a household opens another household's invite link, they see a clear message that they must leave their current household before joining a new one, and they are not joined.

## Out of scope

- Multiple households per user.
- Per-category budgets (only a single total monthly amount for now).
- Role-based permissions (e.g. an "owner" with special powers).
- Revoking or regenerating the invite link.
- Deleting a household.
- Removing another member from a household (only leaving voluntarily is in scope).
- Concurrent-edit conflict resolution for the budget (last write wins, no locking or merge logic).
- Handling malformed/nonexistent invite links beyond a generic error.

## Open questions

- None outstanding — the leave-household action was pulled into scope specifically to make the "already in a household" edge case testable end-to-end.
