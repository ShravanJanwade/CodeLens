import { Fragment } from 'react';
function inline(text: string) {
  return text
    .split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith('`') ? (
        <code key={i}>{part.slice(1, -1)}</code>
      ) : part.startsWith('**') ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    );
}
/** Small, text-only Markdown subset. Model output never becomes HTML. */
export default function AnswerContent({ text }: { text: string }) {
  return (
    <div className="answer-content">
      {text.split(/(```[\s\S]*?```)/g).map((block, i) =>
        block.startsWith('```') ? (
          <pre key={i}>
            <code>{block.replace(/^```[^\n]*\n?/, '').replace(/```$/, '')}</code>
          </pre>
        ) : (
          <div key={i}>
            {block
              .split(/\n\n+/)
              .filter(Boolean)
              .map((paragraph, j) => {
                const lines = paragraph.split('\n');
                if (lines.every((l) => /^\s*(?:[-*]|\d+\.)\s/.test(l)))
                  return (
                    <ul key={j}>
                      {lines.map((l, k) => (
                        <li key={k}>{inline(l.replace(/^\s*(?:[-*]|\d+\.)\s/, ''))}</li>
                      ))}
                    </ul>
                  );
                if (/^#{1,4} /.test(paragraph))
                  return (
                    <Fragment key={j}>
                      <h3>{inline(lines[0].replace(/^#{1,4} /, ''))}</h3>
                      {lines.length > 1 && <p>{inline(lines.slice(1).join('\n'))}</p>}
                    </Fragment>
                  );
                return <p key={j}>{inline(paragraph)}</p>;
              })}
          </div>
        ),
      )}
    </div>
  );
}
