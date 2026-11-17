/**
 * Splits text into words that blur in one after another when the nearest [data-inview] ancestor enters view.
 * Screen readers get the plain sentence (sr-only copy); the animated words are aria-hidden.
 */
export function BlurText({ text, offset = 0 }: { text: string; offset?: number }) {
  const words = text.split(" ");
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((w, i) => (
          <span key={i}>
            <span className="bw" style={{ "--w": i + offset } as React.CSSProperties}>
              {w}
            </span>
            {i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </span>
    </>
  );
}
