"use client";

import type {
  ClerkAccessReviewResult,
  ClerkAccessState,
  ClerkInvitationDispatchResult,
  PersonListItem,
} from "@repo/availability";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
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
import { useNotificationEvents } from "@repo/notifications/components/provider";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  Loader2Icon,
  SearchIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { dispatchManualSyncAction } from "@/app/(authenticated)/sync/_actions";
import {
  PeopleProvenanceBadge,
  PeopleStatusChip,
} from "@/components/people/people-status-provenance";
import { EmptyState } from "@/components/states/empty-state";
import { withOrg } from "@/lib/navigation/org-url";
import { useFilterParams } from "@/lib/url-state/use-filter-params";
import {
  inviteClerkAccessCandidatesAction,
  loadClerkAccessCandidatesAction,
} from "./_actions";
import { type PeopleFilterInput, PeopleFilterSchema } from "./_schemas";

interface FilterOption {
  id: string;
  name: string;
}

interface PeopleClientProps {
  canIncludeArchived: boolean;
  canManageClerkAccess?: boolean;
  filters: PeopleFilterInput;
  hasActiveXeroConnection: boolean;
  locations: FilterOption[];
  nextCursor: string | null;
  organisationId: string;
  orgQueryValue: string | null;
  people: PersonListItem[];
  teams: FilterOption[];
  totalCount: number;
  xeroTenantId: string | null;
}

const statusLabels: Record<string, string> = {
  alternative_contact: "Alternative contact",
  another_office: "Another office",
  available: "Available",
  client_site: "Client site",
  limited_availability: "Limited availability",
  offsite_meeting: "Offsite meeting",
  on_leave: "On leave",
  other: "Unavailable",
  pending_leave: "Leave pending",
  public_holiday: "Public holiday",
  training: "Training",
  travelling: "Travelling",
  wfh: "Working from home",
};

