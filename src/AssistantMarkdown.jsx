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
