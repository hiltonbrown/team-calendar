/** Test-only facade, default operations still pass through the real write guard. */
export function createSpyableDatabase<Client extends object>(
  client: Client,
  operations: Readonly<Record<string, readonly string[]>>
): Client {
  const delegates = new Map<PropertyKey, object>();
  return new Proxy(client, {
    get: (target, model) => {
      const selected =
        typeof model === "string" ? operations[model] : undefined;
      if (!selected) {
        return Reflect.get(target, model, target);
      }
      const cached = delegates.get(model);
      if (cached) {
        return cached;
      }
      const resolveDelegate = (): object => {
        const delegate: unknown = Reflect.get(target, model, target);
        if (!delegate || typeof delegate !== "object") {
          throw new Error("Integration spy delegate is unavailable");
        }
        return delegate;
      };
      const delegate = resolveDelegate();
      const methods = new Map<PropertyKey, PropertyDescriptor>();
      for (const operation of selected) {
        const value: unknown = Reflect.get(delegate, operation, delegate);
        if (typeof value !== "function") {
          throw new Error("Integration spy operation is unavailable");
        }
        methods.set(operation, {
          configurable: true,
          enumerable: true,
          value: (...args: unknown[]) => {
            const current = resolveDelegate();
            const callable: unknown = Reflect.get(current, operation, current);
            if (typeof callable !== "function") {
              throw new Error("Integration spy operation is unavailable");
            }
            return Reflect.apply(callable, current, args);
          },
          writable: true,
        });
      }
      const facade = new Proxy(delegate, {
        defineProperty: (receiver, operation, descriptor) => {
          if (!methods.has(operation)) {
            return Reflect.defineProperty(receiver, operation, descriptor);
          }
          methods.set(operation, descriptor);
          return true;
        },
        get: (_receiver, operation) => {
          const override = methods.get(operation);
          return override
            ? override.value
            : Reflect.get(resolveDelegate(), operation);
        },
        getOwnPropertyDescriptor: (receiver, operation) =>
          methods.get(operation) ??
          Reflect.getOwnPropertyDescriptor(receiver, operation),
      });
      delegates.set(model, facade);
      return facade;
    },
  });
}
