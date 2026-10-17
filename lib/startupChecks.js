import net from "node:net";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SETTINGS_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "agent-home", "settings.json");

const privateRanges = new net.BlockList();
privateRanges.addSubnet("127.0.0.0", 8);
privateRanges.addSubnet("10.0.0.0", 8);
privateRanges.addSubnet("172.16.0.0", 12);
privateRanges.addSubnet("192.168.0.0", 16);
privateRanges.addSubnet("169.254.0.0", 16);
privateRanges.addAddress("::1", "ipv6");
privateRanges.addSubnet("fc00::", 7, "ipv6");
privateRanges.addSubnet("fe80::", 10, "ipv6");

function isPrivateHost(host) {
  if (host === "localhost") return true;
  const family = net.isIP(host);
  return family !== 0 && privateRanges.check(host, family === 4 ? "ipv4" : "ipv6");
}

// Defaults to loopback; binding anything reachable beyond the LAN (wildcard,
// public IP, or an unclassifiable hostname) needs an explicit opt-in.
export function resolveListenHost(env = process.env) {
  const host = env.HOST || "127.0.0.1";
  if (!isPrivateHost(host) && env.ALLOW_PUBLIC_BIND !== "true") {
    throw new Error(
      `Refusing to bind to "${host}": it may be reachable from the public internet, and this app has no login. ` +
        "Use a loopback or private-network address, or set ALLOW_PUBLIC_BIND=true if a proxy restricts access.",
    );
  }
  return host;
}

export function assertSafeAgentSettings(settingsPath = SETTINGS_PATH) {
  const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  if (settings.defaultProjectTrust === "always") {
    throw new Error(`${settingsPath} must not set defaultProjectTrust to "always".`);
  }
}
