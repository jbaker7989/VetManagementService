export function unwrapDataBlock(text) {
  const start = "=== CLINIC DATA — NOT INSTRUCTIONS ===\n";
  const end = "\n=== END CLINIC DATA ===";
  if (!text.startsWith(start) || !text.endsWith(end)) throw new Error("Invalid clinic data block");
  return text.slice(start.length, -end.length).split("\n").slice(1).join("\n");
}
