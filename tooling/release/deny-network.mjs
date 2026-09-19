import net from "node:net";
import tls from "node:tls";

const denialMessage =
  "Network access is disabled during source-only release gates";
const numericPort = /^\d{1,5}$/;
const deny = () => {
  throw new Error(denialMessage);
};
const isAllowedIpcPath = (value) =>
  typeof value === "string" &&
  (value.startsWith("/tmp/") || value.startsWith(`${process.cwd()}/`));
const isTurbopackWorkerConnection = (target) => {
  if (!(target && typeof target === "object")) {
    return false;
  }
  const value = target.port;
  let port = Number.NaN;
  if (typeof value === "number") {
    port = value;
  } else if (typeof value === "string" && numericPort.test(value)) {
    port = Number(value);
  }
  return (
    target.host === "127.0.0.1" &&
    Number.isInteger(port) &&
    port > 0 &&
    port <= 65_535 &&
    port === Number(process.argv[2]) &&
    (process.argv[1]?.includes("/.next/") ||
      process.argv[1]?.includes("/node_modules/next/"))
  );
};
const isIpcConnection = (arguments_) => {
  const [first] = arguments_;
  let target = first;
  while (Array.isArray(target)) {
    [target] = target;
  }
  return (
    isAllowedIpcPath(target) ||
    (target && typeof target === "object" && isAllowedIpcPath(target.path)) ||
    isTurbopackWorkerConnection(target)
  );
};
const originalConnect = net.connect;
const originalCreateConnection = net.createConnection;
const originalSocketConnect = net.Socket.prototype.connect;
net.connect = function guardedConnect(...arguments_) {
  return isIpcConnection(arguments_)
    ? originalConnect.apply(this, arguments_)
    : deny();
};
net.createConnection = function guardedCreateConnection(...arguments_) {
  return isIpcConnection(arguments_)
    ? originalCreateConnection.apply(this, arguments_)
    : deny();
};
net.Socket.prototype.connect = function guardedSocketConnect(...arguments_) {
  return isIpcConnection(arguments_)
    ? originalSocketConnect.apply(this, arguments_)
    : deny();
};
tls.connect = deny;
globalThis.fetch = () => Promise.reject(new Error(denialMessage));
