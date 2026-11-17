import ReactMarkdown, { type Components } from "react-markdown";
import styles from "./assistant.module.css";

const allowedProtocol = "https:";

/** Only absolute https links survive. Relative, javascript: and data: URLs are stripped before render. */
export function httpsOnlyUrl(value: string) {
  try {
    return new URL(value).protocol === allowedProtocol ? value : "";
  } catch {
    return "";
  }
}

const components: Components = {
  a({ href, children }) {
    if (!href || !href.startsWith(allowedProtocol)) return <>{children}</>;
    return (
      <a href={href} rel="noopener noreferrer" target="_blank">
        {children}
      </a>
    );
  },
  // Remote images are not needed in a reply and would leak a request to whoever wrote the Markdown.
  img() {
    return null;
  },
};

/**
 * AI replies are Markdown. Raw HTML is not enabled: react-markdown turns an HTML tag into text, so an
 * <img onerror> string renders as characters and never becomes an element. Links must be https.
 */
export function AssistantMessage({ content }: { content: string }) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown urlTransform={httpsOnlyUrl} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
