import {
  Field,
  FieldDescription,
  FieldLabel,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system";

const LeaveTypeItems = () => (
  <SelectContent>
    <SelectGroup>
      <SelectLabel>Xero leave types</SelectLabel>
      <SelectItem value="annual">Annual leave</SelectItem>
      <SelectItem value="personal">Personal/carer's leave</SelectItem>
      <SelectItem value="long-service">Long service leave</SelectItem>
    </SelectGroup>
  </SelectContent>
);

export const WithLabel = () => (
  <Field className="w-72">
    <FieldLabel htmlFor="leave-type">Leave type</FieldLabel>
    <Select defaultValue="annual">
      <SelectTrigger className="w-full" id="leave-type">
        <SelectValue placeholder="Choose a leave type" />
      </SelectTrigger>
      <LeaveTypeItems />
    </Select>
    <FieldDescription>Balances are read from Xero Payroll.</FieldDescription>
  </Field>
);

export const Placeholder = () => (
  <Select>
    <SelectTrigger className="w-64">
      <SelectValue placeholder="Filter by team" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="kitchen">Kitchen</SelectItem>
      <SelectItem value="front-of-house">Front of house</SelectItem>
    </SelectContent>
  </Select>
);

export const Sizes = () => (
  <div className="flex items-center gap-3">
    <Select defaultValue="week">
      <SelectTrigger className="w-40" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="week">This week</SelectItem>
        <SelectItem value="month">This month</SelectItem>
      </SelectContent>
    </Select>
    <Select defaultValue="month">
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="week">This week</SelectItem>
        <SelectItem value="month">This month</SelectItem>
      </SelectContent>
    </Select>
  </div>
);

export const States = () => (
  <div className="flex items-center gap-3">
    <Select>
      <SelectTrigger aria-invalid className="w-52">
        <SelectValue placeholder="Choose a leave type" />
      </SelectTrigger>
      <LeaveTypeItems />
    </Select>
    <Select defaultValue="personal" disabled>
      <SelectTrigger className="w-52">
        <SelectValue />
      </SelectTrigger>
      <LeaveTypeItems />
    </Select>
  </div>
);
