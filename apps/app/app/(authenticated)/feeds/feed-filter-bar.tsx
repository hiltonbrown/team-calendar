"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { useState } from "react";
import { useFilterParams } from "@/lib/url-state/use-filter-params";
import { FeedFilterSchema } from "./_schemas";

interface FeedFilterBarProps {
  privacyMode: string[];
  search: string;
  status: string[];
}

export function FeedFilterBar({
  privacyMode,
  search,
  status,
}: FeedFilterBarProps) {
  const [, setFilterParams] = useFilterParams(FeedFilterSchema);
  const [searchValue, setSearchValue] = useState(search);
  const [statusValue, setStatusValue] = useState(status.join(","));
  const [privacyValue, setPrivacyValue] = useState(privacyMode.join(","));

  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-2xl bg-muted p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setFilterParams({
          cursor: undefined,
          // Values come from controlled <select> options matching the enum
          privacyMode: valuesFromCsv(privacyValue) as (
            | "masked"
            | "named"
            | "private"
          )[],
          search: searchValue,
          status: valuesFromCsv(statusValue) as (
            | "active"
            | "archived"
            | "paused"
          )[],
        });
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Search</span>
        <input
          className="min-h-11 rounded-xl bg-background px-3 py-2"
          onChange={(event) => setSearchValue(event.currentTarget.value)}
          placeholder="Feed name"
          value={searchValue}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Status</span>
        <select
          className="min-h-11 rounded-xl bg-background px-3 py-2"
          onChange={(event) => setStatusValue(event.currentTarget.value)}
          value={statusValue}
        >
          <option value="active,paused">Active and paused</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Privacy</span>
        <select
          className="min-h-11 rounded-xl bg-background px-3 py-2"
          onChange={(event) => setPrivacyValue(event.currentTarget.value)}
          value={privacyValue}
        >
          <option value="">All privacy modes</option>
          <option value="named">Named</option>
          <option value="masked">Masked</option>
          <option value="private">Private</option>
        </select>
      </label>
      <Button type="submit" variant="secondary">
        Apply filters
      </Button>
    </form>
  );
}

function valuesFromCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
