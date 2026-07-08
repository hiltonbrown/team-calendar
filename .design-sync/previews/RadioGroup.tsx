import { Label } from "@repo/design-system/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@repo/design-system/components/ui/radio-group";

export const LeaveTypeSelection = () => (
  <RadioGroup className="w-72" defaultValue="annual">
    <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-4 py-3">
      <RadioGroupItem id="leave-annual" value="annual" />
      <Label htmlFor="leave-annual">Annual leave</Label>
    </div>
    <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-4 py-3">
      <RadioGroupItem id="leave-sick" value="sick" />
      <Label htmlFor="leave-sick">Sick leave</Label>
    </div>
    <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-4 py-3">
      <RadioGroupItem id="leave-parental" value="parental" />
      <Label htmlFor="leave-parental">Parental leave</Label>
    </div>
  </RadioGroup>
);

export const ManagerVisibilityScope = () => (
  <RadioGroup className="max-w-sm" defaultValue="direct_reports_only">
    <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-4 py-3">
      <RadioGroupItem id="scope-direct" value="direct_reports_only" />
      <Label htmlFor="scope-direct">Direct reports only</Label>
    </div>
    <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-4 py-3">
      <RadioGroupItem id="scope-all" value="all_team_leave" />
      <Label htmlFor="scope-all">
        All team leave including indirect reports
      </Label>
    </div>
  </RadioGroup>
);

export const WithDisabledOption = () => (
  <RadioGroup className="w-72" defaultValue="submitted">
    <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-4 py-3">
      <RadioGroupItem id="status-submitted" value="submitted" />
      <Label htmlFor="status-submitted">Submitted</Label>
    </div>
    <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-4 py-3">
      <RadioGroupItem id="status-approved" value="approved" />
      <Label htmlFor="status-approved">Approved</Label>
    </div>
    <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-4 py-3 opacity-50">
      <RadioGroupItem disabled id="status-withdrawn" value="withdrawn" />
      <Label htmlFor="status-withdrawn">Withdrawn (locked)</Label>
    </div>
  </RadioGroup>
);
