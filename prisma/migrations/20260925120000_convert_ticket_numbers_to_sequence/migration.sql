ALTER TABLE "Ticket" RENAME COLUMN "ticketNumber" TO "legacyTicketNumber";

ALTER INDEX "Ticket_ticketNumber_key" RENAME TO "Ticket_legacyTicketNumber_key";

CREATE SEQUENCE "Ticket_ticketNumber_seq";

ALTER TABLE "Ticket"
  ADD COLUMN "ticketNumber" INTEGER;

WITH ordered_tickets AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC) AS "ticketNumber"
  FROM "Ticket"
)
UPDATE "Ticket" AS ticket
SET "ticketNumber" = ordered_tickets."ticketNumber"
FROM ordered_tickets
WHERE ticket."id" = ordered_tickets."id";

SELECT setval(
  '"Ticket_ticketNumber_seq"',
  COALESCE(MAX("ticketNumber"), 1),
  COUNT(*) > 0
)
FROM "Ticket";

ALTER SEQUENCE "Ticket_ticketNumber_seq" OWNED BY "Ticket"."ticketNumber";

ALTER TABLE "Ticket"
  ALTER COLUMN "ticketNumber" SET DEFAULT nextval('"Ticket_ticketNumber_seq"'),
  ALTER COLUMN "ticketNumber" SET NOT NULL;

CREATE UNIQUE INDEX "Ticket_ticketNumber_key" ON "Ticket"("ticketNumber");
