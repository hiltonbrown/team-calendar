import { describe, expect, it } from "vitest";
import { departments, getCoverage, months } from "./analytics-demo-data";

describe("analytics demo data", () => {
  it("uses consecutive Monday to Friday dates in the labelled month", () => {
    for (const [monthIndex, month] of months.entries()) {
      expect(month.days).toHaveLength(5);
      for (const [dayIndex, isoDate] of month.days.entries()) {
        const date = new Date(`${isoDate}T12:00:00Z`);
        expect(date.getUTCFullYear()).toBe(2026);
        expect(date.getUTCMonth()).toBe(3 + monthIndex);
        expect(date.getUTCDay()).toBe(dayIndex + 1);
        expect(
          date.toLocaleDateString("en-AU", {
            month: "long",
            timeZone: "UTC",
            year: "numeric",
          })
        ).toBe(month.label);
      }
    }
  });

  it("detects the June Engineering and Sales overlaps", () => {
    const engineering = departments.find((entry) => entry.id === "engineering");
    const sales = departments.find((entry) => entry.id === "sales");
    if (!(engineering && sales)) {
      throw new Error("Expected sample departments");
    }
    expect(getCoverage(engineering, 2, 2)).toMatchObject({
      available: 2,
      overlap: true,
      percent: 50,
      total: 4,
    });
    expect(
      getCoverage(sales, 2, 4).absent.map((person) => person.name)
    ).toEqual(["Patrick Nolan", "Olivia Cooper"]);
    expect(getCoverage(engineering, 2, 0)).toMatchObject({
      absent: [],
      overlap: false,
      percent: 100,
    });
  });

  it("counts people once when their absence records overlap", () => {
    const sample = departments.find((entry) => entry.id === "engineering");
    if (!sample) {
      throw new Error("Expected Engineering sample");
    }
    const coverage = getCoverage(
      { ...sample, absences: [...sample.absences, ...sample.absences] },
      2,
      2
    );
    expect(coverage.absent).toHaveLength(2);
    expect(coverage.available).toBe(2);
  });

  it("keeps samples valid and coverage and utilisation within bounds", () => {
    for (const department of departments) {
      expect(department.monthly).toHaveLength(months.length);
      const personIds = new Set(department.people.map((person) => person.id));
      expect(personIds.size).toBe(department.people.length);
      for (const absence of department.absences) {
        expect(personIds.has(absence.personId)).toBe(true);
        expect(absence.monthIndex).toBeGreaterThanOrEqual(0);
        expect(absence.monthIndex).toBeLessThan(months.length);
        expect(absence.start).toBeGreaterThanOrEqual(0);
        expect(absence.end).toBeGreaterThanOrEqual(absence.start);
        expect(absence.end).toBeLessThan(5);
      }
      for (const [monthIndex, snapshot] of department.monthly.entries()) {
        const utilisation = (snapshot.usedDays / snapshot.scheduledDays) * 100;
        expect(utilisation).toBeGreaterThanOrEqual(0);
        expect(utilisation).toBeLessThanOrEqual(100);
        expect(snapshot.balanceDays).toBeGreaterThanOrEqual(0);
        const sampleMonth = monthIndex + 3;
        let weekdayCount = 0;
        for (let date = 1; date <= 31; date += 1) {
          const candidate = new Date(Date.UTC(2026, sampleMonth, date));
          if (
            candidate.getUTCMonth() === sampleMonth &&
            candidate.getUTCDay() >= 1 &&
            candidate.getUTCDay() <= 5
          ) {
            weekdayCount += 1;
          }
        }
        expect(snapshot.scheduledDays).toBe(
          weekdayCount * department.people.length
        );
        let sampleWeekLeaveDays = 0;
        for (let day = 0; day < 5; day += 1) {
          const coverage = getCoverage(department, monthIndex, day);
          sampleWeekLeaveDays += coverage.absent.length;
          expect(coverage.available + coverage.absent.length).toBe(
            coverage.total
          );
          expect(coverage.percent).toBeGreaterThanOrEqual(0);
          expect(coverage.percent).toBeLessThanOrEqual(100);
          expect(coverage.overlap).toBe(coverage.absent.length > 1);
        }
        expect(snapshot.usedDays).toBeGreaterThanOrEqual(sampleWeekLeaveDays);
      }
    }
  });
});
