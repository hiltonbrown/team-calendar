import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";

const LEAVE_TYPE_OPTIONS = [
  { label: "Annual leave", value: "annual" },
  { label: "Sick leave", value: "sick" },
  { label: "Parental leave", value: "parental" },
  { label: "Unpaid leave", value: "unpaid" },
] as const;

export const LeaveTypePicker = () => (
  <div className="flex w-64 flex-col gap-2">
    <Label htmlFor="leave-type">Leave type</Label>
    <Select defaultValue="annual">
      <SelectTrigger className="w-full" id="leave-type">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LEAVE_TYPE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

export const GroupedByRegion = () => (
  <div className="flex w-64 flex-col gap-2">
    <Label htmlFor="xero-tenant">Xero organisation</Label>
    <Select defaultValue="acme-au">
      <SelectTrigger className="w-full" id="xero-tenant">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Australia</SelectLabel>
          <SelectItem value="acme-au">Acme Restaurants (AU)</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>New Zealand</SelectLabel>
          <SelectItem value="acme-nz">Acme Hospitality (NZ)</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  </div>
);

export const SmallSize = () => (
  <div className="flex w-64 flex-col gap-2">
    <Label htmlFor="employment-type">Employment type</Label>
    <Select defaultValue="contractor">
      <SelectTrigger className="w-full" id="employment-type" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="employee">Employee</SelectItem>
        <SelectItem value="contractor">Contractor</SelectItem>
        <SelectItem value="director">Director</SelectItem>
        <SelectItem value="offshore">Offshore staff</SelectItem>
      </SelectContent>
    </Select>
  </div>
);

export const DisabledState = () => (
  <div className="flex w-64 flex-col gap-2">
    <Label htmlFor="approver">Approver</Label>
    <Select defaultValue="locked" disabled>
      <SelectTrigger className="w-full" id="approver">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="locked">Assigned automatically</SelectItem>
      </SelectContent>
    </Select>
  </div>
);
