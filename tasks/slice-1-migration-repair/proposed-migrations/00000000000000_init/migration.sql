-- LeaveSync baseline (init) migration.
-- Generated from packages/database/prisma/schema.prisma via:
--   prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
-- followed by the two raw-SQL partial unique indexes that Prisma @@unique cannot
-- express (they previously lived in migrations 20260605001000 and 20260606000000).
-- This single file reproduces the full current schema for a fresh database.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "source_system" AS ENUM ('XERO', 'MANUAL');

-- CreateEnum
CREATE TYPE "employment_type" AS ENUM ('employee', 'contractor', 'director', 'offshore');

-- CreateEnum
CREATE TYPE "person_type" AS ENUM ('employee', 'contractor', 'director', 'offshore_staff');

-- CreateEnum
CREATE TYPE "payroll_region" AS ENUM ('AU', 'NZ', 'UK');

-- CreateEnum
CREATE TYPE "xero_connection_status" AS ENUM ('pending', 'pending_tenant_selection', 'active', 'stale', 'disconnected');

-- CreateEnum
CREATE TYPE "xero_oauth_session_status" AS ENUM ('pending', 'completed', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "xero_person_match_status" AS ENUM ('pending', 'matched', 'ignored');

-- CreateEnum
CREATE TYPE "xero_sync_entity_type" AS ENUM ('people', 'leave_records', 'leave_balances');

-- CreateEnum
CREATE TYPE "sync_run_status" AS ENUM ('running', 'succeeded', 'partial_success', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "sync_run_type" AS ENUM ('people', 'leave_records', 'leave_balances', 'approval_state_reconciliation');

-- CreateEnum
CREATE TYPE "sync_trigger_type" AS ENUM ('scheduled', 'manual', 'webhook');

-- CreateEnum
CREATE TYPE "sync_failed_record_type" AS ENUM ('people', 'leave_records', 'leave_balances', 'approval_state_reconciliation', 'leave', 'annual_leave', 'personal_leave', 'holiday', 'sick_leave', 'long_service_leave', 'unpaid_leave', 'public_holiday', 'wfh', 'travel', 'travelling', 'training', 'client_site', 'another_office', 'offsite_meeting', 'contractor_unavailable', 'limited_availability', 'alternative_contact', 'other', 'leave_request');

-- CreateEnum
CREATE TYPE "availability_record_type" AS ENUM ('leave', 'annual_leave', 'personal_leave', 'holiday', 'sick_leave', 'long_service_leave', 'unpaid_leave', 'public_holiday', 'wfh', 'travel', 'travelling', 'training', 'client_site', 'another_office', 'offsite_meeting', 'contractor_unavailable', 'limited_availability', 'alternative_contact', 'other', 'leave_request');

-- CreateEnum
CREATE TYPE "availability_source_type" AS ENUM ('xero', 'xero_leave', 'leavesync_leave', 'manual');

-- CreateEnum
CREATE TYPE "availability_approval_status" AS ENUM ('draft', 'submitted', 'approved', 'declined', 'cancelled', 'withdrawn', 'xero_sync_failed');

-- CreateEnum
CREATE TYPE "availability_failed_action" AS ENUM ('submit', 'approve', 'decline', 'withdraw');

-- CreateEnum
CREATE TYPE "availability_privacy_mode" AS ENUM ('named', 'masked', 'private');

-- CreateEnum
CREATE TYPE "availability_contactability" AS ENUM ('contactable', 'limited', 'unavailable', 'use_alternative_contact');

-- CreateEnum
CREATE TYPE "availability_publish_status" AS ENUM ('eligible', 'suppressed', 'archived');

-- CreateEnum
CREATE TYPE "leave_balance_unit" AS ENUM ('hours', 'days');

-- CreateEnum
CREATE TYPE "feed_scope_rule_type" AS ENUM ('org', 'person', 'team', 'self', 'manager_team');

-- CreateEnum
CREATE TYPE "feed_status" AS ENUM ('active', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "feed_token_status" AS ENUM ('active', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('sync_failed', 'sync.reconciliation_complete', 'feed_token_rotated', 'privacy_conflict', 'missing_alternative_contact', 'leave_submitted', 'leave_approved', 'leave_declined', 'leave_info_requested', 'leave_xero_sync_failed', 'leave_withdrawn');

-- CreateEnum
CREATE TYPE "notification_email_status" AS ENUM ('queued', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "public_holiday_source" AS ENUM ('nager', 'manual');

-- CreateEnum
CREATE TYPE "public_holiday_type" AS ENUM ('public', 'bank', 'school', 'authorities', 'optional', 'observance', 'closure', 'custom');

-- CreateEnum
CREATE TYPE "public_holiday_assignment_scope_type" AS ENUM ('organisation', 'location', 'team', 'person', 'feed');

-- CreateEnum
CREATE TYPE "public_holiday_day_classification" AS ENUM ('non_working', 'working');

-- CreateEnum
CREATE TYPE "plan_limit_type" AS ENUM ('active_people', 'connections', 'feeds', 'organisations');

-- CreateTable
CREATE TABLE "organisations" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "region_code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT,
    "locale" TEXT,
    "fiscal_year_start" INTEGER,
    "working_hours_per_day" DECIMAL(4,2),
    "reporting_unit" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisation_settings" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "show_pending_on_calendar" BOOLEAN NOT NULL DEFAULT true,
    "show_declined_on_approvals" BOOLEAN NOT NULL DEFAULT true,
    "notify_managers_on_status_change" BOOLEAN NOT NULL DEFAULT true,
    "manager_visibility_scope" TEXT NOT NULL DEFAULT 'direct_reports_only',
    "default_leave_request_advance_days" INTEGER NOT NULL DEFAULT 0,
    "require_decline_reason" BOOLEAN NOT NULL DEFAULT true,
    "default_privacy_mode" "availability_privacy_mode" NOT NULL DEFAULT 'named',
    "feeds_include_public_holidays_default" BOOLEAN NOT NULL DEFAULT false,
    "default_feed_privacy_mode" "availability_privacy_mode" NOT NULL DEFAULT 'named',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisation_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "country_code" TEXT,
    "region_code" TEXT,
    "timezone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "team_id" UUID,
    "manager_person_id" UUID,
    "location_id" UUID,
    "person_type" "person_type",
    "source_system" "source_system" NOT NULL,
    "source_person_key" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "xero_employee_id" TEXT,
    "employment_type" "employment_type" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_name" TEXT,
    "clerk_user_id" TEXT,
    "job_title" TEXT,
    "start_date" TIMESTAMP(3),
    "avatar_url" TEXT,
    "status_note" TEXT,
    "default_contactability" "availability_contactability" NOT NULL DEFAULT 'contactable',
    "default_privacy_mode" "availability_privacy_mode" NOT NULL DEFAULT 'named',
    "include_in_feeds_by_default" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alternative_contacts" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alternative_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_connections" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "status" "xero_connection_status" NOT NULL DEFAULT 'pending',
    "access_token_encrypted" TEXT NOT NULL DEFAULT '',
    "access_token_iv" TEXT,
    "access_token_auth_tag" TEXT,
    "refresh_token_encrypted" TEXT NOT NULL DEFAULT '',
    "refresh_token_iv" TEXT,
    "refresh_token_auth_tag" TEXT,
    "token_key_version" INTEGER NOT NULL DEFAULT 1,
    "token_encrypted_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_refreshed_at" TIMESTAMP(3),
    "last_connected_at" TIMESTAMP(3),
    "last_disconnected_at" TIMESTAMP(3),
    "last_error_code" TEXT,
    "last_error_message" TEXT,
    "stale_since" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "disconnected_at" TIMESTAMP(3),
    "disconnected_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xero_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_tenants" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "xero_connection_id" UUID NOT NULL,
    "xero_tenant_id" TEXT NOT NULL,
    "tenant_name" TEXT,
    "payroll_region" "payroll_region" NOT NULL,
    "sync_paused_at" TIMESTAMP(3),
    "last_people_sync_at" TIMESTAMP(3),
    "last_leave_records_sync_at" TIMESTAMP(3),
    "last_leave_balances_sync_at" TIMESTAMP(3),
    "last_approval_state_reconciled_at" TIMESTAMP(3),
    "people_stale_since" TIMESTAMP(3),
    "leave_records_stale_since" TIMESTAMP(3),
    "leave_balances_stale_since" TIMESTAMP(3),
    "approval_state_stale_since" TIMESTAMP(3),
    "last_sync_error_code" TEXT,
    "last_sync_error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xero_tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_oauth_sessions" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID,
    "created_by_user_id" TEXT,
    "status" "xero_oauth_session_status" NOT NULL DEFAULT 'pending',
    "return_to" TEXT NOT NULL,
    "access_token_encrypted" TEXT NOT NULL DEFAULT '',
    "access_token_iv" TEXT,
    "access_token_auth_tag" TEXT,
    "refresh_token_encrypted" TEXT NOT NULL DEFAULT '',
    "refresh_token_iv" TEXT,
    "refresh_token_auth_tag" TEXT,
    "token_key_version" INTEGER NOT NULL DEFAULT 1,
    "token_encrypted_at" TIMESTAMP(3),
    "token_expires_at" TIMESTAMP(3) NOT NULL,
    "available_tenants_json" JSONB NOT NULL,
    "selected_tenant_id" TEXT,
    "selected_tenant_name" TEXT,
    "selected_payroll_region" "payroll_region",
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xero_oauth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_sync_cursors" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "xero_tenant_id" UUID NOT NULL,
    "entity_type" "xero_sync_entity_type" NOT NULL,
    "cursor_value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xero_sync_cursors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_records" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "record_type" "availability_record_type" NOT NULL,
    "source_type" "availability_source_type" NOT NULL,
    "source_remote_id" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "approval_status" "availability_approval_status" NOT NULL,
    "failed_action" "availability_failed_action",
    "privacy_mode" "availability_privacy_mode" NOT NULL,
    "contactability" "availability_contactability" NOT NULL,
    "include_in_feed" BOOLEAN NOT NULL DEFAULT true,
    "publish_status" "availability_publish_status" NOT NULL DEFAULT 'eligible',
    "source_payload_json" JSONB,
    "source_remote_hash" TEXT,
    "source_remote_version" TEXT,
    "source_last_modified_at" TIMESTAMP(3),
    "derived_uid_key" TEXT NOT NULL,
    "derived_sequence" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT,
    "all_day" BOOLEAN NOT NULL DEFAULT true,
    "notes_internal" TEXT,
    "working_location" TEXT,
    "preferred_contact_method" TEXT,
    "created_by_user_id" TEXT,
    "updated_by_user_id" TEXT,
    "archived_at" TIMESTAMP(3),
    "approval_note" TEXT,
    "approved_by_person_id" UUID,
    "approved_at" TIMESTAMP(3),
    "xero_write_error" TEXT,
    "xero_write_error_raw" JSONB,
    "submitted_at" TIMESTAMP(3),
    "withdrawn_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "availability_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_publications" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "availability_record_id" UUID NOT NULL,
    "published_uid" TEXT NOT NULL,
    "published_summary" TEXT NOT NULL,
    "published_description" TEXT,
    "published_all_day" BOOLEAN NOT NULL DEFAULT false,
    "published_sequence" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3) NOT NULL,
    "privacy_mode" "availability_privacy_mode" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "availability_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "xero_tenant_id" UUID,
    "leave_type_xero_id" TEXT NOT NULL,
    "leave_type_name" TEXT,
    "record_type" "availability_record_type",
    "balance" DECIMAL(12,4) NOT NULL,
    "balance_unit" "leave_balance_unit",
    "as_at" TIMESTAMP(3),
    "last_fetched_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_person_matches" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "xero_person_id" UUID NOT NULL,
    "candidate_person_id" UUID,
    "detected_reason" TEXT NOT NULL,
    "status" "xero_person_match_status" NOT NULL DEFAULT 'pending',
    "resolution_note" TEXT,
    "resolved_person_id" UUID,
    "resolved_clerk_user_id" TEXT,
    "resolved_by_user_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xero_person_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_holiday_jurisdictions" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "country_code" TEXT NOT NULL,
    "region_code" TEXT,
    "source" "public_holiday_source" NOT NULL DEFAULT 'nager',
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" TEXT,
    "updated_by_user_id" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_holiday_jurisdictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_holidays" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "jurisdiction_id" UUID,
    "source" "public_holiday_source" NOT NULL,
    "source_remote_id" TEXT,
    "country_code" TEXT NOT NULL,
    "region_code" TEXT,
    "holiday_date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "local_name" TEXT,
    "holiday_type" "public_holiday_type" NOT NULL,
    "default_classification" "public_holiday_day_classification" NOT NULL DEFAULT 'non_working',
    "notes_internal" TEXT,
    "source_payload_json" JSONB,
    "created_by_user_id" TEXT,
    "updated_by_user_id" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_holiday_assignments" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "public_holiday_id" UUID NOT NULL,
    "scope_type" "public_holiday_assignment_scope_type" NOT NULL,
    "scope_value" TEXT NOT NULL,
    "day_classification" "public_holiday_day_classification" NOT NULL DEFAULT 'non_working',
    "include_in_feeds" BOOLEAN NOT NULL DEFAULT true,
    "notes_internal" TEXT,
    "created_by_user_id" TEXT,
    "updated_by_user_id" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_holiday_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feeds" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "feed_status" NOT NULL DEFAULT 'active',
    "privacy_mode" "availability_privacy_mode" NOT NULL DEFAULT 'named',
    "includes_public_holidays" BOOLEAN NOT NULL DEFAULT false,
    "last_rendered_at" TIMESTAMP(3),
    "last_etag" TEXT,
    "created_by_user_id" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_scopes" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "feed_id" UUID NOT NULL,
    "scope_type" "feed_scope_rule_type" NOT NULL,
    "scope_value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_tokens" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "feed_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_hint" TEXT NOT NULL,
    "status" "feed_token_status" NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "rotated_from_token_id" UUID,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feed_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "recipient_user_id" TEXT NOT NULL,
    "recipient_person_id" UUID,
    "type" "notification_type" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "action_url" TEXT,
    "object_type" TEXT,
    "object_id" UUID,
    "actor_user_id" TEXT,
    "payload" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "notification_type" "notification_type" NOT NULL,
    "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_email_queue" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "notification_id" UUID,
    "recipient_user_id" TEXT NOT NULL,
    "notification_type" "notification_type" NOT NULL,
    "email_template" TEXT NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "action_url" TEXT,
    "unsubscribe_url" TEXT NOT NULL,
    "merge_data" JSONB,
    "status" "notification_email_status" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_email_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "xero_tenant_id" UUID,
    "status" "sync_run_status" NOT NULL DEFAULT 'running',
    "run_type" "sync_run_type" NOT NULL,
    "trigger_type" "sync_trigger_type" NOT NULL DEFAULT 'scheduled',
    "triggered_by_user_id" TEXT,
    "entity_type" "xero_sync_entity_type",
    "records_fetched" INTEGER NOT NULL DEFAULT 0,
    "records_upserted" INTEGER NOT NULL DEFAULT 0,
    "records_skipped" INTEGER NOT NULL DEFAULT 0,
    "records_synced" INTEGER NOT NULL DEFAULT 0,
    "records_failed" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "error_summary" TEXT,
    "cancel_requested_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failed_records" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "sync_run_id" UUID NOT NULL,
    "entity_type" "xero_sync_entity_type" NOT NULL,
    "record_type" "sync_failed_record_type" NOT NULL,
    "source_id" TEXT NOT NULL,
    "source_remote_id" TEXT,
    "error_code" TEXT NOT NULL DEFAULT 'unknown_error',
    "error_message" TEXT NOT NULL,
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "failed_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "actor_user_id" TEXT,
    "actor_display" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "metadata" JSONB,
    "payload" JSONB,
    "before_value" JSONB,
    "after_value" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_limits" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "limit_type" "plan_limit_type" NOT NULL,
    "limit_value" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clerk_org_subscriptions" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "plan_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "current_period_end" TIMESTAMP(3),
    "seats_purchased" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clerk_org_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_counters" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "metric_key" TEXT NOT NULL,
    "current_value" INTEGER NOT NULL DEFAULT 0,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organisations_clerk_org_id_idx" ON "organisations"("clerk_org_id");

-- CreateIndex
CREATE UNIQUE INDEX "organisation_settings_organisation_id_key" ON "organisation_settings"("organisation_id");

-- CreateIndex
CREATE INDEX "organisation_settings_clerk_org_id_idx" ON "organisation_settings"("clerk_org_id");

-- CreateIndex
CREATE INDEX "teams_clerk_org_id_idx" ON "teams"("clerk_org_id");

-- CreateIndex
CREATE INDEX "teams_organisation_id_idx" ON "teams"("organisation_id");

-- CreateIndex
CREATE INDEX "locations_clerk_org_id_idx" ON "locations"("clerk_org_id");

-- CreateIndex
CREATE INDEX "locations_organisation_id_idx" ON "locations"("organisation_id");

-- CreateIndex
CREATE INDEX "people_clerk_org_id_idx" ON "people"("clerk_org_id");

-- CreateIndex
CREATE INDEX "people_organisation_id_idx" ON "people"("organisation_id");

-- CreateIndex
CREATE INDEX "people_organisation_id_team_id_idx" ON "people"("organisation_id", "team_id");

-- CreateIndex
CREATE INDEX "people_organisation_id_manager_person_id_idx" ON "people"("organisation_id", "manager_person_id");

-- CreateIndex
CREATE INDEX "people_team_id_idx" ON "people"("team_id");

-- CreateIndex
CREATE INDEX "people_location_id_idx" ON "people"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "people_organisation_id_source_system_source_person_key_key" ON "people"("organisation_id", "source_system", "source_person_key");

-- CreateIndex
CREATE UNIQUE INDEX "people_organisation_id_clerk_user_id_key" ON "people"("organisation_id", "clerk_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "people_organisation_id_xero_employee_id_key" ON "people"("organisation_id", "xero_employee_id");

-- CreateIndex
CREATE INDEX "alternative_contacts_clerk_org_id_idx" ON "alternative_contacts"("clerk_org_id");

-- CreateIndex
CREATE INDEX "alternative_contacts_organisation_id_idx" ON "alternative_contacts"("organisation_id");

-- CreateIndex
CREATE INDEX "alternative_contacts_person_id_idx" ON "alternative_contacts"("person_id");

-- CreateIndex
CREATE INDEX "alternative_contacts_person_id_display_order_idx" ON "alternative_contacts"("person_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "xero_connections_organisation_id_key" ON "xero_connections"("organisation_id");

-- CreateIndex
CREATE INDEX "xero_connections_clerk_org_id_idx" ON "xero_connections"("clerk_org_id");

-- CreateIndex
CREATE UNIQUE INDEX "xero_tenants_xero_connection_id_key" ON "xero_tenants"("xero_connection_id");

-- CreateIndex
CREATE INDEX "xero_tenants_clerk_org_id_idx" ON "xero_tenants"("clerk_org_id");

-- CreateIndex
CREATE INDEX "xero_tenants_organisation_id_idx" ON "xero_tenants"("organisation_id");

-- CreateIndex
CREATE INDEX "xero_tenants_xero_tenant_id_idx" ON "xero_tenants"("xero_tenant_id");

-- CreateIndex
CREATE INDEX "xero_oauth_sessions_clerk_org_id_idx" ON "xero_oauth_sessions"("clerk_org_id");

-- CreateIndex
CREATE INDEX "xero_oauth_sessions_organisation_id_idx" ON "xero_oauth_sessions"("organisation_id");

-- CreateIndex
CREATE INDEX "xero_oauth_sessions_status_expires_at_idx" ON "xero_oauth_sessions"("status", "expires_at");

-- CreateIndex
CREATE INDEX "xero_sync_cursors_clerk_org_id_idx" ON "xero_sync_cursors"("clerk_org_id");

-- CreateIndex
CREATE INDEX "xero_sync_cursors_organisation_id_idx" ON "xero_sync_cursors"("organisation_id");

-- CreateIndex
CREATE INDEX "xero_sync_cursors_xero_tenant_id_idx" ON "xero_sync_cursors"("xero_tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "xero_sync_cursors_xero_tenant_id_entity_type_key" ON "xero_sync_cursors"("xero_tenant_id", "entity_type");

-- CreateIndex
CREATE INDEX "availability_records_clerk_org_id_idx" ON "availability_records"("clerk_org_id");

-- CreateIndex
CREATE INDEX "availability_records_organisation_id_idx" ON "availability_records"("organisation_id");

-- CreateIndex
CREATE INDEX "availability_records_person_id_starts_at_ends_at_idx" ON "availability_records"("person_id", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "availability_records_approved_by_person_id_idx" ON "availability_records"("approved_by_person_id");

-- CreateIndex
CREATE INDEX "availability_records_source_type_source_remote_id_idx" ON "availability_records"("source_type", "source_remote_id");

-- CreateIndex
CREATE INDEX "availability_records_organisation_id_publish_status_include_idx" ON "availability_records"("organisation_id", "publish_status", "include_in_feed");

-- CreateIndex
CREATE INDEX "availability_records_source_type_source_last_modified_at_idx" ON "availability_records"("source_type", "source_last_modified_at");

-- CreateIndex
CREATE UNIQUE INDEX "availability_records_source_identity_key" ON "availability_records"("organisation_id", "source_type", "source_remote_id");

-- CreateIndex
CREATE UNIQUE INDEX "availability_publications_availability_record_id_key" ON "availability_publications"("availability_record_id");

-- CreateIndex
CREATE INDEX "availability_publications_clerk_org_id_idx" ON "availability_publications"("clerk_org_id");

-- CreateIndex
CREATE INDEX "availability_publications_organisation_id_idx" ON "availability_publications"("organisation_id");

-- CreateIndex
CREATE INDEX "availability_publications_published_uid_idx" ON "availability_publications"("published_uid");

-- CreateIndex
CREATE INDEX "leave_balances_clerk_org_id_idx" ON "leave_balances"("clerk_org_id");

-- CreateIndex
CREATE INDEX "leave_balances_organisation_id_idx" ON "leave_balances"("organisation_id");

-- CreateIndex
CREATE INDEX "leave_balances_person_id_idx" ON "leave_balances"("person_id");

-- CreateIndex
CREATE INDEX "leave_balances_xero_tenant_id_idx" ON "leave_balances"("xero_tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_person_id_xero_tenant_id_leave_type_xero_id_key" ON "leave_balances"("person_id", "xero_tenant_id", "leave_type_xero_id");

-- CreateIndex
CREATE INDEX "xero_person_matches_clerk_org_id_idx" ON "xero_person_matches"("clerk_org_id");

-- CreateIndex
CREATE INDEX "xero_person_matches_organisation_id_idx" ON "xero_person_matches"("organisation_id");

-- CreateIndex
CREATE INDEX "xero_person_matches_xero_person_id_idx" ON "xero_person_matches"("xero_person_id");

-- CreateIndex
CREATE INDEX "xero_person_matches_candidate_person_id_idx" ON "xero_person_matches"("candidate_person_id");

-- CreateIndex
CREATE INDEX "xero_person_matches_status_created_at_idx" ON "xero_person_matches"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "xero_person_matches_source_candidate_key" ON "xero_person_matches"("xero_person_id", "candidate_person_id");

-- CreateIndex
CREATE INDEX "public_holiday_jurisdictions_clerk_org_id_idx" ON "public_holiday_jurisdictions"("clerk_org_id");

-- CreateIndex
CREATE INDEX "public_holiday_jurisdictions_organisation_id_idx" ON "public_holiday_jurisdictions"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "public_holiday_jurisdictions_organisation_id_country_code_r_key" ON "public_holiday_jurisdictions"("organisation_id", "country_code", "region_code");

-- CreateIndex
CREATE INDEX "public_holidays_clerk_org_id_idx" ON "public_holidays"("clerk_org_id");

-- CreateIndex
CREATE INDEX "public_holidays_organisation_id_holiday_date_idx" ON "public_holidays"("organisation_id", "holiday_date");

-- CreateIndex
CREATE INDEX "public_holidays_jurisdiction_id_idx" ON "public_holidays"("jurisdiction_id");

-- CreateIndex
CREATE UNIQUE INDEX "public_holidays_organisation_id_source_source_remote_id_key" ON "public_holidays"("organisation_id", "source", "source_remote_id");

-- CreateIndex
CREATE INDEX "public_holiday_assignments_clerk_org_id_idx" ON "public_holiday_assignments"("clerk_org_id");

-- CreateIndex
CREATE INDEX "public_holiday_assignments_organisation_id_idx" ON "public_holiday_assignments"("organisation_id");

-- CreateIndex
CREATE INDEX "public_holiday_assignments_public_holiday_id_idx" ON "public_holiday_assignments"("public_holiday_id");

-- CreateIndex
CREATE INDEX "public_holiday_assignments_scope_type_scope_value_idx" ON "public_holiday_assignments"("scope_type", "scope_value");

-- CreateIndex
CREATE UNIQUE INDEX "public_holiday_assignments_public_holiday_id_scope_type_sco_key" ON "public_holiday_assignments"("public_holiday_id", "scope_type", "scope_value");

-- CreateIndex
CREATE INDEX "feeds_clerk_org_id_idx" ON "feeds"("clerk_org_id");

-- CreateIndex
CREATE INDEX "feeds_organisation_id_idx" ON "feeds"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "feeds_clerk_org_id_slug_key" ON "feeds"("clerk_org_id", "slug");

-- CreateIndex
CREATE INDEX "feed_scopes_clerk_org_id_idx" ON "feed_scopes"("clerk_org_id");

-- CreateIndex
CREATE INDEX "feed_scopes_organisation_id_idx" ON "feed_scopes"("organisation_id");

-- CreateIndex
CREATE INDEX "feed_scopes_feed_id_idx" ON "feed_scopes"("feed_id");

-- CreateIndex
CREATE INDEX "feed_scopes_scope_type_scope_value_idx" ON "feed_scopes"("scope_type", "scope_value");

-- CreateIndex
CREATE UNIQUE INDEX "feed_tokens_token_hash_key" ON "feed_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "feed_tokens_clerk_org_id_idx" ON "feed_tokens"("clerk_org_id");

-- CreateIndex
CREATE INDEX "feed_tokens_organisation_id_idx" ON "feed_tokens"("organisation_id");

-- CreateIndex
CREATE INDEX "feed_tokens_feed_id_idx" ON "feed_tokens"("feed_id");

-- CreateIndex
CREATE INDEX "feed_tokens_rotated_from_token_id_idx" ON "feed_tokens"("rotated_from_token_id");

-- CreateIndex
CREATE INDEX "notifications_clerk_org_id_idx" ON "notifications"("clerk_org_id");

-- CreateIndex
CREATE INDEX "notifications_organisation_id_idx" ON "notifications"("organisation_id");

-- CreateIndex
CREATE INDEX "notifications_recipient_person_id_idx" ON "notifications"("recipient_person_id");

-- CreateIndex
CREATE INDEX "notifications_recipient_user_id_read_at_idx" ON "notifications"("recipient_user_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_user_id_created_at_idx" ON "notifications"("recipient_user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_organisation_id_recipient_user_id_created_at_idx" ON "notifications"("organisation_id", "recipient_user_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_preferences_clerk_org_id_idx" ON "notification_preferences"("clerk_org_id");

-- CreateIndex
CREATE INDEX "notification_preferences_organisation_id_idx" ON "notification_preferences"("organisation_id");

-- CreateIndex
CREATE INDEX "notification_preferences_user_id_idx" ON "notification_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_organisation_id_notificati_key" ON "notification_preferences"("user_id", "organisation_id", "notification_type");

-- CreateIndex
CREATE INDEX "notification_email_queue_clerk_org_id_idx" ON "notification_email_queue"("clerk_org_id");

-- CreateIndex
CREATE INDEX "notification_email_queue_organisation_id_idx" ON "notification_email_queue"("organisation_id");

-- CreateIndex
CREATE INDEX "notification_email_queue_notification_id_idx" ON "notification_email_queue"("notification_id");

-- CreateIndex
CREATE INDEX "notification_email_queue_recipient_user_id_status_idx" ON "notification_email_queue"("recipient_user_id", "status");

-- CreateIndex
CREATE INDEX "notification_email_queue_status_queued_at_idx" ON "notification_email_queue"("status", "queued_at");

-- CreateIndex
CREATE INDEX "sync_runs_clerk_org_id_idx" ON "sync_runs"("clerk_org_id");

-- CreateIndex
CREATE INDEX "sync_runs_organisation_id_idx" ON "sync_runs"("organisation_id");

-- CreateIndex
CREATE INDEX "sync_runs_organisation_id_started_at_idx" ON "sync_runs"("organisation_id", "started_at");

-- CreateIndex
CREATE INDEX "sync_runs_clerk_org_id_organisation_id_xero_tenant_id_run_t_idx" ON "sync_runs"("clerk_org_id", "organisation_id", "xero_tenant_id", "run_type", "status", "started_at");

-- CreateIndex
CREATE INDEX "failed_records_clerk_org_id_idx" ON "failed_records"("clerk_org_id");

-- CreateIndex
CREATE INDEX "failed_records_organisation_id_idx" ON "failed_records"("organisation_id");

-- CreateIndex
CREATE INDEX "failed_records_sync_run_id_idx" ON "failed_records"("sync_run_id");

-- CreateIndex
CREATE INDEX "failed_records_sync_run_id_created_at_idx" ON "failed_records"("sync_run_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_clerk_org_id_idx" ON "audit_events"("clerk_org_id");

-- CreateIndex
CREATE INDEX "audit_events_organisation_id_idx" ON "audit_events"("organisation_id");

-- CreateIndex
CREATE INDEX "audit_events_organisation_id_created_at_idx" ON "audit_events"("organisation_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_organisation_id_entity_id_idx" ON "audit_events"("organisation_id", "entity_id");

-- CreateIndex
CREATE INDEX "audit_events_organisation_id_action_created_at_id_idx" ON "audit_events"("organisation_id", "action", "created_at", "id");

-- CreateIndex
CREATE INDEX "audit_events_organisation_id_entity_type_created_at_id_idx" ON "audit_events"("organisation_id", "entity_type", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "plans_key_key" ON "plans"("key");

-- CreateIndex
CREATE INDEX "plan_limits_plan_id_idx" ON "plan_limits"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_limits_plan_id_limit_type_key" ON "plan_limits"("plan_id", "limit_type");

-- CreateIndex
CREATE UNIQUE INDEX "clerk_org_subscriptions_clerk_org_id_key" ON "clerk_org_subscriptions"("clerk_org_id");

-- CreateIndex
CREATE INDEX "clerk_org_subscriptions_clerk_org_id_idx" ON "clerk_org_subscriptions"("clerk_org_id");

-- CreateIndex
CREATE INDEX "usage_counters_clerk_org_id_idx" ON "usage_counters"("clerk_org_id");

-- CreateIndex
CREATE UNIQUE INDEX "usage_counters_clerk_org_id_metric_key_period_start_period__key" ON "usage_counters"("clerk_org_id", "metric_key", "period_start", "period_end");

-- AddForeignKey
ALTER TABLE "organisation_settings" ADD CONSTRAINT "organisation_settings_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_manager_person_id_fkey" FOREIGN KEY ("manager_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alternative_contacts" ADD CONSTRAINT "alternative_contacts_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alternative_contacts" ADD CONSTRAINT "alternative_contacts_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_connections" ADD CONSTRAINT "xero_connections_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_tenants" ADD CONSTRAINT "xero_tenants_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_tenants" ADD CONSTRAINT "xero_tenants_xero_connection_id_fkey" FOREIGN KEY ("xero_connection_id") REFERENCES "xero_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_oauth_sessions" ADD CONSTRAINT "xero_oauth_sessions_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_sync_cursors" ADD CONSTRAINT "xero_sync_cursors_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_sync_cursors" ADD CONSTRAINT "xero_sync_cursors_xero_tenant_id_fkey" FOREIGN KEY ("xero_tenant_id") REFERENCES "xero_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_records" ADD CONSTRAINT "availability_records_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_records" ADD CONSTRAINT "availability_records_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_records" ADD CONSTRAINT "availability_records_approved_by_person_id_fkey" FOREIGN KEY ("approved_by_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_publications" ADD CONSTRAINT "availability_publications_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_publications" ADD CONSTRAINT "availability_publications_availability_record_id_fkey" FOREIGN KEY ("availability_record_id") REFERENCES "availability_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_xero_tenant_id_fkey" FOREIGN KEY ("xero_tenant_id") REFERENCES "xero_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_person_matches" ADD CONSTRAINT "xero_person_matches_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_person_matches" ADD CONSTRAINT "xero_person_matches_xero_person_id_fkey" FOREIGN KEY ("xero_person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_person_matches" ADD CONSTRAINT "xero_person_matches_candidate_person_id_fkey" FOREIGN KEY ("candidate_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_person_matches" ADD CONSTRAINT "xero_person_matches_resolved_person_id_fkey" FOREIGN KEY ("resolved_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_holiday_jurisdictions" ADD CONSTRAINT "public_holiday_jurisdictions_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_holidays" ADD CONSTRAINT "public_holidays_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_holidays" ADD CONSTRAINT "public_holidays_jurisdiction_id_fkey" FOREIGN KEY ("jurisdiction_id") REFERENCES "public_holiday_jurisdictions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_holiday_assignments" ADD CONSTRAINT "public_holiday_assignments_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_holiday_assignments" ADD CONSTRAINT "public_holiday_assignments_public_holiday_id_fkey" FOREIGN KEY ("public_holiday_id") REFERENCES "public_holidays"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feeds" ADD CONSTRAINT "feeds_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_scopes" ADD CONSTRAINT "feed_scopes_feed_id_fkey" FOREIGN KEY ("feed_id") REFERENCES "feeds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_tokens" ADD CONSTRAINT "feed_tokens_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_tokens" ADD CONSTRAINT "feed_tokens_feed_id_fkey" FOREIGN KEY ("feed_id") REFERENCES "feeds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_tokens" ADD CONSTRAINT "feed_tokens_rotated_from_token_id_fkey" FOREIGN KEY ("rotated_from_token_id") REFERENCES "feed_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_person_id_fkey" FOREIGN KEY ("recipient_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_email_queue" ADD CONSTRAINT "notification_email_queue_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_email_queue" ADD CONSTRAINT "notification_email_queue_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_xero_tenant_id_fkey" FOREIGN KEY ("xero_tenant_id") REFERENCES "xero_tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failed_records" ADD CONSTRAINT "failed_records_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failed_records" ADD CONSTRAINT "failed_records_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "sync_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_limits" ADD CONSTRAINT "plan_limits_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clerk_org_subscriptions" ADD CONSTRAINT "clerk_org_subscriptions_plan_key_fkey" FOREIGN KEY ("plan_key") REFERENCES "plans"("key") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CreateIndex (raw SQL: partial unique for admin-managed manual leave balances)
-- Guards manual balances where xero_tenant_id IS NULL; the composite unique above
-- does not, because PostgreSQL treats NULL as distinct.
CREATE UNIQUE INDEX "leave_balances_person_id_leave_type_xero_id_manual_key" ON "leave_balances"("person_id", "leave_type_xero_id") WHERE "xero_tenant_id" IS NULL;

-- CreateIndex (raw SQL: partial unique guarding manual availability records)
-- Prevents duplicate manual rows (source_remote_id IS NULL); archived rows excluded
-- so a record can be recreated after soft-delete.
CREATE UNIQUE INDEX "availability_records_manual_identity_key" ON "availability_records"("organisation_id", "person_id", "record_type", "starts_at", "ends_at") WHERE "source_type" = 'manual' AND "source_remote_id" IS NULL AND "archived_at" IS NULL;
