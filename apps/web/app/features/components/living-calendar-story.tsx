import { DemoTeamCalendar } from "../../components/demo-team-calendar";

export const LivingCalendarStory = () => (
  <section
    aria-labelledby="living-calendar-title"
    className="ft-story"
    id="leave-workflow"
  >
    <div className="fmkt-container">
      <div className="ft-story__intro">
        <h2 id="living-calendar-title">Explore a team’s week.</h2>
        <p>
          This demo combines leave from Xero Payroll with availability added in
          Team Calendar. Select an entry to see its dates, details and source.
        </p>
      </div>
      <DemoTeamCalendar />
    </div>
  </section>
);