function renderEmptyState({
  canIncludeArchived,
  hasActiveXeroConnection,
  onSync,
  orgQueryValue,
  syncPending,
  totalCount,
  xeroTenantId,
}: {
  canIncludeArchived: boolean;
  hasActiveXeroConnection: boolean;
  onSync: () => void;
  orgQueryValue: string | null;
  syncPending: boolean;
  totalCount: number;
  xeroTenantId: string | null;
}) {
  if (totalCount === 0) {
    const canSync =
      canIncludeArchived && hasActiveXeroConnection && Boolean(xeroTenantId);
    return (
      <EmptyState
        actionSlot={
          <div className="flex flex-wrap gap-2">
            {canSync ? (
              <Button
                disabled={syncPending}
                onClick={onSync}
                type="button"
                variant="default"
              >
                Sync from Xero
              </Button>
            ) : null}
            {canIncludeArchived ? (
              <Button asChild variant="outline">
                <Link href={withOrg("/people/new", orgQueryValue)}>
                  Add person manually
                </Link>
              </Button>
            ) : null}
          </div>
        }
        description="No people have been added yet. Connect Xero to sync your employees, or add someone manually."
        title="No people yet"
      />
    );
  }
  return (
    <EmptyState
      description="No people match the current filters."
      title="No people found"
    />
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This directory coordinates role-gated sync, filters and responsive person rows in one URL-backed surface.
export function PeopleClient({
  canIncludeArchived,
  canManageClerkAccess = canIncludeArchived,
  filters,
  hasActiveXeroConnection,
  locations,
  nextCursor,
  organisationId,
  orgQueryValue,
  people,
  teams,
  totalCount,
  xeroTenantId,
}: PeopleClientProps) {
  const router = useRouter();
  const { subscribe } = useNotificationEvents();
  const [, setFilterParams] = useFilterParams(PeopleFilterSchema);
  const [search, setSearch] = useState(filters.search ?? "");
  const [isSyncPending, startSyncTransition] = useTransition();
  const [isAccessDialogOpen, setIsAccessDialogOpen] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{
    text: string;
    tone: "error" | "status";
  } | null>(null);
  const nextHref = useMemo(
    () =>
      peopleHref(
        { ...filters, cursor: nextCursor ?? undefined },
        orgQueryValue
      ),
    [filters, nextCursor, orgQueryValue]
  );
  const activeFilterLabels = useMemo(
    () => peopleActiveFilterLabels(filters, teams, locations),
    [filters, locations, teams]
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (search !== (filters.search ?? "")) {
        setFilterParams({ cursor: undefined, search });
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [filters.search, search, setFilterParams]);

  useEffect(
    () =>
      subscribe((event) => {
        if (
          event.type === "sync.run_status_changed" &&
          event.payload.organisationId === organisationId
        ) {
          router.refresh();
        }
      }),
    [organisationId, router, subscribe]
  );

  const handleSyncFromXero = () => {
    if (!xeroTenantId) {
      return;
    }
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: people sync handles queued/failed/succeeded branching
    startSyncTransition(async () => {
      try {
        const result = await dispatchManualSyncAction({
          organisationId,
          runType: "people",
          xeroTenantId,
        });
        if (!result.ok) {
          setSyncMessage({ text: result.error.message, tone: "error" });
          return;
        }
        if (!result.value.queued) {
          const { reason } = result.value as { reason?: string };
          let text = "This sync is not available yet.";
          if (reason === "connection_not_active") {
            text = "Reconnect Xero before running this sync.";
          } else if (reason === "dispatch_not_wired") {
            text = "This sync job is not registered yet.";
          } else if (reason === "tenant_sync_paused") {
            text = "Resume Xero syncing before running this sync.";
          }
          setSyncMessage({ text, tone: "error" });
          return;
        }
        const v = result.value as {
          errorSummary?: string | null;
          failed?: number;
          fetched?: number;
          status?: string;
          upserted?: number;
        };
        if (v.errorSummary) {
          setSyncMessage({ text: v.errorSummary, tone: "status" });
        } else if (
          typeof v.fetched === "number" ||
          typeof v.upserted === "number"
        ) {
          const parts: string[] = [];
          if (typeof v.fetched === "number") {
            parts.push(`${v.fetched} fetched`);
          }
          if (typeof v.upserted === "number") {
            parts.push(`${v.upserted} upserted`);
          }
          if (typeof v.failed === "number" && v.failed > 0) {
            parts.push(`${v.failed} failed`);
          }
          const detail = parts.length ? ` — ${parts.join(", ")}` : "";
          setSyncMessage({
            text: `Sync ${v.status ?? "completed"}${detail}.`,
            tone: v.failed && v.failed > 0 ? "error" : "status",
          });
        } else {
          setSyncMessage({ text: "Sync queued.", tone: "status" });
        }
        router.refresh();
      } catch (error) {
        setSyncMessage({
          text:
            error instanceof Error
              ? error.message
              : "Failed to sync from Xero.",
          tone: "error",
        });
      }
    });
  };

  return (
    <section className="flex flex-col gap-6">
      {syncMessage ? (
        <div
          aria-live={syncMessage.tone === "error" ? "assertive" : "polite"}
          className="rounded-2xl bg-muted px-4 py-3 text-sm"
          role={syncMessage.tone === "error" ? "alert" : "status"}
        >
          {syncMessage.text}
        </div>
      ) : null}
      <div className="rounded-2xl bg-muted p-6">
        <p className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
          Directory
        </p>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-semibold text-3xl text-foreground tracking-tight">
              People
            </h1>
            <p className="mt-2 text-muted-foreground text-sm">
              {totalCount} {totalCount === 1 ? "member" : "members"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-muted-foreground text-sm">
              Profiles, balances and availability status for this organisation.
            </p>
            {canIncludeArchived && hasActiveXeroConnection && xeroTenantId ? (
              <Button
                disabled={isSyncPending}
                onClick={handleSyncFromXero}
                size="sm"
                type="button"
                variant="default"
              >
                Sync from Xero
              </Button>
            ) : null}
            {canManageClerkAccess ? (
              <Button
                onClick={() => setIsAccessDialogOpen(true)}
                size="sm"
                type="button"
                variant="outline"
              >
                Reconcile Clerk access
              </Button>
            ) : null}
            {canIncludeArchived ? (
              <Button asChild size="sm" variant="outline">
                <Link href={withOrg("/people/new", orgQueryValue)}>
                  Add person
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <form
        className="grid gap-4 rounded-2xl bg-muted p-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,4fr)]"
        method="get"
      >
        {orgQueryValue ? (
          <input name="org" type="hidden" value={orgQueryValue} />
        ) : null}
        <FilterField label="Search">
          <div className="relative">
            <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              name="search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name or email"
              value={search}
            />
          </div>
        </FilterField>
        <details className="rounded-2xl bg-surface-container-low p-4">
          <summary className="cursor-pointer font-medium text-sm focus-visible:outline-[3px] focus-visible:outline-ring">
            More filters
            {activeFilterLabels.length > 0
              ? ` (${activeFilterLabels.length} active)`
              : ""}
          </summary>
          {activeFilterLabels.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {activeFilterLabels.map((label) => (
                <Badge key={label} variant="secondary">
                  {label}
                </Badge>
              ))}
            </div>
          ) : null}
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <FilterField label="Team">
              <Select defaultValue={filters.teamId?.[0] ?? "all"} name="teamId">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All teams</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="Location">
              <Select
                defaultValue={filters.locationId?.[0] ?? "all"}
                name="locationId"
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locations</SelectItem>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="Person type">
              <Select defaultValue={filters.personType} name="personType">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone</SelectItem>
                  <SelectItem value="employee">Employees</SelectItem>
                  <SelectItem value="contractor">Contractors</SelectItem>
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="Status">
              <Select defaultValue={filters.status?.[0] ?? "all"} name="status">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any status</SelectItem>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="Xero link">
              <Select defaultValue={filters.xeroLinked} name="xeroLinked">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any</SelectItem>
                  <SelectItem value="true">Linked</SelectItem>
                  <SelectItem value="false">Manual</SelectItem>
                </SelectContent>
              </Select>
            </FilterField>
            <div className="flex flex-wrap items-center gap-4 lg:col-span-5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  defaultChecked={filters.xeroSyncFailedOnly}
                  name="xeroSyncFailedOnly"
                  type="checkbox"
                  value="true"
                />
                Xero sync failed only
              </label>
              {canIncludeArchived ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    defaultChecked={filters.includeArchived}
                    name="includeArchived"
                    type="checkbox"
                    value="true"
                  />
                  Include archived
                </label>
              ) : null}
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit">Apply</Button>
              <Button asChild type="button" variant="ghost">
                <Link href={withOrg("/people", orgQueryValue)}>Clear</Link>
              </Button>
            </div>
          </div>
        </details>
      </form>

      {people.length === 0 ? (
        renderEmptyState({
          canIncludeArchived,
          hasActiveXeroConnection,
          onSync: handleSyncFromXero,
          orgQueryValue,
          syncPending: isSyncPending,
          totalCount,
          xeroTenantId,
        })
      ) : (
        <div className="rounded-2xl bg-muted">
          <table aria-label="People directory" className="block w-full">
            <thead className="hidden lg:block">
              <tr className="grid grid-cols-[1.4fr_1fr_1fr_1fr_0.9fr_0.8fr] gap-4 px-4 py-3 text-left text-muted-foreground text-xs">
                <th className="font-normal" scope="col">
                  Person
                </th>
                <th className="font-normal" scope="col">
                  Role
                </th>
                <th className="font-normal" scope="col">
                  Team
                </th>
                <th className="font-normal" scope="col">
                  Location
                </th>
                <th className="font-normal" scope="col">
                  Status
                </th>
                <th className="font-normal" scope="col">
                  Source
                </th>
              </tr>
            </thead>
            <tbody className="block space-y-3 p-3 pt-0">
              {people.map((person) => (
                <tr
                  className="grid gap-4 rounded-2xl bg-background/50 p-4 lg:grid-cols-[1.4fr_1fr_1fr_1fr_0.9fr_0.8fr] lg:items-center"
                  key={person.id}
                >
                  <td className="block">
                    <Link
                      className="flex items-center gap-3 rounded-xl focus-visible:outline-[3px] focus-visible:outline-ring"
                      href={withOrg(`/people/${person.id}`, orgQueryValue)}
                    >
                      <Avatar person={person} />
                      <span className="min-w-0">
                        <span className="block break-words text-foreground">
                          <span className="font-normal">
                            {person.firstName}
                          </span>{" "}
                          <span className="font-semibold">
                            {person.lastName}
                          </span>
                        </span>
                        <span className="block break-all text-muted-foreground text-xs">
                          {person.email}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <PeopleDatum label="Role">
                    {person.jobTitle ?? labelForPersonType(person.personType)}
                    {person.archivedAt ? (
                      <Badge className="ml-2" variant="outline">
                        Archived
                      </Badge>
                    ) : null}
                  </PeopleDatum>
                  <PeopleDatum label="Team">
                    {person.team?.name ?? "Unassigned"}
                  </PeopleDatum>
                  <PeopleDatum label="Location">
                    {locationLabel(person)}
                  </PeopleDatum>
                  <PeopleDatum label="Status">
                    <PeopleStatusChip
                      label={person.currentStatus.label}
                      statusKey={person.currentStatus.statusKey}
                    />
                  </PeopleDatum>
                  <PeopleDatum label="Source">
                    <div className="flex items-center gap-2">
                      <PeopleProvenanceBadge xeroLinked={person.xeroLinked} />
                      {person.xeroSyncFailedCount > 0 ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-xl bg-destructive/10 px-2 py-1 font-medium text-destructive text-xs"
                          title={`${person.xeroSyncFailedCount} failed record${person.xeroSyncFailedCount === 1 ? "" : "s"}`}
                        >
                          <AlertTriangleIcon
                            aria-hidden="true"
                            className="size-3"
                          />
                          {person.xeroSyncFailedCount}
                        </span>
                      ) : null}
                    </div>
                  </PeopleDatum>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor ? (
        <div className="flex justify-center">
          <Button asChild variant="secondary">
            <Link href={nextHref}>Load more</Link>
          </Button>
        </div>
      ) : null}

      {canManageClerkAccess ? (
        <ClerkAccessReviewDialog
          isOpen={isAccessDialogOpen}
          onClose={() => setIsAccessDialogOpen(false)}
          organisationId={organisationId}
        />
      ) : null}
    </section>
  );
}

export function ClerkAccessReviewDialog({
  isOpen,
  onClose,
  organisationId,
}: {
  isOpen: boolean;
  onClose: () => void;
  organisationId: string;
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewData, setReviewData] = useState<ClerkAccessReviewResult | null>(
    null
  );
  const [resultData, setResultData] =
    useState<ClerkInvitationDispatchResult | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await loadClerkAccessCandidatesAction({ organisationId });
      if (res.ok) {
        setReviewData(res.value);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load Clerk access review."
      );
    } finally {
      setIsLoading(false);
    }
  }, [organisationId]);

  useEffect(() => {
    if (isOpen) {
      setResultData(null);
      loadData();
    }
  }, [isOpen, loadData]);

  const handleInviteAndLink = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await inviteClerkAccessCandidatesAction({ organisationId });
      if (res.ok) {
        setResultData(res.value);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to invite candidates."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDone = () => {
    onClose();
    router.refresh();
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={isOpen}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reconcile Clerk access</DialogTitle>
          <DialogDescription>
            Link existing members and invite eligible payroll employees.
          </DialogDescription>
        </DialogHeader>

        <ReviewDialogBody
          error={error}
          isLoading={isLoading}
          resultData={resultData}
          reviewData={reviewData}
        />

        <DialogFooter className="gap-2 sm:justify-between">
          {resultData ? (
            <Button className="w-full sm:w-auto" onClick={handleDone}>
              Done
            </Button>
          ) : (
            <>
              <Button
                disabled={isSubmitting}
                onClick={onClose}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              {reviewData && !isLoading && !error ? (
                <Button
                  disabled={
                    isSubmitting ||
                    (reviewData.linkableCount === 0 &&
                      reviewData.invitableCount === 0)
                  }
                  onClick={handleInviteAndLink}
                  type="button"
                  variant="default"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2Icon className="mr-2 size-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Send invitations & link"
                  )}
                </Button>
              ) : null}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewDialogBody({
  error,
  isLoading,
  resultData,
  reviewData,
}: {
  error: string | null;
  isLoading: boolean;
  resultData: ClerkInvitationDispatchResult | null;
  reviewData: ClerkAccessReviewResult | null;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-muted-foreground text-sm">
          Loading member and invitation states...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-destructive text-sm">
        <div className="flex items-center gap-2 font-medium">
          <AlertCircleIcon className="size-4" />
          <span>Error</span>
        </div>
        <p className="mt-1">{error}</p>
      </div>
    );
  }

  if (resultData) {
    return (
      <div className="flex flex-col gap-4 py-4">
        <div className="rounded-xl bg-emerald-500/10 p-4 text-emerald-800 dark:text-emerald-300">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2Icon className="size-5" />
            <span>Reconciliation completed</span>
          </div>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm">
            <li>{resultData.linkedCount} existing accounts linked</li>
            <li>{resultData.succeededCount} invitations sent</li>
            {resultData.failedCount > 0 ? (
              <li className="font-medium text-destructive">
                {resultData.failedCount} invitations failed
              </li>
            ) : null}
          </ul>
        </div>
      </div>
    );
  }

  if (reviewData) {
    return (
      <div className="flex flex-col gap-4 py-2">
        <ReviewStatChips reviewData={reviewData} />
        <div className="rounded-xl bg-muted/60 p-3 text-muted-foreground text-xs">
          Invitations grant the{" "}
          <span className="font-medium text-foreground">viewer</span> role.
          One-to-one email matches will be linked to their Clerk account.
          Fallback addresses and conflicting emails are excluded.
        </div>
        <ReviewCandidateTable candidates={reviewData.candidates} />
      </div>
    );
  }

  return null;
}

function ReviewStatChips({
  reviewData,
}: {
  reviewData: ClerkAccessReviewResult;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      <div className="rounded-xl bg-muted p-3 text-center">
        <p className="font-semibold text-foreground text-lg">
          {reviewData.linkableCount}
        </p>
        <p className="text-muted-foreground text-xs">Linkable</p>
      </div>
      <div className="rounded-xl bg-muted p-3 text-center">
        <p className="font-semibold text-foreground text-lg">
          {reviewData.invitableCount}
        </p>
        <p className="text-muted-foreground text-xs">Invitable</p>
      </div>
      <div className="rounded-xl bg-muted p-3 text-center">
        <p className="font-semibold text-foreground text-lg">
          {reviewData.alreadyInvitedCount}
        </p>
        <p className="text-muted-foreground text-xs">Invited</p>
      </div>
      <div className="rounded-xl bg-muted p-3 text-center">
        <p className="font-semibold text-foreground text-lg">
          {reviewData.memberCount}
        </p>
        <p className="text-muted-foreground text-xs">Members</p>
      </div>
      <div className="rounded-xl bg-muted p-3 text-center">
        <p className="font-semibold text-foreground text-lg">
          {reviewData.conflictCount}
        </p>
        <p className="text-muted-foreground text-xs">Conflicts</p>
      </div>
    </div>
  );
}

function ReviewCandidateTable({
  candidates,
}: {
  candidates: ClerkAccessReviewResult["candidates"];
}) {
  return (
    <div className="max-h-60 overflow-y-auto rounded-xl border border-border/50">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Person</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>State</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {candidates.length === 0 ? (
            <TableRow>
              <TableCell
                className="text-center text-muted-foreground"
                colSpan={3}
              >
                No candidates found.
              </TableCell>
            </TableRow>
          ) : (
            candidates.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {c.email ?? "—"}
                </TableCell>
                <TableCell>
                  <CandidateStateBadge
                    conflictReason={c.conflictReason}
                    state={c.state}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function CandidateStateBadge({
  conflictReason,
  state,
}: {
  conflictReason: string | null;
  state: ClerkAccessState;
}) {
  switch (state) {
    case "linkable":
      return <Badge variant="secondary">Linkable</Badge>;
    case "invitable":
      return <Badge variant="default">Invitable</Badge>;
    case "already_invited":
      return <Badge variant="outline">Invited</Badge>;
    case "member":
      return <Badge variant="secondary">Member</Badge>;
    case "conflict":
      return (
        <Badge variant="destructive">
          {conflictReason ? conflictReason.replace(/_/g, " ") : "Conflict"}
        </Badge>
      );
    default:
      return null;
  }
}

function FilterField({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-2 block text-muted-foreground text-xs uppercase tracking-widest">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Avatar({ person }: { person: PersonListItem }) {
  const initials =
    `${person.firstName[0] ?? ""}${person.lastName[0] ?? ""}`.toUpperCase();
  if (person.avatarUrl) {
    return (
      <span
        aria-hidden="true"
        className="block size-11 rounded-full bg-center bg-cover"
        style={{ backgroundImage: `url("${person.avatarUrl}")` }}
      />
    );
  }
  return (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-container font-semibold text-on-primary-container text-sm">
      {initials || "?"}
    </span>
  );
}

function PeopleDatum({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <td className="block min-w-0 text-muted-foreground text-sm">
      <span className="mb-1 block text-xs lg:hidden">{label}</span>
      {children}
    </td>
  );
}

function locationLabel(person: PersonListItem): string {
  if (!person.location) {
    return "Unassigned";
  }
  const suffix = person.location.regionCode ?? person.location.countryCode;
  return suffix ? `${person.location.name} (${suffix})` : person.location.name;
}

function peopleActiveFilterLabels(
  filters: PeopleFilterInput,
  teams: FilterOption[],
  locations: FilterOption[]
): string[] {
  const labels: string[] = [];
  const team = teams.find((item) => item.id === filters.teamId?.[0]);
  if (team) {
    labels.push(`Team: ${team.name}`);
  }
  const location = locations.find(
    (item) => item.id === filters.locationId?.[0]
  );
  if (location) {
    labels.push(`Location: ${location.name}`);
  }
  if (filters.personType !== "all") {
    labels.push(labelForPersonType(filters.personType));
  }
  if (filters.status?.[0]) {
    labels.push(statusLabels[filters.status[0]] ?? filters.status[0]);
  }
  if (filters.xeroLinked !== "all") {
    labels.push(filters.xeroLinked === "true" ? "Xero linked" : "Manual");
  }
  if (filters.xeroSyncFailedOnly) {
    labels.push("Xero sync failed");
  }
  if (filters.includeArchived) {
    labels.push("Archived included");
  }
  return labels;
}

function labelForPersonType(personType: string): string {
  return personType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function peopleHref(
  filters: PeopleFilterInput,
  orgQueryValue: string | null
): string {
  const params = new URLSearchParams();
  if (filters.cursor) {
    params.set("cursor", filters.cursor);
  }
  if (filters.search) {
    params.set("search", filters.search);
  }
  if (filters.pageSize && filters.pageSize !== 50) {
    params.set("pageSize", String(filters.pageSize));
  }
  if (filters.personType && filters.personType !== "all") {
    params.set("personType", filters.personType);
  }
  if (filters.xeroLinked && filters.xeroLinked !== "all") {
    params.set("xeroLinked", filters.xeroLinked);
  }
  if (filters.includeArchived) {
    params.set("includeArchived", "true");
  }
  if (filters.xeroSyncFailedOnly) {
    params.set("xeroSyncFailedOnly", "true");
  }
  for (const teamId of filters.teamId ?? []) {
    params.append("teamId", teamId);
  }
  for (const locationId of filters.locationId ?? []) {
    params.append("locationId", locationId);
  }
  for (const status of filters.status ?? []) {
    params.append("status", status);
  }
  const href = `/people${params.toString() ? `?${params.toString()}` : ""}`;
  return withOrg(href, orgQueryValue);
}
