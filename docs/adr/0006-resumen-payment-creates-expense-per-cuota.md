---
status: accepted
---

# Paying a Resumen creates one Expense per Cuota, plus an optional ajuste

ADR-0004 made a Pendiente and its payment two things: paying a Pendiente generates exactly one
Expense. A card's Resumen is a Pendiente too, but it adds up Cuotas of purchases from different
categories (Comida, Ropa, Salud…). One Expense for the whole Resumen would file all of it under
"Tarjeta" and lose what the money was actually spent on.

Decision: paying a Resumen generates **one Expense per Cuota** — the purchase's name and the
Cuota's amount, in the "Tarjeta" Category, with the purchase's category name kept as its
**Subcategoría** (a snapshot). When the amount paid differs from the Resumen's total, one more
Expense, "<card> — ajuste", records the difference with no Subcategoría; it is negative when less
was paid than the total. Every generated Expense is dated in the Resumen's month (the payment date
if paid within it, otherwise the month's last day), so each Cuota counts exactly once, in the
month it was budgeted for.

Consequences:

- An Expense may now have a negative price, but only as a Resumen's ajuste (the Firestore rules
  allow it only when `pendiente_id` points to a Resumen).
- A Pendiente's payment is a list: `paid_expense_ids` holds every generated Expense
  (`paid_expense_id` stays the first, for older readers). Undoing a payment — from the Resumen or
  by deleting any one of its Expenses — deletes them all.
- Paying locks the Resumen's purchases (`card_purchases.paid_resumen_ids`): a purchase with a
  Cuota in a paid Resumen can no longer be edited or deleted, and the rules enforce it. Undoing
  the payment unlocks them unless another paid Resumen still holds one of their Cuotas.
- The Firestore rules can't loop over the generated Expenses, so they check the shape of the
  payment (status, the list, the first Expense existing in the household) rather than each line.
