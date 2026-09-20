export const isLocalDatabase = (connectionString: string): boolean => {
  try {
    const { hostname } = new URL(connectionString);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
};
