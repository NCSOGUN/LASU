import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AssistantMessage } from "@/features/assistant/AssistantMessage";

describe("AssistantMessage", () => {
  it("renders an XSS image string as text, never as an element", () => {
    render(<AssistantMessage content={"<img src=x onerror=alert(1)>"} />);

    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("[onerror]")).toBeNull();
  });

  it("renders inline HTML as text and does not execute a script tag", () => {
    render(<AssistantMessage content={"<script>alert('xss')</script>\n\nNormal **answer**."} />);

    expect(screen.getByText(/<script>alert\('xss'\)<\/script>/)).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText("answer").tagName).toBe("STRONG");
  });

  it("keeps https links, opens them safely, and drops other protocols", () => {
    render(
      <AssistantMessage
        content={"[NHS](https://www.nhs.uk/conditions/headache/) and [bad](javascript:alert(1)) and [relative](/app) and [mail](mailto:help@example.test)"}
      />,
    );

    const safe = screen.getByRole("link", { name: "NHS" });
    expect(safe).toHaveAttribute("href", "https://www.nhs.uk/conditions/headache/");
    expect(safe).toHaveAttribute("rel", "noopener noreferrer");
    expect(safe).toHaveAttribute("target", "_blank");

    expect(screen.queryByRole("link", { name: "bad" })).toBeNull();
    expect(document.querySelectorAll("a")).toHaveLength(1);
    expect(screen.getByText(/relative/)).toBeInTheDocument();
    expect(screen.getByText(/mail/)).toBeInTheDocument();
  });

  it("renders Markdown lists and emphasis", () => {
    render(<AssistantMessage content={"**Rest** and drink fluids.\n\n- One\n- Two"} />);

    expect(screen.getByText("Rest").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
