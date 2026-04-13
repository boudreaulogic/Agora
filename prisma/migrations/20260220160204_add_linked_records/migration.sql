-- AlterTable
ALTER TABLE "agora_columns" ADD COLUMN     "linkedTableId" TEXT;

-- CreateTable
CREATE TABLE "linked_records" (
    "id" TEXT NOT NULL,
    "fromTableId" TEXT NOT NULL,
    "fromRowId" TEXT NOT NULL,
    "toTableId" TEXT NOT NULL,
    "toRowId" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "linked_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "linked_records_fromRowId_idx" ON "linked_records"("fromRowId");

-- CreateIndex
CREATE INDEX "linked_records_toRowId_idx" ON "linked_records"("toRowId");

-- CreateIndex
CREATE INDEX "linked_records_columnId_idx" ON "linked_records"("columnId");

-- CreateIndex
CREATE UNIQUE INDEX "linked_records_fromRowId_toRowId_columnId_key" ON "linked_records"("fromRowId", "toRowId", "columnId");

-- AddForeignKey
ALTER TABLE "agora_columns" ADD CONSTRAINT "agora_columns_linkedTableId_fkey" FOREIGN KEY ("linkedTableId") REFERENCES "agora_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linked_records" ADD CONSTRAINT "linked_records_fromTableId_fkey" FOREIGN KEY ("fromTableId") REFERENCES "agora_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linked_records" ADD CONSTRAINT "linked_records_fromRowId_fkey" FOREIGN KEY ("fromRowId") REFERENCES "agora_rows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linked_records" ADD CONSTRAINT "linked_records_toTableId_fkey" FOREIGN KEY ("toTableId") REFERENCES "agora_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linked_records" ADD CONSTRAINT "linked_records_toRowId_fkey" FOREIGN KEY ("toRowId") REFERENCES "agora_rows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
