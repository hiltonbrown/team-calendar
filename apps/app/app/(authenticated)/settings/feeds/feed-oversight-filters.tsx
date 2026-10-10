"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { useState } from "react";
import { useFilterParams } from "@/lib/url-state/use-filter-params";
import {
  FEED_TYPE_OPTIONS,
  FeedOversightFilterSchema,
  type FeedOversightFilters,
} from "./_schemas";

// Radix Select rejects empty-string item values, so "no type filter" uses a
// sentinel that maps back to an absent parameter.
const ALL_TYPES = "all";
const DEFAULT_STATUS = "active,paused";

export function FeedOversightFilterBar({
  filters,
}: {
  filters: FeedOversightFilters;
}) {
  const [, setFilterParams] = useFilterParams(FeedOversightFilterSchema);
  const [search, setSearch] = useState(filters.search ?? "");
  const [status, setStatus] = useState(filters.status.join(","));
  const [type, setType] = useState(filters.type?.join(",") || ALL_TYPES);
  const activeCount =
    Number(search.trim().length > 0) +
    Number(status !== DEFAULT_STATUS) +
    Number(type !== ALL_TYPES);

  const apply = (next: { search: string; status: string; type: string }) => {
    setFilterParams({
      cursor: undefined,
      search: next.search.trim(),
      // Values come from the fixed Select options below.
      status: next.status.split(",") as FeedOversightFilters["status"],
      type:
        next.type === ALL_TYPES
          ? undefined
          : (next.type.split(",") as FeedOversightFilters["type"]),
    });
  };

  return (
    <form
      aria-label="Filter feeds"
      className="flex flex-wrap items-end gap-3 rounded-lg bg-surface-container p-4"
      onSubmit={(event) => {
        event.preventDefault();
        apply({ search, status, type });
      }}
    >
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <Label htmlFor="feed-oversight-search">Search</Label>
        <Input
          id="feed-oversight-search"
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder="Feed name"
          value={search}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="feed-oversight-status">Status</Label>
        <Select onValueChange={setStatus} value={status}>
          <SelectTrigger className="min-w-44" id="feed-oversight-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_STATUS}>Active and paused</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="feed-oversight-type">Type</Label>
        <Select onValueChange={setType} value={type}>
          <SelectTrigger className="min-w-44" id="feed-oversight-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TYPES}>All types</SelectItem>
            {FEED_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" variant="secondary">
        Apply filters
      </Button>
      {activeCount > 0 ? (
        <Button
          onClick={() => {
            setSearch("");
            setStatus(DEFAULT_STATUS);
            setType(ALL_TYPES);
            apply({ search: "", status: DEFAULT_STATUS, type: ALL_TYPES });
          }}
          type="button"
          variant="ghost"
        >
          Clear filters
        </Button>
      ) : null}
    </form>
  );
}
