"use client";

import type { OrganisationSettings } from "@repo/availability";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@repo/design-system/components/ui/radio-group";
import { toast } from "@repo/design-system/components/ui/sonner";
import { Switch } from "@repo/design-system/components/ui/switch";
import { useState, useTransition } from "react";
import {
  type SettingSaveState,
  SettingSaveStatus,
} from "../components/setting-save-status";
import { SettingsSectionHeader } from "../components/settings-section-header";
import {
  restoreLeaveApprovalDefaultsAction,
  updateLeaveApprovalSettingsAction,
} from "./_actions";

interface LeaveApprovalSettingsClientProps {
  organisationId: string;
  settings: OrganisationSettings;
}

export const LeaveApprovalSettingsClient = ({
  organisationId,
  settings,
}: LeaveApprovalSettingsClientProps) => {
  const [state, setState] = useState(settings);
  const [isPending, startTransition] = useTransition();
  const [saveState, setSaveState] = useState<Record<string, SettingSaveState>>(
    {}
  );

  const updatePatch = (
    key: string,
    patch: Partial<OrganisationSettings>,
    toastMessage = "Setting updated."
  ) => {
    const previous = state;
    const next = { ...state, ...patch };
    setState(next);
    setSaveState((current) => ({ ...current, [key]: "saving" }));

    startTransition(async () => {
      const result = await updateLeaveApprovalSettingsAction({
        organisationId,
        patch,
      });
      if (!result.ok) {
        setState(previous);
        setSaveState((current) => ({ ...current, [key]: "error" }));
        toast.error(result.error.message);
        return;
      }
      setSaveState((current) => ({ ...current, [key]: "saved" }));
      toast.success(toastMessage);
    });
  };

  const restoreDefaults = () => {
    setSaveState((current) => ({ ...current, restore: "saving" }));
    startTransition(async () => {
      const result = await restoreLeaveApprovalDefaultsAction({
        organisationId,
      });
      if (!result.ok) {
        setSaveState((current) => ({ ...current, restore: "error" }));
        toast.error(result.error.message);
        return;
      }
      setState({
        ...state,
        defaultFeedPrivacyMode: "named",
        defaultLeaveRequestAdvanceDays: 0,
        defaultPrivacyMode: "named",
        feedsIncludePublicHolidaysDefault: false,
        managerVisibilityScope: "direct_reports_only",
        notifyManagersOnStatusChange: true,
        requireDeclineReason: true,
        showDeclinedOnApprovals: true,
        showPendingOnCalendar: true,
      });
      setSaveState((current) => ({ ...current, restore: "saved" }));
      toast.success("Defaults restored.");
    });
  };

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        description="Each change is saved immediately and applied across approvals, planning, calendar, people, and analytics."
        title="Leave Approval"
      />

      <SettingsToggleCard
        checked={state.showPendingOnCalendar}
        description="Show submitted leave in calendar views before it is fully approved."
        disabled={isPending}
        id="show-pending-calendar"
        label="Show pending leave on calendar"
        onCheckedChange={(checked) =>
          updatePatch("showPendingOnCalendar", {
            showPendingOnCalendar: checked,
          })
        }
        saveState={saveState.showPendingOnCalendar ?? "idle"}
      />

      <SettingsToggleCard
        checked={state.showDeclinedOnApprovals}
        description="Include declined records in the default approvals view until a user applies their own filters."
        disabled={isPending}
        id="show-declined-approvals"
        label="Show declined records by default"
        onCheckedChange={(checked) =>
          updatePatch("showDeclinedOnApprovals", {
            showDeclinedOnApprovals: checked,
          })
        }
        saveState={saveState.showDeclinedOnApprovals ?? "idle"}
      />

      <SettingsToggleCard
        checked={state.notifyManagersOnStatusChange}
        description="Send manager notifications when leave approval status changes."
        disabled={isPending}
        id="notify-managers-status"
        label="Notify managers on status change"
        onCheckedChange={(checked) =>
          updatePatch("notifyManagersOnStatusChange", {
            notifyManagersOnStatusChange: checked,
          })
        }
        saveState={saveState.notifyManagersOnStatusChange ?? "idle"}
      />

      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle>Manager visibility scope</CardTitle>
          <CardDescription id="manager-visibility-description">
            Controls whether managers see only direct reports or indirect
            reports as well.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            aria-describedby="manager-visibility-description manager-visibility-status"
            className="space-y-3"
            disabled={isPending}
            onValueChange={(value) => {
              if (
                value === "direct_reports_only" ||
                value === "all_team_leave"
              ) {
                updatePatch("managerVisibilityScope", {
                  managerVisibilityScope: value,
                });
              }
            }}
            value={state.managerVisibilityScope}
          >
            <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-4 py-3">
              <RadioGroupItem
                id="manager-scope-direct"
                value="direct_reports_only"
              />
              <Label htmlFor="manager-scope-direct">Direct reports only</Label>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-4 py-3">
              <RadioGroupItem
                id="manager-scope-indirect"
                value="all_team_leave"
              />
              <Label htmlFor="manager-scope-indirect">
                All team leave including indirect reports
              </Label>
            </div>
          </RadioGroup>
          <SettingSaveStatus
            id="manager-visibility-status"
            state={saveState.managerVisibilityScope ?? "idle"}
          />
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle>Leave request advance days</CardTitle>
          <CardDescription id="advance-days-description">
            How many days in advance employees should submit leave. Zero means
            no minimum.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs space-y-2">
            <Label htmlFor="advance-days">Advance days</Label>
            <Input
              aria-describedby="advance-days-description advance-days-status"
              disabled={isPending}
              id="advance-days"
              min={0}
              onBlur={(event) =>
                updatePatch("defaultLeaveRequestAdvanceDays", {
                  defaultLeaveRequestAdvanceDays: Number(
                    event.target.value || 0
                  ),
                })
              }
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  defaultLeaveRequestAdvanceDays: Number(
                    event.target.value || 0
                  ),
                }))
              }
              type="number"
              value={state.defaultLeaveRequestAdvanceDays}
            />
            <SettingSaveStatus
              id="advance-days-status"
              state={saveState.defaultLeaveRequestAdvanceDays ?? "idle"}
            />
          </div>
        </CardContent>
      </Card>

      <SettingsToggleCard
        checked={state.requireDeclineReason}
        description="Decline reasons help employees understand decisions. Disabling this is not recommended."
        disabled={isPending}
        id="require-decline-reason"
        label="Require decline reason"
        onCheckedChange={(checked) =>
          updatePatch("requireDeclineReason", { requireDeclineReason: checked })
        }
        saveState={saveState.requireDeclineReason ?? "idle"}
      />

      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle>Default privacy mode</CardTitle>
          <CardDescription id="privacy-mode-description">
            Applies when new records are created without an explicit privacy
            choice.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            aria-describedby="privacy-mode-description privacy-mode-status"
            className="space-y-3"
            disabled={isPending}
            onValueChange={(value) => {
              if (
                value === "named" ||
                value === "masked" ||
                value === "private"
              ) {
                updatePatch("defaultPrivacyMode", {
                  defaultPrivacyMode: value,
                });
              }
            }}
            value={state.defaultPrivacyMode}
          >
            <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-4 py-3">
              <RadioGroupItem id="privacy-named" value="named" />
              <Label htmlFor="privacy-named">Named (visible to all)</Label>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-4 py-3">
              <RadioGroupItem id="privacy-masked" value="masked" />
              <Label htmlFor="privacy-masked">
                Masked (Team member shown to peers)
              </Label>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-4 py-3">
              <RadioGroupItem id="privacy-private" value="private" />
              <Label htmlFor="privacy-private">
                Private (Unavailable shown to peers)
              </Label>
            </div>
          </RadioGroup>
          <SettingSaveStatus
            id="privacy-mode-status"
            state={saveState.defaultPrivacyMode ?? "idle"}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <div className="text-right">
          <Button
            aria-describedby="restore-defaults-status"
            disabled={isPending}
            onClick={restoreDefaults}
            variant="ghost"
          >
            Restore defaults
          </Button>
          <SettingSaveStatus
            id="restore-defaults-status"
            state={saveState.restore ?? "idle"}
          />
        </div>
      </div>
    </div>
  );
};

function SettingsToggleCard({
  checked,
  description,
  disabled,
  id,
  label,
  onCheckedChange,
  saveState,
}: {
  checked: boolean;
  description: string;
  disabled: boolean;
  id: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
  saveState: SettingSaveState;
}) {
  return (
    <Card className="rounded-xl">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>
              <Label className="font-semibold text-base" htmlFor={id}>
                {label}
              </Label>
            </CardTitle>
            <CardDescription id={`${id}-description`}>
              {description}
            </CardDescription>
            <SettingSaveStatus id={`${id}-status`} state={saveState} />
          </div>
          <Switch
            aria-describedby={`${id}-description ${id}-status`}
            checked={checked}
            disabled={disabled}
            id={id}
            onCheckedChange={onCheckedChange}
          />
        </div>
      </CardHeader>
    </Card>
  );
}
