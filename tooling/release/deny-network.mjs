import net from "node:net";
import tls from "node:tls";

const deny = () => {
  throw new Error("Network access is disabled during source-only release gates");
};

net.connect = deny;
net.createConnection = deny;
net.Socket.prototype.connect = deny;
tls.connect = deny;
globalThis.fetch = async () => {
  throw new Error("Network access is disabled during source-only release gates");
};
