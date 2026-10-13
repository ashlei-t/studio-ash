const dayLabel = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

export default function Earlier({ entries, onBack }) {
  const days = []
  for (const entry of entries) {
    const label = dayLabel(entry.created_at)
    if (days.at(-1)?.label !== label) days.push({ label, entries: [] })
    days.at(-1).entries.push(entry)
  }

  return (
    <main className="page">
      <header className="top">
        <button className="quiet" onClick={onBack}>back to writing</button>
      </header>
      {days.map((day) => (
        <section key={day.label} className="day">
          <h2 className="date">{day.label}</h2>
          {day.entries.map((e) => (
            <article key={e.id} className="entry">
              <p>{e.body}</p>
              {e.reply && <p className="reply">{e.reply}</p>}
            </article>
          ))}
        </section>
      ))}
    </main>
  )
}
