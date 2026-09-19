-- AlterTable
ALTER TABLE "outbound_operations" ADD COLUMN     "merged_record_id" UUID,
ADD COLUMN     "request_employee_id" TEXT,
ADD COLUMN     "request_ends_at" TIMESTAMP(3),
ADD COLUMN     "request_leave_type_id" TEXT,
ADD COLUMN     "request_starts_at" TIMESTAMP(3),
ADD COLUMN     "request_title" TEXT,
ADD COLUMN     "request_units" DECIMAL(12,4),
ADD COLUMN     "side_effect_claimed_at" TIMESTAMP(3);
