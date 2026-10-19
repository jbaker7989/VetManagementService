// Minimal RFC4180-ish CSV parser: handles quoted fields, escaped quotes ("")
// and commas/newlines inside quotes. Returns an array of row objects keyed by
// the header row.

function parseRows(text) {
  const rows = [];
  let cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else if (ch === "\n") {
      cells.push(cur);
      rows.push(cells);
      cells = [];
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  rows.push(cells);
  return rows.filter((cells) => cells.some((c) => c.trim().length > 0));
}

export function parseCsv(text) {
  const [headerCells, ...rows] = parseRows(text.replace(/\r\n/g, "\n"));
  if (!headerCells) return [];
  const headers = headerCells.map((h) => h.trim());
  return rows.map((cells) => {
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? "").trim();
    });
    return row;
  });
}
