import { log, logError } from "./log.js";

// On SIGTERM/SIGINT: stop accepting connections, let in-flight requests finish,
// take a final snapshot, then exit. Exits 1 if that doesn't complete within timeoutMs.
// Keep timeoutMs below the orchestrator's kill grace period (Docker's default is 10s).
export function installShutdown(server, { snapshot, timeoutMs, exit = process.exit }) {
  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`shutdown: received ${signal}, closing server`);
    setTimeout(() => {
      logError(`shutdown: not finished after ${timeoutMs}ms, forcing exit`);
      exit(1);
    }, timeoutMs).unref();

    server.close();
    server.closeIdleConnections();
    await new Promise((resolve) => server.once("close", resolve));

    try {
      await snapshot();
    } catch (err) {
      logError(`shutdown: final snapshot failed: ${err.message}`);
      exit(1);
      return;
    }
    log("shutdown: complete");
    exit(0);
  }

  for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => shutdown(signal));
}
