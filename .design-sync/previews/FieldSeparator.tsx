import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@repo/design-system/components/ui/field";
import { Input } from "@repo/design-system/components/ui/input";

export const Default = () => (
  <FieldGroup className="w-80">
    <Field>
      <FieldLabel htmlFor="field-sep-name">Employee name</FieldLabel>
      <Input id="field-sep-name" defaultValue="Priya Nair" />
    </Field>
    <FieldSeparator>Leave details</FieldSeparator>
    <Field>
      <FieldLabel htmlFor="field-sep-days">Days requested</FieldLabel>
      <Input id="field-sep-days" type="number" defaultValue={5} />
    </Field>
  </FieldGroup>
);
