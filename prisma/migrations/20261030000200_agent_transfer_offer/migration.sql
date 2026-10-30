-- CreateTable
CREATE TABLE "AgentTransferOffer" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "senderId" TEXT,
    "recipientId" TEXT,
    "recipientName" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "acceptedHandoffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTransferOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentTransferOffer_acceptedHandoffId_key" ON "AgentTransferOffer"("acceptedHandoffId");

-- CreateIndex
CREATE INDEX "AgentTransferOffer_recipientId_status_idx" ON "AgentTransferOffer"("recipientId", "status");

-- CreateIndex
CREATE INDEX "AgentTransferOffer_parentId_status_idx" ON "AgentTransferOffer"("parentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTransferOffer_workspaceId_senderId_requestId_key" ON "AgentTransferOffer"("workspaceId", "senderId", "requestId");

-- AddForeignKey
ALTER TABLE "AgentTransferOffer" ADD CONSTRAINT "AgentTransferOffer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTransferOffer" ADD CONSTRAINT "AgentTransferOffer_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTransferOffer" ADD CONSTRAINT "AgentTransferOffer_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AgentHandoff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTransferOffer" ADD CONSTRAINT "AgentTransferOffer_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "AgentRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTransferOffer" ADD CONSTRAINT "AgentTransferOffer_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "AgentRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTransferOffer" ADD CONSTRAINT "AgentTransferOffer_acceptedHandoffId_fkey" FOREIGN KEY ("acceptedHandoffId") REFERENCES "AgentHandoff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A legacy server must not finish or release the owner while an offer is pending.
CREATE FUNCTION "guard_pending_transfer_offer"() RETURNS trigger AS $$
BEGIN
  IF (NEW."status" IS DISTINCT FROM OLD."status" OR NEW."claimedById" IS DISTINCT FROM OLD."claimedById")
     AND EXISTS (SELECT 1 FROM public."AgentTransferOffer" WHERE "parentId" = OLD.id AND "status" = 'pending') THEN
    RAISE EXCEPTION 'Pending transfer offer must be accepted or cancelled before changing its claim' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "guard_pending_transfer_offer" BEFORE UPDATE OF "status", "claimedById" ON "AgentHandoff"
  FOR EACH ROW EXECUTE FUNCTION "guard_pending_transfer_offer"();
