-- Documents a derived column in matchbox.trove_updates (0009). musd
-- BorrowerOperations emits TroveUpdated with interest 0 after any debt
-- increase (_updateTroveFromAdjustment never sets newInterest on that
-- branch), although a borrow pays no interest. The decoder keeps the real
-- figure so the next repayment's debt_change is exact.

COMMENT ON COLUMN matchbox.trove_updates.interest IS
  'Interest owed after the operation: the event value, except after a borrow (LOAN_BORROWED), where the event reports 0 and this is prev_interest + accrued_interest.';
