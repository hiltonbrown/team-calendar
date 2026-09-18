import { render } from "@react-email/render";
import { NotificationEmailTemplate } from "../../../packages/email/templates/notification";

const actionUrl = "https://app.teamcalendar.test/notifications";
const unsubscribeUrl =
  "https://app.teamcalendar.test/notifications?tab=preferences";
const html = await render(
  <NotificationEmailTemplate
    actionUrl={actionUrl}
    body="A controlled leave request needs review."
    title="Leave submitted for approval"
    unsubscribeUrl={unsubscribeUrl}
  />
);

const assertions = [
  [html.trim().length > 500, "rendered markup is unexpectedly empty"],
  [html.includes(actionUrl), "action link is missing"],
  [html.includes(unsubscribeUrl), "preferences link is missing"],
  [!html.includes("{{"), "rendered markup contains an unresolved value"],
] as const;
for (const [passes, message] of assertions) {
  if (!passes) {
    throw new Error(message);
  }
}
console.log(JSON.stringify({ bytes: html.length, links: 2, rendered: true }));
