import { DemoTeamCalendar } from "../../components/demo-team-calendar";

export const TeamTimelineSection = () => (
  <section className="fmkt-timeline" id="team-timeline">
    <div className="fmkt-container">
      <h2 className="fmkt-section-title">
        See who is in, who is out and where they are.
      </h2>
      <p className="fmkt-timeline__lead">
        Sage entries arrive from Xero Payroll the moment they are approved.
        Purple entries are manual: working from home, client site, training.
        Select any entry for details.
      </p>
      <DemoTeamCalendar />
    </div>
  </section>
);
