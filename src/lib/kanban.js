export const KANBAN_COLUMNS = ["todos", "doing it", "done"];
export const MAX_TASKS_PER_COLUMN = 8;
export const KANBAN_TITLES = {
  todos: "todos",
  "doing it": "doing it",
  done: "done",
};

export function normalizeTaskText(text) {
  return (text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/g, "")
    .trim();
}

function toTitleCaseStart(text) {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function toActionableTaskText(text) {
  const cleaned = (text || "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const lowered = cleaned.toLowerCase();
  const rewrites = [
    [/^i need to\s+/, ""],
    [/^i have to\s+/, ""],
    [/^i still need to\s+/, ""],
    [/^remind me to\s+/, ""],
    [/^i will\s+/, ""],
    [/^after that i('|’)ll\s+/, ""],
  ];
  let rewritten = cleaned;
  for (const [re, replacement] of rewrites) {
    if (re.test(lowered)) {
      rewritten = cleaned.replace(re, replacement).trim();
      break;
    }
  }
  rewritten = rewritten
    .replace(/\b(and then|then)\b.+$/i, "")
    .replace(/\s+\*?\(waiting on.+$/i, "")
    .trim();
  return toTitleCaseStart(rewritten);
}

function categoryForTask(text) {
  const value = normalizeTaskText(text);
  if (/(email|campaign|marketing|waitlist|template|discord|brand)/.test(value)) return "marketing";
  if (/(invoice|payment|shopify|xero|fulfillment|ship|order|eric|tim sync|agenda)/.test(value)) return "operations";
  if (/(studio ash|deploy|prompt|coding|app|feature|bug|fix)/.test(value)) return "product";
  if (/(boxing|spanish|grocery|personal|training|portfolio)/.test(value)) return "personal";
  return "general";
}

function groupedTaskTitle(category) {
  const label = category.charAt(0).toUpperCase() + category.slice(1);
  return `${label} tasks`;
}

function buildGroupedTaskText(category, tasks) {
  const cleaned = tasks
    .map((task) => toActionableTaskText(task.text))
    .filter(Boolean);
  if (!cleaned.length) return groupedTaskTitle(category);
  return `${groupedTaskTitle(category)}\n${cleaned.map((task) => `- ${task}`).join("\n")}`;
}

export function buildStableTaskId(text, status = "todos", source = "now.md") {
  const base = normalizeTaskText(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return `${source}-${status}-${base || "task"}`;
}

export function enforceKanbanRules(tasks) {
  const rank = { todos: 0, "doing it": 1, done: 2 };
  const deduped = new Map();
  for (const task of tasks) {
    const cleanedText = task.source === "kanban-group"
      ? (task.text || "").trim()
      : toActionableTaskText(task.text);
    if (!cleanedText) continue;
    const key = normalizeTaskText(cleanedText);
    if (!key) continue;
    const existing = deduped.get(key);
    if (!existing || rank[task.status] > rank[existing.status]) {
      deduped.set(key, { ...task, text: cleanedText });
    }
  }

  const output = [];
  for (const column of KANBAN_COLUMNS) {
    const col = [...deduped.values()].filter((task) => task.status === column);
    if (col.length <= MAX_TASKS_PER_COLUMN) {
      output.push(...col);
      continue;
    }
    const keep = col.slice(0, Math.max(0, MAX_TASKS_PER_COLUMN - 2));
    const overflow = col.slice(keep.length);
    const grouped = new Map();
    for (const task of overflow) {
      const category = categoryForTask(task.text);
      const bucket = grouped.get(category) || [];
      bucket.push(task);
      grouped.set(category, bucket);
    }
    const summaries = [...grouped.entries()].slice(0, 2).map(([category, groupedTasks]) => {
      const groupedText = buildGroupedTaskText(category, groupedTasks);
      return {
        id: buildStableTaskId(groupedText, column, "group"),
        text: groupedText,
        status: column,
        source: "kanban-group",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    });
    output.push(...keep, ...summaries.slice(0, MAX_TASKS_PER_COLUMN - keep.length));
  }
  return output;
}

export function parseNowTasks(nowContent) {
  if (!nowContent) return [];
  const sectionMatches = [...nowContent.matchAll(/(^|\n)##\s+kanban board\s*\n([\s\S]*?)(?=\n##\s+|$)/gi)];
  if (!sectionMatches.length) return [];
  const sectionMatch = sectionMatches[sectionMatches.length - 1];
  const tasks = [];
  const lines = sectionMatch[2].split("\n");
  let currentColumn = "todos";
  for (const line of lines) {
    const heading = line.match(/^\s*###\s+(.+?)\s*$/);
    if (heading) {
      const key = heading[1].trim().toLowerCase();
      if (KANBAN_COLUMNS.includes(key)) currentColumn = key;
      continue;
    }
    const m = line.match(/^\s*-\s*\[([ xX])\]\s+(.+?)\s*$/);
    if (!m) continue;
    const text = m[2].trim();
    if (!text) continue;
    tasks.push({
      id: buildStableTaskId(text, currentColumn, "now"),
      text,
      status: currentColumn,
      source: "now.md",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  return tasks;
}

export function hasKanbanSection(nowContent) {
  if (!nowContent) return false;
  return /(^|\n)##\s+kanban board\s*\n/i.test(nowContent);
}

export function mergeBoardTasksPreferExisting(existingTasks, incomingTasks) {
  const map = new Map();
  for (const task of existingTasks) {
    const key = normalizeTaskText(toActionableTaskText(task.text));
    if (!key) continue;
    map.set(key, task);
  }
  for (const task of incomingTasks) {
    const key = normalizeTaskText(toActionableTaskText(task.text));
    if (!key || map.has(key)) continue;
    map.set(key, task);
  }
  return [...map.values()];
}

export function parseChecklistTasksOutsideKanban(nowContent) {
  if (!nowContent) return [];
  const withoutBoard = nowContent.replace(/(^|\n)##\s+kanban board\s*\n[\s\S]*?(?=\n##\s+|$)/gi, "\n");
  const lines = withoutBoard.split("\n");
  const tasks = [];
  for (const line of lines) {
    const m = line.match(/^\s*-\s*\[([ xX])\]\s+(.+?)\s*$/);
    if (!m) continue;
    const done = m[1].toLowerCase() === "x";
    const text = m[2].trim();
    if (!text) continue;
    tasks.push({
      id: buildStableTaskId(text, done ? "done" : "todos", "now-fallback"),
      text,
      status: done ? "done" : "todos",
      source: "now.md",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  return tasks;
}

export function buildKanbanSection(tasks) {
  const safeTasks = enforceKanbanRules(tasks);
  const grouped = KANBAN_COLUMNS.reduce((acc, column) => {
    acc[column] = safeTasks
      .filter((task) => task.status === column)
      .map((task) => `- [${column === "done" ? "x" : " "}] ${task.text}`);
    return acc;
  }, {});

  const lines = ["## kanban board", ""];
  KANBAN_COLUMNS.forEach((column, idx) => {
    lines.push(`### ${column}`);
    if (grouped[column].length) lines.push(...grouped[column]);
    if (idx < KANBAN_COLUMNS.length - 1) lines.push("");
  });
  lines.push("");
  return lines.join("\n");
}

export function mergeKanbanIntoNow(nowContent, tasks) {
  const cleanNow = (nowContent || "").trimEnd();
  const kanbanSection = buildKanbanSection(tasks);
  const boardReGlobal = /(^|\n)##\s+kanban board\s*\n[\s\S]*?(?=\n##\s+|$)/gi;
  if (boardReGlobal.test(cleanNow)) {
    const withoutBoards = cleanNow.replace(boardReGlobal, "").replace(/\n{3,}/g, "\n\n").trim();
    return `${withoutBoards}\n\n${kanbanSection}\n`;
  }
  if (!cleanNow) return `${kanbanSection}\n`;
  return `${cleanNow}\n\n${kanbanSection}\n`;
}
