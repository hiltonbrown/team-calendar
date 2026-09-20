"use client";

import { ArrowRight, Check, Layers, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import styles from "./analytics-demo.module.css";
import { departments, getCoverage, months } from "./analytics-demo-data";

const dateLabel = (value: string, weekday: "short" | "long" = "short") =>
  new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    weekday,
  }).format(new Date(`${value}T12:00:00Z`));

export const AnalyticsDemo = () => {
  const heatmapViewport = useRef<HTMLElement | null>(null);
  const [departmentId, setDepartmentId] = useState(departments[0].id);
  const [monthIndex, setMonthIndex] = useState(2);
  const [dayIndex, setDayIndex] = useState(2);
  const department =
    departments.find((item) => item.id === departmentId) ?? departments[0];
  const month = months[monthIndex];
  const snapshot = department.monthly[monthIndex];
  const coverage = getCoverage(department, monthIndex, dayIndex);
  const utilisation = Math.round(
    (snapshot.usedDays / snapshot.scheduledDays) * 100
  );
  const overlapDays = departments.flatMap((team) =>
    month.days.flatMap((_, day) =>
      getCoverage(team, monthIndex, day).overlap
        ? [{ day, departmentId: team.id }]
        : []
    )
  );
  const balancePoints = department.monthly.map((value, index) => ({
    x: 48 + index * 140,
    y: 140 - value.balanceDays,
  }));
  const balancePath = balancePoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  useEffect(() => {
    const viewport = heatmapViewport.current;
    const cell = viewport?.querySelector<HTMLButtonElement>(
      `button[data-selection="${departmentId}-${monthIndex}-${dayIndex}"]`
    );
    if (!(cell && viewport)) {
      return;
    }
    const cellBounds = cell.getBoundingClientRect();
    const viewportBounds = viewport.getBoundingClientRect();
    const labelWidth =
      viewport.querySelector("th")?.getBoundingClientRect().width ?? 0;
    if (cellBounds.right > viewportBounds.right) {
      viewport.scrollLeft += cellBounds.right - viewportBounds.right + 6;
    } else if (cellBounds.left < viewportBounds.left + labelWidth) {
      viewport.scrollLeft +=
        cellBounds.left - viewportBounds.left - labelWidth - 6;
    }
  }, [departmentId, monthIndex, dayIndex]);

  const nextOverlap = () => {
    const current = overlapDays.findIndex(
      (item) => item.departmentId === departmentId && item.day === dayIndex
    );
    const next = overlapDays[(current + 1) % overlapDays.length];
    if (next) {
      setDepartmentId(next.departmentId);
      setDayIndex(next.day);
    }
  };

  return (
    <section
      aria-labelledby="analytics-demo-title"
      className={styles.section}
      id="analytics"
    >
      <div className="fmkt-container">
        <div className={styles.intro}>
          <h2 id="analytics-demo-title">See where your team needs cover.</h2>
          <p>
            Explore leave patterns, spot overlapping absences and see how much
            of each team is available.
          </p>
        </div>
        <div className={styles.dashboard}>
          <div className={styles.toolbar}>
            <div className={styles.identity}>
              <Layers aria-hidden="true" size={20} />
              <strong>Team analytics</strong>
              <span>Illustrative data · Apr–Jun 2026</span>
            </div>
            <label className={styles.filter}>
              Department
              <select
                onChange={(event) => setDepartmentId(event.target.value)}
                value={departmentId}
              >
                {departments.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.analysis}>
            <div className={styles.trends}>
              <div className={styles.panelHeading}>
                <h3>Leave utilisation &amp; balance trends</h3>
                <span>
                  {department.name} · {department.people.length} people
                </span>
              </div>
              <div className={styles.charts}>
                <figure className={styles.chart}>
                  <figcaption>
                    Leave utilisation{" "}
                    <strong>
                      {utilisation}
                      <small>%</small>
                    </strong>
                  </figcaption>
                  <p>
                    {snapshot.usedDays} leave days / {snapshot.scheduledDays}{" "}
                    scheduled days in {month.label}
                  </p>
                  <div className={styles.bars}>
                    {department.monthly.map((value, index) => {
                      const percent = Math.round(
                        (value.usedDays / value.scheduledDays) * 100
                      );
                      return (
                        <button
                          aria-label={`${months[index].label}: ${percent}% leave utilisation`}
                          aria-pressed={monthIndex === index}
                          className={styles.barButton}
                          key={months[index].id}
                          onClick={() => setMonthIndex(index)}
                          type="button"
                        >
                          <span className={styles.barSpace}>
                            <span
                              className={styles.bar}
                              style={{ height: `${(percent / 30) * 100}%` }}
                            >
                              <span>{percent}%</span>
                            </span>
                          </span>
                          <span>{months[index].label.slice(0, 3)}</span>
                        </button>
                      );
                    })}
                  </div>
                  <span className={styles.chartHint}>
                    Select a month to explore its sample week.
                  </span>
                </figure>
                <figure className={styles.chart}>
                  <figcaption>
                    Leave balance{" "}
                    <strong>
                      {snapshot.balanceDays}
                      <small>days</small>
                    </strong>
                  </figcaption>
                  <p>Combined balance snapshot for {department.name}.</p>
                  <svg
                    aria-label={`Leave balance trend: ${department.monthly.map((value, index) => `${months[index].label} ${value.balanceDays} days`).join(", ")}`}
                    className={styles.balanceChart}
                    role="img"
                    viewBox="0 0 376 178"
                  >
                    <title>Leave balance trend in days</title>
                    {[0, 50, 100].map((value) => (
                      <g key={value}>
                        <line
                          className={styles.guide}
                          x1="38"
                          x2="350"
                          y1={140 - value}
                          y2={140 - value}
                        />
                        <text
                          className={styles.axisLabel}
                          x="0"
                          y={145 - value}
                        >
                          {value}
                        </text>
                      </g>
                    ))}
                    <path
                      className={styles.area}
                      d={`${balancePath} L 328 140 L 48 140 Z`}
                    />
                    <path className={styles.line} d={balancePath} />
                    {balancePoints.map((point, index) => (
                      <g key={months[index].id}>
                        <circle
                          className={
                            monthIndex === index
                              ? styles.activePoint
                              : styles.point
                          }
                          cx={point.x}
                          cy={point.y}
                          r={monthIndex === index ? 7 : 4}
                        />
                        <text
                          className={styles.valueLabel}
                          textAnchor="middle"
                          x={point.x}
                          y={point.y - 15}
                        >
                          {department.monthly[index].balanceDays}
                        </text>
                        <text
                          className={styles.axisLabel}
                          textAnchor="middle"
                          x={point.x}
                          y="169"
                        >
                          {months[index].label.slice(0, 3)}
                        </text>
                      </g>
                    ))}
                  </svg>
                  <span className={styles.chartHint}>
                    Sample snapshots, not calculated accruals.
                  </span>
                </figure>
              </div>
            </div>

            <aside
              aria-label="Absence clash and overlap detection"
              className={styles.overlap}
            >
              <div className={styles.panelHeading}>
                <h3>Absence clashes &amp; overlaps</h3>
                <span>{dateLabel(month.days[dayIndex], "long")}</span>
              </div>
              <div
                aria-atomic="true"
                aria-live="polite"
                className={styles.finding}
              >
                <span className="sr-only">
                  {dateLabel(month.days[dayIndex], "long")}.
                </span>
                <span
                  className={coverage.overlap ? styles.alert : styles.clear}
                >
                  {coverage.overlap ? (
                    <Users aria-hidden="true" size={17} />
                  ) : (
                    <Check aria-hidden="true" size={17} />
                  )}
                  {coverage.overlap
                    ? "Overlapping absences"
                    : "No overlapping absences"}
                </span>
                <strong>
                  {coverage.available} of {coverage.total} available
                </strong>
                <p>
                  {department.name} · {coverage.percent}% coverage
                </p>
                {coverage.absent.length ? (
                  <ul className={styles.people}>
                    {coverage.absent.map((person) => (
                      <li key={person.id}>
                        <span aria-hidden="true" className={styles.avatar}>
                          {person.name
                            .split(" ")
                            .map((part) => part[0])
                            .join("")}
                        </span>
                        <span>
                          <strong>{person.name}</strong>
                          <small>{person.kind}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.empty}>
                    Everyone in this team is available on this day.
                  </p>
                )}
              </div>
              <button
                className={styles.next}
                disabled={!overlapDays.length}
                onClick={nextOverlap}
                type="button"
              >
                Next overlap <ArrowRight aria-hidden="true" size={16} />
              </button>
            </aside>
          </div>

          <div className={styles.coverage}>
            <div className={styles.coverageHeading}>
              <div>
                <h3>Department &amp; team coverage</h3>
                <p>Select a cell to see who is away and update the trends.</p>
              </div>
              <span className={styles.week}>
                {dateLabel(month.days[0])} – {dateLabel(month.days[4])}, 2026
              </span>
            </div>
            <p className={styles.scrollHint}>
              Scroll across to compare all five days.
            </p>
            <section
              aria-label="Coverage heatmap, scroll to compare weekdays"
              className={styles.tableScroll}
              ref={heatmapViewport}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users need access to horizontal heatmap scrolling
              tabIndex={0}
            >
              <table className={styles.heatmap}>
                <thead>
                  <tr>
                    <th scope="col">Department</th>
                    {month.days.map((day) => (
                      <th key={day} scope="col">
                        {dateLabel(day)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {departments.map((team) => (
                    <tr key={team.id}>
                      <th scope="row">
                        <button
                          aria-pressed={team.id === departmentId}
                          className={styles.teamButton}
                          onClick={() => setDepartmentId(team.id)}
                          type="button"
                        >
                          {team.name}
                          <span>{team.people.length} people</span>
                        </button>
                      </th>
                      {month.days.map((day, index) => {
                        const cell = getCoverage(team, monthIndex, index);
                        const coverageTone =
                          cell.percent === 100 ? styles.full : styles.partial;
                        return (
                          <td key={day}>
                            <button
                              aria-label={`${team.name}, ${dateLabel(day, "long")}: ${cell.available} of ${cell.total} available${cell.overlap ? ", overlapping absences" : ""}`}
                              aria-pressed={
                                team.id === departmentId && index === dayIndex
                              }
                              className={`${styles.cell} ${cell.overlap ? styles.low : coverageTone}`}
                              data-selection={`${team.id}-${monthIndex}-${index}`}
                              onClick={() => {
                                setDepartmentId(team.id);
                                setDayIndex(index);
                              }}
                              type="button"
                            >
                              <strong>{cell.percent}%</strong>
                              <span>
                                {cell.available}/{cell.total} available
                              </span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <div className={styles.footnote}>
              <span>
                Coverage counts people available, including those working from
                home.
              </span>
              <span>
                <i className={styles.legendSwatch} /> Amber: two or more people
                away together.
              </span>
            </div>
          </div>
        </div>
        <p className={styles.disclaimer}>
          Interactive example with fictional team data. Balances in Team
          Calendar come from Xero Payroll.
        </p>
      </div>
    </section>
  );
};
