"use client";

import type {
  AvailabilityRecordSummary,
  PersonProfile,
} from "@repo/availability";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import { AlertTriangleIcon, LockIcon, RefreshCwIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  refreshBalancesAction,
  setManualBalanceAction,
} from "@/app/(authenticated)/people/_actions";
import { XeroSyncFailedState } from "@/components/states/xero-sync-failed-state";
import { formatLeaveBalance } from "@/lib/format-leave-balance";
import { withOrg } from "@/lib/navigation/org-url";
import type { PersonProfileTab } from "@/lib/navigation/person-profile-tab";
import { AlternativeContactsPanel } from "./alternative-contacts-panel";
import {
  PeopleProvenanceBadge,
  PeopleStatusChip,
} from "./people-status-provenance";

interface PersonProfileContentProps {
  balanceRefreshEnabled: boolean;
  canManageAlternativeContacts: boolean;
  canRefreshBalances: boolean;
  history: {
    nextCursor: string | null;
    records: AvailabilityRecordSummary[];
  };
  initialTab?: PersonProfileTab;
  organisationId: string;
  orgQueryValue: string | null;
  profile: PersonProfile;
}

const tabs: Array<{ label: string; value: PersonProfileTab }> = [
  { label: "Upcoming", value: "upcoming" },
  { label: "History", value: "history" },
  { label: "Balances", value: "balances" },
  { label: "Alternative contacts", value: "alternative_contacts" },
];

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This component composes a read-only modal surface with simple panel conditionals.
export function PersonProfileContent({
  balanceRefreshEnabled,
  canManageAlternativeContacts,
  canRefreshBalances,
  history,
  initialTab = "upcoming",
  organisationId,
  orgQueryValue,
  profile,
}: PersonProfileContentProps) {
  const [tab, setTab] = useState<PersonProfileTab>(initialTab);
  const [isPending, startTransition] = useTransition();
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const name = `${profile.header.firstName} ${profile.header.lastName}`.trim();
  const refreshDisabledReason = balanceRefreshDisabledReason({
    balanceRefreshEnabled,
    canRefreshBalances,
    hasActiveXeroConnection: profile.balances.hasActiveXeroConnection,
    xeroLinked: profile.balances.xeroLinked,
  });

  const refreshBalances = () => {
    if (refreshDisabledReason) {
      return;
    }
    startTransition(async () => {
      const result = await refreshBalancesAction({
        organisationId,
        personId: profile.header.id,
      });
      if (!result.ok) {
        setRefreshMessage(result.error.message);
        return;
      }
      setRefreshMessage(
        result.value.queued
          ? "Balance refresh queued."
          : refreshReasonLabel(result.value.reason)
      );
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex flex-col gap-5">
          <div className="flex items-start gap-4">
            <Avatar profile={profile} />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-2xl text-foreground tracking-tight">
                {name}
              </h2>
              <p className="text-muted-foreground text-sm">
                {profile.header.jobTitle ?? "No job title"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <PeopleStatusChip
                  label={profile.currentStatus.label}
                  statusKey={profile.currentStatus.statusKey}
                />
                <PeopleProvenanceBadge xeroLinked={profile.header.xeroLinked} />
                {profile.header.archivedAt ? (
                  <Badge variant="outline">Archived</Badge>
                ) : null}
              </div>
            </div>
          </div>

          {profile.xeroSyncFailedCount > 0 && (
            <XeroSyncFailedState
              message={`${profile.xeroSyncFailedCount} record${profile.xeroSyncFailedCount === 1 ? "" : "s"} need attention before Xero and Team Calendar are aligned.`}
              retrySlot={
                <Button asChild size="sm" variant="secondary">
                  <Link
                    href={withOrg(
                      `/plans?personId=${profile.header.id}&approvalStatus=xero_sync_failed`,
                      orgQueryValue
                    )}
                  >
                    View records
                  </Link>
                </Button>
              }
            />
          )}

          <div className="rounded-2xl bg-muted p-5">
            <h3 className="font-semibold text-sm">Core fields</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field
                label="Email"
                locked={profile.fieldOwnership.email === "xero"}
                value={profile.header.email}
              />
              <Field
                label="Person type"
                locked={false}
                value={labelForValue(profile.header.personType)}
              />
              <Field
                label="Start date"
                locked={profile.fieldOwnership.startDate === "xero"}
                value={
                  profile.header.startDate
                    ? formatDate(profile.header.startDate)
                    : "Not set"
                }
              />
              <Field
                label="Location"
                locked={false}
                value={profile.header.location?.name ?? "Unassigned"}
              />
              <Field
                label="Team"
                locked={false}
                value={profile.header.team?.name ?? "Unassigned"}
              />
              <Field
                label="Manager"
                locked={false}
                value={
                  profile.header.manager
                    ? `${profile.header.manager.firstName} ${profile.header.manager.lastName}`
                    : "Unassigned"
                }
              />
              <Field
                className="sm:col-span-2"
                label="Status note"
                locked={false}
                value={profile.header.statusNote || "No status note"}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {canRefreshBalances ? (
              <Button
                disabled={Boolean(refreshDisabledReason) || isPending}
                onClick={refreshBalances}
                title={refreshDisabledReason ?? undefined}
                type="button"
              >
                <RefreshCwIcon className="mr-2 size-4" />
                Refresh balances
              </Button>
            ) : null}
            <Button
              onClick={() =>
                setEditMessage("Profile editing is not yet available.")
              }
              type="button"
              variant="secondary"
            >
              Edit profile
            </Button>
            {editMessage ? (
              <span className="self-center text-muted-foreground text-sm">
                {editMessage}
              </span>
            ) : null}
            {refreshMessage ? (
              <span className="self-center text-muted-foreground text-sm">
                {refreshMessage}
              </span>
            ) : null}
          </div>
        </section>

        <aside className="rounded-2xl bg-muted p-5">
          <h3 className="font-semibold text-sm">Current status</h3>
          <div className="mt-4 space-y-3 text-sm">
            <Field
              label="Status"
              locked={false}
              value={profile.currentStatus.label}
            />
            {profile.currentStatus.activeRecord ? (
              <>
                <Field
                  label="Record"
                  locked={false}
                  value={labelForValue(
                    profile.currentStatus.activeRecord.recordType
                  )}
                />
                <Field
                  label="Dates"
                  locked={false}
                  value={formatDateRange(
                    profile.currentStatus.activeRecord.startsAt,
                    profile.currentStatus.activeRecord.endsAt
                  )}
                />
              </>
            ) : null}
            {profile.currentStatus.activePublicHoliday ? (
              <Field
                label="Holiday"
                locked={false}
                value={`${profile.currentStatus.activePublicHoliday.name}, ${formatDate(profile.currentStatus.activePublicHoliday.date)}`}
              />
            ) : null}
            <Field
              label="Contactability"
              locked={false}
              value={
                profile.currentStatus.contactabilityStatus
                  ? labelForValue(profile.currentStatus.contactabilityStatus)
                  : "Default"
              }
            />
          </div>
        </aside>
      </div>

      <section className="flex flex-col gap-4 rounded-2xl bg-muted p-5">
        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              className={`rounded-xl px-3 py-2 font-medium text-sm ${
                tab === item.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-container-high text-muted-foreground"
              }`}
              key={item.value}
              onClick={() => setTab(item.value)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "upcoming" && (
          <RecordList
            emptyLabel="No upcoming records"
            records={profile.upcomingRecords}
          />
        )}
        {tab === "history" && (
          <div className="flex flex-col gap-4">
            <RecordList
              emptyLabel="No archived or past records"
              records={history.records}
            />
            {history.nextCursor ? (
              <Button asChild variant="secondary">
                <Link
                  href={withOrg(
                    `/people/${profile.header.id}?tab=history&historyCursor=${history.nextCursor}`,
                    orgQueryValue
                  )}
                >
                  Load more history
                </Link>
              </Button>
            ) : null}
          </div>
        )}
        {tab === "balances" && (
          <BalancesPanel
            canEditManual={canRefreshBalances}
            organisationId={organisationId}
            orgQueryValue={orgQueryValue}
            profile={profile}
          />
        )}
        {tab === "alternative_contacts" && (
          <AlternativeContactsPanel
            canManage={canManageAlternativeContacts}
            contacts={profile.alternativeContacts}
            organisationId={organisationId}
            personId={profile.header.id}
          />
        )}
      </section>
    </div>
  );
}

function Avatar({ profile }: { profile: PersonProfile }) {
  const initials =
    `${profile.header.firstName[0] ?? ""}${profile.header.lastName[0] ?? ""}`.toUpperCase();
  if (profile.header.avatarUrl) {
    return (
      <span
        aria-hidden="true"
        className="block size-20 rounded-full bg-center bg-cover"
        style={{ backgroundImage: `url("${profile.header.avatarUrl}")` }}
      />
    );
  }
  return (
    <span className="flex size-20 shrink-0 items-center justify-center rounded-full bg-primary-container font-semibold text-2xl text-on-primary-container">
      {initials || "?"}
    </span>
  );
}

function Field({
  className,
  label,
  locked,
  value,
}: {
  className?: string;
  label: string;
  locked: boolean;
  value: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-widest">
        {label}
        {locked ? (
          <LockIcon aria-label="Xero-owned field" className="size-3" />
        ) : null}
      </div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}

function RecordList({
  emptyLabel,
  records,
}: {
  emptyLabel: string;
  records: AvailabilityRecordSummary[];
}) {
  if (records.length === 0) {
    return (
      <div className="rounded-2xl bg-surface-container-high p-6 text-muted-foreground text-sm">
        {emptyLabel}
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Record</TableHead>
          <TableHead>Dates</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.map((record) => (
          <TableRow key={record.id}>
            <TableCell>{labelForValue(record.recordType)}</TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {formatDateRange(record.startsAt, record.endsAt)}
            </TableCell>
            <TableCell>
              <Badge
                variant={
                  record.approvalStatus === "xero_sync_failed"
                    ? "destructive"
                    : "secondary"
                }
              >
                {record.approvalStatus === "xero_sync_failed" && (
                  <AlertTriangleIcon className="mr-1 size-3" />
                )}
                {labelForValue(record.approvalStatus)}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Balance ownership, role and connection states are intentionally resolved in one panel.
function BalancesPanel({
  canEditManual,
  organisationId,
  orgQueryValue,
  profile,
}: {
  canEditManual: boolean;
  organisationId: string;
  orgQueryValue: string | null;
  profile: PersonProfile;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    text: string;
    tone: "error" | "status";
  } | null>(null);
  const [balance, setBalance] = useState("");
  const [balanceUnit, setBalanceUnit] = useState<"days" | "hours">("hours");
  const [leaveTypeName, setLeaveTypeName] = useState("");
  const [leaveTypeXeroId, setLeaveTypeXeroId] = useState("");
  const showXeroBalances =
    profile.balances.xeroLinked && profile.balances.hasActiveXeroConnection;
  const showManualEditor = !profile.balances.hasActiveXeroConnection;

  const saveManualBalance = () => {
    if (!(canEditManual && showManualEditor)) {
      return;
    }
    if (!hasValidBalanceInput(balance)) {
      setMessage({
        text: "Enter a numeric balance before saving.",
        tone: "error",
      });
      return;
    }
    startTransition(async () => {
      const result = await setManualBalanceAction({
        balance: Number(balance),
        balanceUnit,
        leaveTypeName: leaveTypeName || null,
        leaveTypeXeroId,
        organisationId,
        personId: profile.header.id,
      });
      if (!result.ok) {
        setMessage({ text: result.error.message, tone: "error" });
        return;
      }
      setMessage({ text: "Manual balance saved.", tone: "status" });
    });
  };

  if (!(showXeroBalances || showManualEditor)) {
    return (
      <div className="rounded-2xl bg-surface-container-high p-6 text-sm">
        <p className="font-medium">This profile is not linked to Xero.</p>
        <p className="mt-1 text-muted-foreground">
          {canEditManual
            ? "Review Xero matches to link this person before refreshing balances."
            : "Ask an administrator to review the Xero match before balances can be shown."}
        </p>
        {canEditManual ? (
          <Button asChild className="mt-4" size="sm" variant="secondary">
            <Link
              href={withOrg(
                "/settings/integrations/xero/matches",
                orgQueryValue
              )}
            >
              Review Xero matches
            </Link>
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Leave type</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            {showManualEditor && canEditManual ? (
              <TableHead className="text-right">Edit</TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {profile.balances.rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.leaveTypeName ?? row.leaveTypeXeroId}</TableCell>
              <TableCell className="text-right">
                {formatLeaveBalance({
                  amount: row.balanceUnits,
                  currencyCode: row.currencyCode,
                  unit: row.unitType,
                })}
              </TableCell>
              {showManualEditor && canEditManual ? (
                <TableCell className="text-right">
                  <Button
                    onClick={() => {
                      setBalance(String(row.balanceUnits));
                      setBalanceUnit(
                        row.unitType === "days" ? "days" : "hours"
                      );
                      setLeaveTypeName(row.leaveTypeName ?? "");
                      setLeaveTypeXeroId(row.leaveTypeXeroId);
                    }}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    Edit
                  </Button>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {showXeroBalances ? (
        <p className="text-muted-foreground text-xs">
          Last refreshed:{" "}
          {profile.balances.balancesLastFetchedAt
            ? formatDateTime(profile.balances.balancesLastFetchedAt)
            : "Never refreshed"}
        </p>
      ) : null}
      {showManualEditor && canEditManual ? (
        <div className="grid gap-3 rounded-2xl bg-surface-container-high p-4 sm:grid-cols-[1fr_1fr_120px_120px_auto]">
          <label className="flex flex-col gap-1 text-xs">
            Leave type reference
            <input
              className="rounded-xl bg-background px-3 py-2 text-sm"
              onChange={(event) => setLeaveTypeXeroId(event.target.value)}
              value={leaveTypeXeroId}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Leave type name
            <input
              className="rounded-xl bg-background px-3 py-2 text-sm"
              onChange={(event) => setLeaveTypeName(event.target.value)}
              value={leaveTypeName}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Balance
            <input
              className="rounded-xl bg-background px-3 py-2 text-sm"
              inputMode="decimal"
              onChange={(event) => setBalance(event.target.value)}
              type="number"
              value={balance}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs" htmlFor="balance-unit">
            Unit
            <Select
              onValueChange={(value) =>
                setBalanceUnit(value === "days" ? "days" : "hours")
              }
              value={balanceUnit}
            >
              <SelectTrigger
                className="rounded-xl bg-background text-sm"
                id="balance-unit"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hours">Hours</SelectItem>
                <SelectItem value="days">Days</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <Button
            className="self-end"
            disabled={
              isPending ||
              !leaveTypeXeroId.trim() ||
              !hasValidBalanceInput(balance)
            }
            onClick={saveManualBalance}
            type="button"
          >
            Save
          </Button>
        </div>
      ) : null}
      {showManualEditor && !canEditManual && (
        <p className="text-muted-foreground text-xs">
          Only admins and owners can edit manual balances.
        </p>
      )}
      {message ? (
        <p
          aria-live={message.tone === "error" ? "assertive" : "polite"}
          className={
            message.tone === "error"
              ? "text-destructive text-xs"
              : "text-muted-foreground text-xs"
          }
          role={message.tone === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

function hasValidBalanceInput(value: string): boolean {
  return value.trim() !== "" && Number.isFinite(Number(value));
}

function balanceRefreshDisabledReason(input: {
  balanceRefreshEnabled: boolean;
  canRefreshBalances: boolean;
  hasActiveXeroConnection: boolean;
  xeroLinked: boolean;
}): string | null {
  if (!input.canRefreshBalances) {
    return "Only admins and owners can refresh balances.";
  }
  if (!input.xeroLinked) {
    return "Balances can refresh only for Xero-linked people.";
  }
  if (!input.hasActiveXeroConnection) {
    return "Balances can refresh only when Xero is connected.";
  }
  if (!input.balanceRefreshEnabled) {
    return "Balance refresh is not yet enabled";
  }
  return null;
}

function refreshReasonLabel(reason?: string): string {
  if (reason === "job_not_registered") {
    return "Balance refresh is not yet enabled.";
  }
  if (reason === "not_xero_linked") {
    return "This person is not linked to Xero.";
  }
  if (reason === "xero_not_connected") {
    return "Xero is not connected.";
  }
  return "Balance refresh could not be queued.";
}

function labelForValue(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateRange(
  startsAt: Date | string,
  endsAt: Date | string
): string {
  const start = formatDate(startsAt);
  const end = formatDate(endsAt);
  return start === end ? start : `${start} to ${end}`;
}

function formatDate(value: Date | string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: Date | string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "long",
    timeZone: "Australia/Brisbane",
    year: "numeric",
  }).format(new Date(value));
}
