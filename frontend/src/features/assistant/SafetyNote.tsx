import styles from "./assistant.module.css";

export const SAFETY_COPY =
  "General information only. Not a diagnosis. In an emergency, seek local emergency care immediately.";

export function AssistantSafetyNote() {
  return <p className={styles.safety}>{SAFETY_COPY}</p>;
}
