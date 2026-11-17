import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { symptomList, scheduleDetail } from "@/api/mocks/fixtures";
import {
  CompletenessCard,
  DosesCard,
  EmergencyCard,
  GrantsCard,
  SymptomsCard,
} from "@/features/dashboard/OverviewCards";

describe("overview cards", () => {
  it("shows a skeleton while loading", () => {
    render(<CompletenessCard state="loading" filled={0} total={0} />);
    expect(screen.getByLabelText("Loading profile completeness")).toBeInTheDocument();
  });

  it("shows the error, request id and retry", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(<GrantsCard state="error" count={0} error="Check your connection." requestId="req-1" onRetry={retry} />);

    expect(screen.getByText("Could not load active access codes")).toBeInTheDocument();
    expect(screen.getByText("Request req-1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("shows completeness and emergency status", () => {
    render(
      <>
        <CompletenessCard state="ready" filled={11} total={15} />
        <EmergencyCard state="ready" available count={5} />
      </>,
    );

    expect(screen.getByText("Shareable record fields")).toBeInTheDocument();
    expect(screen.getByText("Available by code")).toBeInTheDocument();
    expect(screen.getByText("5 fields are revealed to a valid patient code.")).toBeInTheDocument();
  });

  it("shows the empty symptom state", () => {
    render(<SymptomsCard state="empty" records={[]} />);
    expect(screen.getByText("No conversations yet")).toBeInTheDocument();
  });

  it("renders symptom rows with severity text", () => {
    render(<SymptomsCard state="ready" records={symptomList.symptoms} />);
    expect(screen.getByText("Mild headache and runny nose")).toBeInTheDocument();
    expect(screen.getByText("MILD")).toBeInTheDocument();
  });

  it("marks a dose from the overview", async () => {
    const user = userEvent.setup();
    const onMark = vi.fn();
    const moment = scheduleDetail.schedule.moments[0];
    render(<DosesCard state="ready" moments={[moment]} onMark={onMark} />);

    await user.click(screen.getByRole("button", { name: "Taken" }));
    expect(onMark).toHaveBeenCalledWith(moment.id, "TAKEN");
  });
});
