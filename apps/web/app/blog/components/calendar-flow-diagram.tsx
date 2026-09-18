import { ArrowDown, ArrowRight, CalendarDays, RefreshCw } from "lucide-react";
import styles from "../blog.module.css";

const destinations = ["Outlook", "Google Calendar", "Apple Calendar"];

export const CalendarFlowDiagram = () => (
  <figure className={styles.flowFigure}>
    <div className={styles.flowDiagram}>
      <div className={styles.flowNode}>
        <RefreshCw aria-hidden="true" size={21} />
        <span>Payroll source</span>
        <strong>Xero Payroll AU</strong>
        <small>Approved leave and balances</small>
      </div>
      <ArrowRight aria-hidden="true" className={styles.flowArrowDesktop} />
      <ArrowDown aria-hidden="true" className={styles.flowArrowMobile} />
      <div className={`${styles.flowNode} ${styles.flowNodePrimary}`}>
        <CalendarDays aria-hidden="true" size={21} />
        <span>Publication</span>
        <strong>Team Calendar</strong>
        <small>Scope and privacy applied</small>
      </div>
      <ArrowRight aria-hidden="true" className={styles.flowArrowDesktop} />
      <ArrowDown aria-hidden="true" className={styles.flowArrowMobile} />
      <div className={styles.flowNode}>
        <CalendarDays aria-hidden="true" size={21} />
        <span>Read-only subscribers</span>
        <strong>{destinations.join(" · ")}</strong>
        <small>Each app refreshes on its own schedule</small>
      </div>
    </div>
    <figcaption>
      Xero remains the payroll source. Team Calendar applies feed scope and
      privacy before calendar apps read the subscription.
    </figcaption>
  </figure>
);
