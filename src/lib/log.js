export function normalizeLogBlock(text) {
  return (text || "").replace(/\r\n/g, "\n").trim();
}

export function parseDatedLogBlock(block) {
  const normalized = normalizeLogBlock(block);
  if (!normalized) return null;
  const lines = normalized.split("\n");
  const heading = (lines[0] || "").trim();
  if (!heading.startsWith("### ")) return null;
  const dateLabel = heading.replace(/^###\s+/, "").trim();
  const body = lines.slice(1).join("\n").trim();
  if (!dateLabel || !body) return null;
  return { heading, dateLabel, body };
}

export function upsertLogEntry(existingLog, incomingBlock) {
  const current = existingLog || "";
  const parsed = parseDatedLogBlock(incomingBlock);
  if (!parsed) return { next: null, changed: false };
  const incomingNormalized = normalizeLogBlock(`${parsed.heading}\n${parsed.body}`);
  const sections = current.split(/(?=^###\s)/m);
  const deduped = [];

  for (const chunk of sections) {
    const clean = normalizeLogBlock(chunk);
    if (!clean) continue;
    const existing = parseDatedLogBlock(clean);
    if (!existing) {
      deduped.push(clean);
      continue;
    }
    if (existing.dateLabel !== parsed.dateLabel) {
      deduped.push(clean);
      continue;
    }
    const existingNormalized = normalizeLogBlock(`${existing.heading}\n${existing.body}`);
    if (existingNormalized === incomingNormalized) {
      return { next: null, changed: false };
    }
    // Same day, highly overlapping text: keep one richer version.
    if (
      incomingNormalized.includes(existing.body) ||
      existingNormalized.includes(parsed.body)
    ) {
      deduped.push(incomingNormalized);
      continue;
    }
    deduped.push(clean);
  }

  const hasSameDate = deduped.some((chunk) => {
    const entry = parseDatedLogBlock(chunk);
    return entry?.dateLabel === parsed.dateLabel;
  });

  if (!hasSameDate) {
    const base = current.trimEnd();
    const prefix = base ? `${base}\n` : "";
    return { next: `${prefix}${incomingNormalized}\n`, changed: true };
  }

  const sameDateBodies = deduped
    .map(parseDatedLogBlock)
    .filter(Boolean)
    .filter((entry) => entry.dateLabel === parsed.dateLabel)
    .map((entry) => entry.body);
  const mergedBody = [...new Set([...sameDateBodies, parsed.body])]
    .filter(Boolean)
    .join("\n\n");
  const canonical = `${parsed.heading}\n${mergedBody}`.trim();

  const withoutDate = deduped.filter((chunk) => {
    const entry = parseDatedLogBlock(chunk);
    return entry?.dateLabel !== parsed.dateLabel;
  });
  const rebuilt = [...withoutDate, canonical].join("\n\n").trim();
  return { next: `${rebuilt}\n`, changed: true };
}

export function getTodayLogEntries(logContent, today = new Date()) {
  if (!logContent) return [];
  const datePart = today.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const lines = logContent.split("\n");
  const entries = [];
  let capturing = false;
  let current = [];
  for (const line of lines) {
    if (line.startsWith("### ")) {
      if (capturing && current.length) entries.push(current.join("\n").trim());
      capturing = line.includes(datePart);
      current = [];
    } else if (capturing) {
      current.push(line);
    }
  }
  if (capturing && current.length) entries.push(current.join("\n").trim());
  return entries.filter((e) => e.length > 0);
}
