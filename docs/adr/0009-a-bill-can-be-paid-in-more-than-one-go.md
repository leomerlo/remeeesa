---
status: accepted
---

# A Pendiente can be paid in more than one go, and counts for what is left

A bill was all or nothing: either it was marked paid — recording a real amount and generating the
matching Expense (ADR 0004) — or it sat untouched owing its whole figure. Real payment does not
work that way. Going to pay the expensas without the full amount in hand and putting down part of
it had no answer in the app: the only honest-looking move was to edit the bill down to what had
been handed over, which quietly made the rest of the debt disappear.

We considered modelling each part-payment as its own small Pendiente, so that nothing in the
existing model had to change. Rejected: it multiplies the row the household is tracking (three
"Expensas" on the Servicios list is not what anybody means by having paid some of the expensas),
and the thing that actually matters — how much of the real figure is still owed — would have to be
reassembled by reading several bills at once.

Decision: a **Pendiente carries a running total** of what has been handed over against it
(`paid_so_far`) plus the Expenses that handed it over (`partial_expense_ids`), and stays
`pending`. Each part-payment writes an ordinary Expense, exactly as the paid transition does, so
the money that left counts against the month the moment it leaves. Paying the last of it is the
ordinary paid transition, unchanged, and settles the bill.

The consequence that reaches everything: **what an unpaid bill counts against its month is what it
still owes, not what it asks for**. Counting the whole figure while a part-payment also sits in the
month's Expenses charges the household twice for the same pesos. That subtraction lives in
`lib/expenses/billOwed`, which is where the two functions every total of a pending bill already
goes through (`computePendingCommitted`, `summarizeByCategory`) take their bills structurally — so
both apps get it right at once and no screen has to remember to ask.

**Not on a Resumen.** A card's monthly bill is an estimate until it is paid (ADR 0006, and the
running total is deliberately never the bill), and what the household actually hands the card it
writes down as a Pendiente of its own — which can be part-paid like any other. Per direct
feedback: "el resumen de la tarjeta, olvidate". Part-paying a Resumen would also mean carrying
refinanced interest the app cannot compute.

**What is left over stays where it is.** A bill part-paid in November still shows in November,
marked late, beside December's own copy. Merging the two would read shorter and hide which part
of the debt was old.

The rules tie both sides together rather than trusting the client: the Expense appearing in the
same commit must be worth precisely what the bill's running total went up by (`getAfter`), so the
figure on a bill can never drift from the money in the month, and undoing a part-payment must
delete that Expense in the same commit rather than leave it orphaned.
