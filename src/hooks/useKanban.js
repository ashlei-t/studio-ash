import { useCallback, useEffect, useRef, useState } from "react";
import { writeContextFile } from "../lib/api.js";
import {
  KANBAN_COLUMNS,
  enforceKanbanRules,
  hasKanbanSection,
  mergeKanbanIntoNow,
  parseChecklistTasksOutsideKanban,
  parseNowTasks,
} from "../lib/kanban.js";

export function useKanban(seasonContent) {
  const [tasks, setTasks] = useState([]);
  const ready = true;
  const [hydrated, setHydrated] = useState(false);
  const lastSeasonWriteRef = useRef("");
  const migrationDoneRef = useRef(false);

  // Hydrate the local board state from the latest season.md content.
  // This is an intentional sync from an external source (file/prop) into
  // local state; the rule is suppressed so we keep the merge behaviour that
  // preserves user-driven moves/edits.
  useEffect(() => {
    const hasBoard = hasKanbanSection(seasonContent);
    const fromBoard = parseNowTasks(seasonContent);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTasks((prev) => {
      if (fromBoard.length) return enforceKanbanRules(fromBoard);
      // If board exists but incoming update has it empty, preserve local board state.
      if (hasBoard && prev.length) return prev;
      // On cold start, an empty board section should not wipe tasks.
      // Seed from non-kanban checklists until the board has real items.
      if (prev.length) return prev;
      const fromChecklist = parseChecklistTasksOutsideKanban(seasonContent);
      return enforceKanbanRules(fromChecklist);
    });
    setHydrated(true);
  }, [seasonContent]);

  // One-time migration: if board exists but is empty, seed it from checklist tasks
  // and persist immediately so restarts have a real board source of truth.
  useEffect(() => {
    if (!hydrated || migrationDoneRef.current || !seasonContent) return;
    const fromBoard = parseNowTasks(seasonContent);
    if (fromBoard.length) {
      migrationDoneRef.current = true;
      return;
    }
    const fromChecklist = enforceKanbanRules(parseChecklistTasksOutsideKanban(seasonContent));
    if (!fromChecklist.length) {
      migrationDoneRef.current = true;
      return;
    }
    const migratedSeason = mergeKanbanIntoNow(seasonContent, fromChecklist);
    lastSeasonWriteRef.current = migratedSeason;
    void writeContextFile("season.md", migratedSeason, "replace");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTasks(fromChecklist);
    migrationDoneRef.current = true;
  }, [hydrated, seasonContent]);

  const moveTask = useCallback((taskId, nextStatus) => {
    if (!KANBAN_COLUMNS.includes(nextStatus)) return;
    setTasks((prev) =>
      enforceKanbanRules(
        prev.map((task) =>
          task.id === taskId ? { ...task, status: nextStatus, updatedAt: Date.now() } : task,
        ),
      ),
    );
  }, []);

  const moveTaskToPosition = useCallback((taskId, nextStatus, toIndex) => {
    if (!KANBAN_COLUMNS.includes(nextStatus)) return;
    setTasks((prev) => {
      const moving = prev.find((t) => t.id === taskId);
      if (!moving) return prev;

      const others = prev.filter((t) => t.id !== taskId);
      const before = [];
      const targetCol = [];
      const after = [];

      for (const task of others) {
        if (task.status !== nextStatus) {
          if (!targetCol.length) before.push(task);
          else after.push(task);
          continue;
        }
        targetCol.push(task);
      }

      const clampedIndex = Math.max(0, Math.min(toIndex, targetCol.length));
      targetCol.splice(clampedIndex, 0, {
        ...moving,
        status: nextStatus,
        updatedAt: Date.now(),
      });
      return enforceKanbanRules([...before, ...targetCol, ...after]);
    });
  }, []);

  const updateTaskText = useCallback((taskId, text) => {
    const cleaned = (text || "").trim();
    if (!cleaned) return;
    setTasks((prev) =>
      enforceKanbanRules(
        prev.map((task) =>
          task.id === taskId ? { ...task, text: cleaned, updatedAt: Date.now() } : task,
        ),
      ),
    );
  }, []);

  const deleteTask = useCallback((taskId) => {
    setTasks((prev) => enforceKanbanRules(prev.filter((task) => task.id !== taskId)));
  }, []);

  // Persist user-driven board changes back to season.md (single source of truth).
  useEffect(() => {
    if (!hydrated) return;
    if (!seasonContent) return;
    // Safety guard: never overwrite an existing non-empty board with an empty local state.
    if (!tasks.length && parseNowTasks(seasonContent).length) return;
    const nextSeason = mergeKanbanIntoNow(seasonContent, tasks);
    if (!nextSeason || nextSeason === seasonContent || nextSeason === lastSeasonWriteRef.current) return;
    lastSeasonWriteRef.current = nextSeason;
    void writeContextFile("season.md", nextSeason, "replace");
  }, [tasks, seasonContent, hydrated]);

  return { tasks, ready, moveTask, moveTaskToPosition, updateTaskText, deleteTask };
}
