export function getTimeSlot(hour) {
  if (hour >= 5 && hour < 14) return "morning";
  if (hour >= 14 && hour < 21) return "focus";
  return "evening";
}

export function formatDate(ts) {
  return new Date(ts).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isSameCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
