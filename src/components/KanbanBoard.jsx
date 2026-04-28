import { useState } from "react";
import { KANBAN_COLUMNS, KANBAN_TITLES } from "../lib/kanban.js";

export function KanbanBoard({ tasks, onMoveTask, onMoveTaskToPosition, onUpdateTaskText, onDeleteTask }) {
  const [draggingId, setDraggingId] = useState("");
  const [editingTaskId, setEditingTaskId] = useState("");
  const [editingText, setEditingText] = useState("");
  const byColumn = KANBAN_COLUMNS.reduce((acc, column) => {
    acc[column] = tasks.filter((task) => task.status === column);
    return acc;
  }, {});

  const editingTask = tasks.find((t) => t.id === editingTaskId) || null;

  function openEditor(task) {
    setEditingTaskId(task.id);
    setEditingText(task.text || "");
  }

  function closeEditor() {
    setEditingTaskId("");
    setEditingText("");
  }

  return (
    <div className="sa-kanban-wrap">
    <div className="sa-kanban">
      {KANBAN_COLUMNS.map((column) => (
        <div
          key={column}
          className="sa-kanban__column"
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (!draggingId) return;
            onMoveTask(draggingId, column);
            setDraggingId("");
          }}
        >
          <div className="sa-kanban__column-head">
            <span>{KANBAN_TITLES[column]}</span>
            <span>{byColumn[column].length}</span>
          </div>
          <div className="sa-kanban__cards">
            {byColumn[column].map((task, index) => (
              <div
                key={task.id}
                className="sa-kanban__card"
                draggable
                onDragStart={() => setDraggingId(task.id)}
                onDragEnd={() => setDraggingId("")}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!draggingId || draggingId === task.id) return;
                  onMoveTaskToPosition(draggingId, column, index);
                  setDraggingId("");
                }}
              >
                <div className="sa-kanban__card-top">
                  <p>{task.text}</p>
                  <button
                    type="button"
                    className="sa-kanban__edit"
                    aria-label="Edit task"
                    title="Edit task"
                    onClick={() => openEditor(task)}
                  >
                    ✎
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
    {editingTask && (
      <div className="sa-kanban__overlay" role="dialog" aria-modal="true" aria-label="Edit task">
        <div className="sa-kanban__overlay-panel">
          <p className="sa-kanban__overlay-title">Edit task</p>
          <textarea
            className="sa-kanban__overlay-input"
            value={editingText}
            onChange={(e) => setEditingText(e.target.value)}
            placeholder="Task details"
          />
          <div className="sa-kanban__overlay-actions">
            <button
              type="button"
              className="sa-kanban__overlay-btn sa-kanban__overlay-btn--danger"
              onClick={() => {
                onDeleteTask(editingTask.id);
                closeEditor();
              }}
            >
              delete
            </button>
            <button type="button" className="sa-kanban__overlay-btn" onClick={closeEditor}>cancel</button>
            <button
              type="button"
              className="sa-kanban__overlay-btn sa-kanban__overlay-btn--primary"
              onClick={() => {
                onUpdateTaskText(editingTask.id, editingText);
                closeEditor();
              }}
            >
              save
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}
