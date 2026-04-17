import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TabBar from "../../src/webview/components/layout/TabBar.js";
import StepWizard from "../../src/webview/components/layout/StepWizard.js";
import ProgressOverlay from "../../src/webview/components/layout/ProgressOverlay.js";

describe("TabBar", () => {
  const tabs = [
    { id: "a", label: "Alpha" },
    { id: "b", label: "Beta" },
  ];

  it("marks the active tab with a class", () => {
    render(<TabBar tabs={tabs} activeTab="b" onTabChange={() => {}} />);
    const alpha = screen.getByRole("button", { name: "Alpha" });
    const beta = screen.getByRole("button", { name: "Beta" });
    expect(alpha).not.toHaveClass("tab-active");
    expect(beta).toHaveClass("tab-active");
  });

  it("fires onTabChange with the clicked tab id", () => {
    const onTabChange = vi.fn();
    render(<TabBar tabs={tabs} activeTab="a" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    expect(onTabChange).toHaveBeenCalledWith("b");
  });
});

describe("StepWizard", () => {
  const steps = [{ label: "Pick" }, { label: "Review" }, { label: "Submit" }];

  it("renders children in the content slot", () => {
    render(
      <StepWizard steps={steps} currentStep={0}>
        <div>step body</div>
      </StepWizard>,
    );
    expect(screen.getByText("step body")).toBeInTheDocument();
  });

  it("marks steps before currentStep as done (checkmark) and applies step-current class", () => {
    const { container } = render(
      <StepWizard steps={steps} currentStep={1}>
        <span>x</span>
      </StepWizard>,
    );
    const indicators = container.querySelectorAll(".step-indicator");
    expect(indicators).toHaveLength(3);
    expect(indicators[0].className).toContain("step-done");
    expect(indicators[1].className).toContain("step-current");
    expect(indicators[2].className).toContain("step-pending");

    // done-step uses a checkmark rather than a number
    expect(indicators[0].querySelector(".step-number")?.textContent).toBe("\u2713");
    expect(indicators[1].querySelector(".step-number")?.textContent).toBe("2");
  });
});

describe("ProgressOverlay", () => {
  it("renders nothing when invisible", () => {
    const { container } = render(
      <ProgressOverlay visible={false} title="x" steps={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders title, each step, and optional message", () => {
    render(
      <ProgressOverlay
        visible={true}
        title="Working"
        steps={[
          { label: "Fetch", status: "done" },
          { label: "Process", status: "active" },
          { label: "Upload", status: "pending" },
          { label: "Boom", status: "error" },
        ]}
        message="hang on"
      />,
    );
    expect(screen.getByText("Working")).toBeInTheDocument();
    expect(screen.getByText("Fetch")).toBeInTheDocument();
    expect(screen.getByText("Process")).toBeInTheDocument();
    expect(screen.getByText("Upload")).toBeInTheDocument();
    expect(screen.getByText("Boom")).toBeInTheDocument();
    expect(screen.getByText("hang on")).toBeInTheDocument();
  });

  it("shows spinner only when a step is active", () => {
    const { container, rerender } = render(
      <ProgressOverlay
        visible={true}
        title="Work"
        steps={[{ label: "A", status: "done" }]}
      />,
    );
    expect(container.querySelector(".spinner")).toBeNull();

    rerender(
      <ProgressOverlay
        visible={true}
        title="Work"
        steps={[{ label: "A", status: "active" }]}
      />,
    );
    expect(container.querySelector(".spinner")).not.toBeNull();
  });
});
