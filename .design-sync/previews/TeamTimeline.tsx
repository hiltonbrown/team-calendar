import {
  TeamTimeline,
  type TeamTimelineBlock,
  type TeamTimelineDay,
  type TeamTimelineRowProps,
} from "@repo/design-system";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const buildDays = (
  firstDate: number,
  month: string,
  monthNumber: string,
  extras: Record<number, Partial<TeamTimelineDay>> = {}
): TeamTimelineDay[] =>
  DOW.map((dow, index) => ({
    dateLabel: `${firstDate + index} ${month}`,
    dow,
    holidayName: null,
    isToday: false,
    key: `2026-${monthNumber}-${String(firstDate + index).padStart(2, "0")}`,
    ...extras[index],
  }));

const block = (
  person: string,
  values: Omit<TeamTimelineBlock, "ariaLabel" | "endIndex" | "durationLabel"> & {
    durationLabel?: string;
  }
): TeamTimelineBlock => ({
  ...values,
  ariaLabel: `${person}: ${values.label}, ${values.dateLabel}, ${values.provenanceLabel}`,
  durationLabel:
    values.durationLabel ?? (values.dayCount === 1 ? "1 day" : `${values.dayCount} days`),
  endIndex: values.startIndex + values.dayCount - 1,
});

const octoberRows: TeamTimelineRowProps[] = [
  {
    personId: "p-sarah",
    name: "Sarah Mitchell",
    initials: "SM",
    isSelf: true,
    secondary: "HR lead · Sydney",
    blocks: [
      block("Sarah Mitchell", {
        id: "b-1",
        label: "Annual leave",
        dateLabel: "Mon 5 to Wed 7 Oct",
        dayCount: 3,
        startIndex: 0,
        icon: "xero",
        tone: "xero",
        note: "Family trip to Hobart",
        provenanceLabel: "Synced from Xero",
      }),
      block("Sarah Mitchell", {
        id: "b-2",
        label: "Working from home",
        dateLabel: "Fri 9 Oct",
        dayCount: 1,
        startIndex: 4,
        icon: "home",
        tone: "manual",
        note: null,
        provenanceLabel: "Manual entry",
      }),
    ],
  },
  {
    personId: "p-tom",
    name: "Tom Nguyen",
    initials: "TN",
    isSelf: false,
    secondary: "Payroll officer · Melbourne",
    blocks: [
      block("Tom Nguyen", {
        id: "b-3",
        label: "Personal leave",
        dateLabel: "Tue 6 to Wed 7 Oct",
        dayCount: 2,
        startIndex: 1,
        icon: "leave_request",
        tone: "leave_request",
        note: "Awaiting manager approval",
        provenanceLabel: "Leave request",
      }),
      block("Tom Nguyen", {
        id: "b-4",
        label: "Client site, Geelong",
        dateLabel: "Thu 8 to Fri 9 Oct",
        dayCount: 2,
        startIndex: 3,
        icon: "client",
        tone: "manual",
        note: null,
        provenanceLabel: "Manual entry",
      }),
    ],
  },
  {
    personId: "p-priya",
    name: "Priya Shah",
    initials: "PS",
    isSelf: false,
    secondary: "Operations manager · Brisbane",
    blocks: [
      block("Priya Shah", {
        id: "b-5",
        label: "Busy",
        dateLabel: "Tue 6 Oct",
        dayCount: 1,
        startIndex: 1,
        icon: "private",
        tone: "private",
        note: null,
        provenanceLabel: "Private",
      }),
      block("Priya Shah", {
        id: "b-6",
        label: "Long service leave",
        dateLabel: "Wed 7 to Sun 11 Oct",
        dayCount: 5,
        startIndex: 2,
        icon: "xero",
        tone: "xero",
        note: null,
        provenanceLabel: "Synced from Xero",
      }),
    ],
  },
  {
    personId: "p-grace",
    name: "Grace Walker",
    initials: "GW",
    isSelf: false,
    secondary: "Finance analyst · Adelaide",
    blocks: [
      block("Grace Walker", {
        id: "b-7",
        label: "Training, Xero Payroll",
        dateLabel: "Mon 5 to Tue 6 Oct",
        dayCount: 2,
        startIndex: 0,
        icon: "training",
        tone: "manual",
        note: "Certified advisor course",
        provenanceLabel: "Manual entry",
      }),
      block("Grace Walker", {
        id: "b-8",
        label: "Travelling to Perth",
        dateLabel: "Thu 8 to Fri 9 Oct",
        dayCount: 2,
        startIndex: 3,
        icon: "travel",
        tone: "manual",
        note: null,
        provenanceLabel: "Manual entry",
      }),
    ],
  },
  {
    personId: "p-liam",
    name: "Liam O'Connor",
    initials: "LO",
    isSelf: false,
    secondary: "Store manager · Hobart",
    blocks: [],
  },
];

const navigation = {
  nextHref: "#week-2026-10-12",
  previousHref: "#week-2026-09-28",
  todayHref: "#today",
};

export const CurrentWeek = () => (
  <div style={{ width: 1100 }}>
    <TeamTimeline
      cornerLabel="My team"
      days={buildDays(5, "Oct", "10", {
        0: { holidayName: "Labour Day" },
        2: { isToday: true },
      })}
      footer="Showing 5 of 5 people in Head Office. Private entries show as Busy."
      isCurrentWeek
      navigation={navigation}
      rows={octoberRows}
      weekLabel="Mon 5 to Sun 11 Oct"
      weekSub="This week · 2026"
    />
  </div>
);

const quietRows: TeamTimelineRowProps[] = [
  {
    personId: "p-ava",
    name: "Ava Thompson",
    initials: "AT",
    isSelf: false,
    secondary: "Head chef · Fremantle",
    blocks: [
      block("Ava Thompson", {
        id: "q-1",
        label: "Annual leave",
        dateLabel: "Mon 28 Sep to Fri 2 Oct",
        dayCount: 5,
        startIndex: 0,
        icon: "xero",
        tone: "xero",
        note: null,
        provenanceLabel: "Synced from Xero",
      }),
    ],
  },
  {
    personId: "p-noah",
    name: "Noah Williams",
    initials: "NW",
    isSelf: false,
    secondary: "Sous chef · Fremantle",
    blocks: [
      block("Noah Williams", {
        id: "q-2",
        label: "Annual leave request",
        dateLabel: "Wed 30 Sep to Thu 1 Oct",
        dayCount: 2,
        startIndex: 2,
        icon: "leave_request",
        tone: "leave_request",
        note: null,
        provenanceLabel: "Leave request",
      }),
    ],
  },
  {
    personId: "p-mia",
    name: "Mia Robinson",
    initials: "MR",
    isSelf: false,
    secondary: null,
    blocks: [],
  },
];

export const PastWeek = () => (
  <div style={{ width: 1100 }}>
    <TeamTimeline
      cornerLabel="Kitchen"
      days={buildDays(28, "Sep", "09").map((day, index) =>
        index < 3
          ? day
          : {
              ...day,
              dateLabel: `${index - 2} Oct`,
              key: `2026-10-0${index - 2}`,
            }
      )}
      footer={null}
      isCurrentWeek={false}
      navigation={navigation}
      rows={quietRows}
      weekLabel="Mon 28 Sep to Sun 4 Oct"
      weekSub="Last week · 2026"
    />
  </div>
);
