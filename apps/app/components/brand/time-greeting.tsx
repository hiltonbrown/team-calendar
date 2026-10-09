"use client";

import { useEffect, useState } from "react";

const greetingForHour = (hour: number): string => {
  if (hour < 12) {
    return "Good morning";
  }
  if (hour < 18) {
    return "Good afternoon";
  }
  return "Good evening";
};

// Resolves the greeting from the visitor's local time on the client, so the
// copy matches their day rather than the server's timezone. Renders a visible
// fallback for SSR / no-JS; the parent .auth-rise carries the entrance.
export const TimeGreeting = () => {
  const [greeting, setGreeting] = useState("Good day");

  useEffect(() => {
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

  return <>{`${greeting}.`}</>;
};
