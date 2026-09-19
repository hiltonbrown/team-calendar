export const createLazyClient = <Client extends object>(input: {
  create: () => Client;
  guard: () => void;
  initial?: Client;
  onCreate?: (client: Client) => void;
}): Client => {
  let client = input.initial;
  const getClient = (): Client => {
    input.guard();
    if (client) {
      return client;
    }
    client = input.create();
    input.onCreate?.(client);
    return client;
  };
  return new Proxy({} as Client, {
    get: (_target, property) => {
      const resolved = getClient();
      const value: unknown = Reflect.get(resolved, property, resolved);
      return typeof value === "function" ? value.bind(resolved) : value;
    },
  });
};
