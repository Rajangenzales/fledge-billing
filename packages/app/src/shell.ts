import { createServer } from "node:http";
import type { AppConfig } from "@fledge/application";
import type { Logger } from "@fledge/application";
import { DOMAIN_LAYER } from "@fledge/domain";
import { APP_NAME, APP_VERSION } from "./version.js";

export type ShellStatus = {
  name: string;
  version: string;
  domainLayer: string;
  nodeEnv: string;
};

export function getShellStatus(config: AppConfig): ShellStatus {
  return {
    name: APP_NAME,
    version: APP_VERSION,
    domainLayer: DOMAIN_LAYER,
    nodeEnv: config.nodeEnv,
  };
}

export function startShellServer(
  config: AppConfig,
  log: Logger,
): Promise<{ close: () => Promise<void> }> {
  const status = getShellStatus(config);

  const server = createServer((req, res) => {
    if (req.url === "/health" || req.url === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, ...status }));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Not found" }));
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(config.port, "0.0.0.0", () => {
      log.info("Application shell listening", {
        port: config.port,
        version: APP_VERSION,
      });
      resolve({
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((err) => (err ? closeReject(err) : closeResolve()));
          }),
      });
    });
  });
}
