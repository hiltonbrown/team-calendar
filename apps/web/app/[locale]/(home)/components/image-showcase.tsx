import Image from "next/image";
import { SectionIntro } from "./section-intro";

export const ImageShowcase = () => (
  <section className="marketing-section marketing-story-panel marketing-story-panel--showcase">
    <SectionIntro
      copy="LeaveSync updates calendars automatically, so managers stop chasing spreadsheets and manual updates."
      eyebrow="How it works"
      title={
        <>
          Staff leave and availability,
          <br />
          kept current in calendars and payroll.
        </>
      }
    />
    <div className="marketing-showcase-grid">
      <article className="marketing-image-card marketing-image-card--wide">
        <div className="marketing-image-card__copy">
          <p className="marketing-overline">01 · Plan the week</p>
          <h3>One view of the whole team.</h3>
          <p>
            Working from home, travelling, training or on leave. Everything
            available at a glance.
          </p>
        </div>
        <div className="marketing-image-card__media">
          <Image
            alt="Manager planning across team scenarios"
            height={1024}
            src="/marketing/Image_5.png"
            width={1536}
          />
        </div>
      </article>

      <article className="marketing-image-card marketing-image-card--sage">
        <div className="marketing-image-card__media">
          <Image
            alt="A team member on leave while the calendar stays in sync"
            height={1536}
            src="/marketing/Image_6.png"
            width={1024}
          />
        </div>
        <div className="marketing-image-card__copy">
          <p className="marketing-overline">02 · Approve leave requests</p>
          <h3>Already in your calendar.</h3>
          <p>No second system to update, no reminder to send.</p>
        </div>
      </article>
    </div>

    <article className="marketing-calendar-card">
      <div>
        <p className="marketing-overline">03 · Calendar subscriptions</p>
        <h3>Team calendar</h3>
        <p>
          Outlook, Google, Apple and other calendar apps stay current.
          <br />
          Your team subscribes once and gets updates automatically.
        </p>
        <div className="marketing-feed-tags">
          {["Outlook", "Google", "Apple", "Other calendars"].map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </div>
      <div className="marketing-calendar-card__media">
        <Image
          alt=""
          height={1024}
          src="/marketing/week-planning.png"
          width={1536}
        />
      </div>
    </article>
  </section>
);
