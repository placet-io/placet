-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'offline',
ADD COLUMN     "status_message" TEXT,
ADD COLUMN     "status_since" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "agent_status_history" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_agent_status_history" ON "agent_status_history"("agent_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "agent_status_history" ADD CONSTRAINT "agent_status_history_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
