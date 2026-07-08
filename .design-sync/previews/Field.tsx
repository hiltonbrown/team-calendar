import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@repo/design-system/components/ui/field";
import { Input } from "@repo/design-system/components/ui/input";

export const Default = () => (
  <Field className="w-80">
    <FieldLabel htmlFor="field-reason">Leave reason</FieldLabel>
    <Input id="field-reason" placeholder="e.g. Family holiday" />
    <FieldDescription>Visible to your manager during approval.</FieldDescription>
  </Field>
);

export const WithError = () => (
  <Field className="w-80" data-invalid="true">
    <FieldLabel htmlFor="field-start-date">Start date</FieldLabel>
    <Input id="field-start-date" aria-invalid defaultValue="" />
    <FieldError>Start date is required.</FieldError>
  </Field>
);

export const Horizontal = () => (
  <Field orientation="horizontal" className="w-96">
    <FieldContent>
      <FieldLabel htmlFor="field-approver">Approver</FieldLabel>
      <FieldDescription>Who reviews this leave request.</FieldDescription>
    </FieldContent>
    <div className="w-40 flex-none">
      <Input id="field-approver" defaultValue="Priya Nair" />
    </div>
  </Field>
);

export const Group = () => (
  <FieldGroup className="w-80">
    <Field>
      <FieldLabel htmlFor="field-group-name">Employee name</FieldLabel>
      <Input id="field-group-name" defaultValue="Priya Nair" />
    </Field>
    <Field>
      <FieldLabel htmlFor="field-group-days">Days requested</FieldLabel>
      <Input id="field-group-days" type="number" defaultValue={5} />
    </Field>
  </FieldGroup>
);
