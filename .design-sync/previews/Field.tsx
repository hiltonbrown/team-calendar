import {
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  Input,
  RadioGroup,
  RadioGroupItem,
  Textarea,
} from "@repo/design-system";

export const Default = () => (
  <FieldGroup className="w-[380px]">
    <Field>
      <FieldLabel htmlFor="contact-name">Name</FieldLabel>
      <Input defaultValue="Tom Nguyen" id="contact-name" />
    </Field>
    <Field>
      <FieldLabel htmlFor="contact-email">Email</FieldLabel>
      <Input id="contact-email" placeholder="tom.nguyen@acme.com.au" type="email" />
      <FieldDescription>Used when you are away and someone needs a backup.</FieldDescription>
    </Field>
  </FieldGroup>
);

export const WithError = () => (
  <Field className="w-[380px]" data-invalid="true">
    <FieldLabel htmlFor="decline-reason">Reason for declining</FieldLabel>
    <Textarea aria-invalid="true" id="decline-reason" />
    <FieldError>Enter a reason so the employee knows what to change.</FieldError>
  </Field>
);

export const Horizontal = () => (
  <FieldGroup className="w-[380px]">
    <Field orientation="horizontal">
      <Checkbox defaultChecked id="include-holidays" />
      <FieldContent>
        <FieldLabel htmlFor="include-holidays">Include public holidays</FieldLabel>
        <FieldDescription>Add New South Wales holidays to this feed.</FieldDescription>
      </FieldContent>
    </Field>
    <Field orientation="horizontal">
      <Checkbox id="include-wfh" />
      <FieldContent>
        <FieldLabel htmlFor="include-wfh">Include working from home</FieldLabel>
        <FieldDescription>Show manual availability entries as well as leave.</FieldDescription>
      </FieldContent>
    </Field>
  </FieldGroup>
);

export const FieldSetWithChoices = () => (
  <FieldSet className="w-[420px]">
    <FieldLegend>Feed privacy</FieldLegend>
    <FieldDescription>Choose how leave appears to subscribers.</FieldDescription>
    <RadioGroup defaultValue="masked">
      <FieldLabel htmlFor="fs-named">
        <Field orientation="horizontal">
          <FieldContent>
            <div className="text-sm font-medium">Named</div>
            <FieldDescription>Names and leave types are visible.</FieldDescription>
          </FieldContent>
          <RadioGroupItem id="fs-named" value="named" />
        </Field>
      </FieldLabel>
      <FieldLabel htmlFor="fs-masked">
        <Field orientation="horizontal">
          <FieldContent>
            <div className="text-sm font-medium">Masked</div>
            <FieldDescription>Names are visible, leave shows as Away.</FieldDescription>
          </FieldContent>
          <RadioGroupItem id="fs-masked" value="masked" />
        </Field>
      </FieldLabel>
    </RadioGroup>
  </FieldSet>
);

export const WithSeparator = () => (
  <FieldGroup className="w-[380px]">
    <Field>
      <FieldLabel htmlFor="sep-first">First name</FieldLabel>
      <Input defaultValue="Priya" id="sep-first" />
    </Field>
    <FieldSeparator>Contact</FieldSeparator>
    <Field>
      <FieldLabel htmlFor="sep-phone">Mobile</FieldLabel>
      <Input defaultValue="0412 345 678" id="sep-phone" />
    </Field>
  </FieldGroup>
);
