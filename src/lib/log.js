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

export function formatLogHeading(date = new Date()) {
  const label = date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `### ${label}`;
}

export function forceLogBlockToToday(block, today = new Date()) {
  const normalized = normalizeLogBlock(block);
  if (!normalized) return "";
  const lines = normalized.split("\n");
  const heading = formatLogHeading(today);
  if ((lines[0] || "").trim().startsWith("### ")) {
    const body = lines.slice(1).join("\n").trim();
    return body ? `${heading}\n${body}` : "";
  }
  return `${heading}\n${normalized}`;
}

function normalizeForSimilarity(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(text) {
  const normalized = normalizeForSimilarity(text);
  if (!normalized) return new Set();
  return new Set(normalized.split(" ").filter((t) => t.length > 2));
}

function jaccardSimilarity(a, b) {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function areNearDuplicateEntries(a, b) {
  const na = normalizeForSimilarity(a);
  const nb = normalizeForSimilarity(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return jaccardSimilarity(na, nb) >= 0.78;
}

function dedupeBodiesBySimilarity(bodies) {
  const result = [];
  for (const body of bodies) {
    const clean = (body || "").trim();
    if (!clean) continue;
    let merged = false;
    for (let i = 0; i < result.length; i += 1) {
      if (!areNearDuplicateEntries(result[i], clean)) continue;
      // Keep the richer variant when two entries describe the same beat.
      if (clean.length > result[i].length) result[i] = clean;
      merged = true;
      break;
    }
    if (!merged) result.push(clean);
  }
  return result;
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
    if (areNearDuplicateEntries(existing.body, parsed.body)) {
      // If this append is essentially the same note, keep the richer one only.
      const richerBody = parsed.body.length > existing.body.length ? parsed.body : existing.body;
      deduped.push(normalizeLogBlock(`${parsed.heading}\n${richerBody}`));
      continue;
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
  const mergedBody = dedupeBodiesBySimilarity([...sameDateBodies, parsed.body]).join("\n\n");
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
