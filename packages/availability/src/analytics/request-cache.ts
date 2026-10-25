export interface AggregationCache {
  get: <TValue>(key: string) => TValue | undefined;
  getOrLoad: <TValue>(
    key: string,
    loader: () => Promise<TValue>
  ) => Promise<TValue>;
  set: <TValue>(key: string, value: TValue) => void;
}

export function createAggregationCache(): AggregationCache {
  const values = new Map<string, unknown>();
  return {
    get<TValue>(key: string): TValue | undefined {
      return values.get(key) as TValue | undefined;
    },
    async getOrLoad<TValue>(
      key: string,
      loader: () => Promise<TValue>
    ): Promise<TValue> {
      const existing = values.get(key);
      if (existing !== undefined) {
        return existing as TValue;
      }
      const loaded = await loader();
      values.set(key, loaded);
      return loaded;
    },
    set<TValue>(key: string, value: TValue): void {
      values.set(key, value);
    },
  };
}

export function aggregationFingerprint(input: {
  accountId: string;
  dateRangeKey: string;
  filterKey: unknown;
  organisationId: string;
  serviceMethod: string;
}): string {
  return stableStringify({
    accountId: input.accountId,
    dateRangeKey: input.dateRangeKey,
    filterKey: input.filterKey,
    organisationId: input.organisationId,
    serviceMethod: input.serviceMethod,
  });
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  return `{${entries
    .map(
      ([key, nestedValue]) =>
        `${JSON.stringify(key)}:${stableStringify(nestedValue)}`
    )
    .join(",")}}`;
}
