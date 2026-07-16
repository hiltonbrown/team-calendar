"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { useState } from "react";
import { useFilterParams } from "@/lib/url-state/use-filter-params";
import { FeedFilterSchema } from "./_schemas";

// Radix Select rejects empty-string item values, so the "no filter" option
// carries this sentinel and maps back to "" at the state boundary.
const ALL_PRIVACY = "all";

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
          // Values come from controlled Select options matching the enum
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
      <label
        className="flex flex-col gap-1 text-sm"
        htmlFor="feed-status-filter"
      >
        <span className="font-medium">Status</span>
        <Select onValueChange={setStatusValue} value={statusValue}>
          <SelectTrigger
            className="min-h-11 min-w-44 rounded-xl bg-background"
            id="feed-status-filter"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active,paused">Active and paused</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <label
        className="flex flex-col gap-1 text-sm"
        htmlFor="feed-privacy-filter"
      >
        <span className="font-medium">Privacy</span>
        <Select
          onValueChange={(value) =>
            setPrivacyValue(value === ALL_PRIVACY ? "" : value)
          }
          value={privacyValue === "" ? ALL_PRIVACY : privacyValue}
        >
          <SelectTrigger
            className="min-h-11 min-w-44 rounded-xl bg-background"
            id="feed-privacy-filter"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_PRIVACY}>All privacy modes</SelectItem>
            <SelectItem value="named">Named</SelectItem>
            <SelectItem value="masked">Masked</SelectItem>
            <SelectItem value="private">Private</SelectItem>
          </SelectContent>
        </Select>
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
