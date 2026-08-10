-- The payment-terms sentence printed on quotations and invoices.
--
-- Nullable with no default on purpose: the model already carries
-- paymentTermDays for the due-date arithmetic, and this is the wording the
-- business actually uses with its customers. Seeding a generic sentence would
-- print terms nobody agreed to, so an empty column prints nothing at all.
ALTER TABLE "Company" ADD COLUMN "paymentTerms" TEXT;
