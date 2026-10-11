import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Switch,
} from "@repo/design-system";

export const States = () => (
  <div className="flex items-center gap-6">
    <Switch aria-label="Off" />
    <Switch aria-label="On" defaultChecked />
    <Switch aria-label="Disabled" disabled />
    <Switch aria-label="Disabled on" defaultChecked disabled />
  </div>
);

export const SettingsList = () => (
  <FieldGroup className="w-[420px]">
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor="notify-approvals">Approval emails</FieldLabel>
        <FieldDescription>Email me when a request needs my approval.</FieldDescription>
      </FieldContent>
      <Switch defaultChecked id="notify-approvals" />
    </Field>
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor="share-feed">Publish to team feed</FieldLabel>
        <FieldDescription>Show my leave on the shared team calendar.</FieldDescription>
      </FieldContent>
      <Switch id="share-feed" />
    </Field>
  </FieldGroup>
);
