import { createMetadata } from "@repo/seo/metadata";
import { AlertTriangle, Check, LifeBuoy, MapPin, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  helpCompletionChecks,
  helpLastReviewed,
  helpLaunchScope,
  helpPhases,
  helpSupport,
} from "../content";
import styles from "../help-centre.module.css";

export const metadata: Metadata = createMetadata({
  description:
    "An eight-step guide to setting up Team Calendar with Australian Xero Payroll and secure calendar feeds.",
  title: "AU onboarding guide - Help centre",
});

const GuidedOnboardingPage = () => (
  <main
    className={`fmkt-page ${styles.page}`}
    id="help-centre-main"
    tabIndex={-1}
  >
    <header className={styles.guideHero}>
      <div className={styles.guideWidth}>
        <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
          <ol>
            <li>
              <Link className="marketing-content-link" href="/help-centre">
                Help centre
              </Link>
            </li>
            <li aria-current="page">AU onboarding</li>
          </ol>
        </nav>
        <p className={styles.scope}>{helpLaunchScope}</p>
        <h1>Onboard your team in four verified phases.</h1>
        <p className={styles.lead}>
          Complete these eight steps in order. Stop at each expected result and
          resolve any mismatch before moving payroll data or widening a calendar
          audience.
        </p>

        <dl className={styles.guideFacts}>
          <div>
            <dt>For</dt>
            <dd>Owners, Admins, Managers and Viewers</dd>
          </div>
          <div>
            <dt>Before you start</dt>
            <dd>A Team Calendar invitation and Xero Payroll AU access</dd>
          </div>
          <div>
            <dt>Last reviewed</dt>
            <dd>{helpLastReviewed}</dd>
          </div>
        </dl>
      </div>
    </header>

    <div className={styles.guideLayout}>
      <nav aria-label="Onboarding phases" className={styles.phaseNavigation}>
        <p>Jump to phase</p>
        <ol>
          {helpPhases.map((phase) => (
            <li key={phase.id}>
              <a className="marketing-content-link" href={`#${phase.id}`}>
                <span>{phase.label}</span>
                {phase.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className={styles.procedure}>
        <ol className={styles.phaseList}>
          {helpPhases.map((phase) => (
            <li className={styles.phase} id={phase.id} key={phase.id}>
              <div className={styles.phaseHeading}>
                <p>{phase.label}</p>
                <h2>{phase.title}</h2>
                <span className={styles.phaseDescription}>
                  {phase.description}
                </span>
              </div>

              <ol className={styles.stepList}>
                {phase.steps.map((step) => (
                  <li
                    className={styles.step}
                    id={step.anchor}
                    key={step.anchor}
                  >
                    <div className={styles.stepHeading}>
                      <h3>{step.title}</h3>
                      <div className={styles.roles}>
                        <Users aria-hidden="true" size={15} />
                        {step.roles.map((role) => (
                          <span className={styles.roleChip} key={role}>
                            {role}
                          </span>
                        ))}
                      </div>
                    </div>

                    {step.productPath ? (
                      <p className={styles.productPath}>
                        In Team Calendar: <code>{step.productPath}</code>
                      </p>
                    ) : null}

                    <div className={styles.instruction}>
                      <h4>What to do</h4>
                      <p>{step.action}</p>
                    </div>

                    <div className={styles.receipt}>
                      <Check aria-hidden="true" size={18} />
                      <div>
                        <h4>Success looks like</h4>
                        <p>{step.expectedResult}</p>
                      </div>
                    </div>

                    {step.caution ? (
                      <div className={styles.caution}>
                        <AlertTriangle aria-hidden="true" size={18} />
                        <div>
                          <h4>Check before continuing</h4>
                          <p>{step.caution}</p>
                        </div>
                      </div>
                    ) : null}

                    {step.troubleshooting ? (
                      <div className={styles.troubleshooting}>
                        <LifeBuoy aria-hidden="true" size={18} />
                        <div>
                          <h4>If this does not match</h4>
                          <p>{step.troubleshooting}</p>
                        </div>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>

        <section
          aria-labelledby="completion-heading"
          className={styles.completion}
        >
          <MapPin aria-hidden="true" size={24} />
          <div>
            <p className={styles.eyebrow}>Completion receipt</p>
            <h2 id="completion-heading">Your launch path is ready when:</h2>
            <ul>
              {helpCompletionChecks.map((check) => (
                <li key={check}>
                  <Check aria-hidden="true" size={16} /> {check}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <aside className={styles.guideSupport}>
          <h2>Escalate an unresolved issue</h2>
          <p>
            Email {helpSupport.email} during {helpSupport.hours}. Include the
            organisation name, affected person or feed name, and the visible
            receipt or error. Never include a subscribe URL.
          </p>
          <a
            className={`marketing-content-link ${styles.primaryLink}`}
            href={helpSupport.mailtoHref}
          >
            Contact support
          </a>
        </aside>
      </div>
    </div>
  </main>
);

export default GuidedOnboardingPage;
