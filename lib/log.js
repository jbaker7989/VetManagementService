// Timestamped lines on stdout/stderr, so `docker logs -t`-style tooling isn't needed to date them.
const stamp = (message) => `${new Date().toISOString()} ${message}`;

export const log = (message) => console.log(stamp(message));
export const logError = (message) => console.error(stamp(message));
