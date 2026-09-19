import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("source-gate network denial", () => {
  it("blocks outbound fetch before a connection is opened", () => {
    const preload = resolve(import.meta.dirname, "deny-network.mjs");
    const result = spawnSync(
      process.execPath,
      ["--import", preload, "--eval", "await fetch('https://example.com')"],
      { encoding: "utf8" }
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Network access is disabled during source-only release gates"
    );
  });

  it("blocks TCP database connections while permitting local build IPC", () => {
    const preload = resolve(import.meta.dirname, "deny-network.mjs");
    const tcp = spawnSync(
      process.execPath,
      [
        "--import",
        preload,
        "--eval",
        "const net = await import('node:net'); net.connect(5432, '127.0.0.1')",
      ],
      { encoding: "utf8" }
    );
    expect(tcp.status).not.toBe(0);
    expect(tcp.stderr).toContain(
      "Network access is disabled during source-only release gates"
    );

    const ipc = spawnSync(
      process.execPath,
      [
        "--import",
        preload,
        "--eval",
        `const net = await import('node:net');
         const path = '/tmp/teamcalendar-source-gate-' + process.pid + '.sock';
         const server = net.createServer((socket) => socket.end());
         await new Promise((resolve, reject) => server.listen(path, resolve).once('error', reject));
         await new Promise((resolve, reject) => net.connect(path).once('close', resolve).once('error', reject));
         await new Promise((resolve) => server.close(resolve));`,
      ],
      { encoding: "utf8" }
    );
    expect(ipc.status).toBe(0);
  });
});
