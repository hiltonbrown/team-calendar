-- Complete the LeaveSync -> Team Calendar rebrand at the database level.
-- The `00000000000000_init` migration was edited to define
-- availability_source_type with the value 'team_calendar_leave', but databases
-- provisioned before the rebrand still carry the old label 'leavesync_leave'.
-- Every record-listing query now filters on 'team_calendar_leave', so the old
-- databases reject those queries ("invalid input value for enum
-- availability_source_type"). Rename the value in place.
--
-- Guarded with an existence check so this migration is a no-op on a freshly
-- migrated database (where init already created the value as
-- 'team_calendar_leave'). RENAME VALUE preserves any existing rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'availability_source_type'
      AND e.enumlabel = 'leavesync_leave'
  ) THEN
    ALTER TYPE "availability_source_type"
      RENAME VALUE 'leavesync_leave' TO 'team_calendar_leave';
  END IF;
END
$$;
