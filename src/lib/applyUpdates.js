import { readContextFile, writeContextFile } from "./api.js";
import {
  mergeBoardTasksPreferExisting,
  mergeKanbanIntoNow,
  parseNowTasks,
} from "./kanban.js";
import { forceLogBlockToToday, upsertLogEntry } from "./log.js";

// Apply a list of { file, mode, content } updates to whatever scope contextStore
// is currently pointed at. Returns the list of file names that were written.
export async function applyContextUpdates(updates) {
  if (!updates?.length) return [];
  const updated = [];

  for (const { file, content, mode } of updates) {
    if (mode === "replace" && file === "season.md") {
      const curSeason = await readContextFile("season.md");
      const existingBoardTasks = parseNowTasks(curSeason);
      const incomingBoardTasks = parseNowTasks(content);
      const mergedBoardTasks = mergeBoardTasksPreferExisting(
        existingBoardTasks,
        incomingBoardTasks,
      );
      const mergedSeason = mergedBoardTasks.length
        ? mergeKanbanIntoNow(content, mergedBoardTasks)
        : content;
      const ok = await writeContextFile(file, mergedSeason, "replace");
      if (ok) updated.push(file);
      continue;
    }
    if (mode === "append" && file === "thinkies.md") {
      const cur = await readContextFile(file);
      const normalizedContent = forceLogBlockToToday(content, new Date());
      const merged = upsertLogEntry(cur, normalizedContent);
      if (!merged.changed || !merged.next) continue;
      const ok = await writeContextFile(file, merged.next, "replace");
      if (ok) updated.push(file);
      continue;
    }
    const ok = await writeContextFile(file, content, mode);
    if (ok) updated.push(file);
  }

  return [...new Set(updated)];
}
