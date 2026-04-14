import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const link = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer">
    {children}
  </a>
);

/** Block markdown (morning / focus / evening assistant replies) */
export function AssistantMarkdown({ children }) {
  if (!children) return null;
  return (
    <div className="sa-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: link }}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

/** Minimal inline emphasis for + log acknowledgments (one line, no block tags) */
export function InlineMd({ text }) {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={i}
          style={{
            fontFamily: "var(--mono)",
            fontSize: "0.88em",
            background: "var(--color-background-secondary)",
            padding: "0 0.25em",
            borderRadius: 3,
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
