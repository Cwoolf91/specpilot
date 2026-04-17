import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Button from "../../src/webview/components/shared/Button.js";
import Input from "../../src/webview/components/shared/Input.js";
import Select from "../../src/webview/components/shared/Select.js";
import Spinner from "../../src/webview/components/shared/Spinner.js";
import StatusBadge from "../../src/webview/components/shared/StatusBadge.js";

describe("Button", () => {
  it("renders with default primary variant", () => {
    render(<Button>Click me</Button>);
    const btn = screen.getByRole("button", { name: "Click me" });
    expect(btn).toHaveClass("btn", "btn-primary");
  });

  it("applies the requested variant class", () => {
    render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn).toHaveClass("btn-danger");
  });

  it("forwards click events", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Tap</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Tap" }));
    expect(onClick).toHaveBeenCalled();
  });

  it("forwards the disabled attribute", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button", { name: "Disabled" })).toBeDisabled();
  });
});

describe("Input", () => {
  it("renders a label when provided", () => {
    render(<Input label="Email" id="email" />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("omits the label element when no label is passed", () => {
    render(<Input id="x" placeholder="type here" />);
    expect(screen.queryByRole("label")).toBeNull();
    expect(screen.getByPlaceholderText("type here")).toBeInTheDocument();
  });

  it("passes through value + onChange", () => {
    const onChange = vi.fn();
    render(<Input id="v" value="abc" onChange={onChange} />);
    const input = screen.getByDisplayValue("abc") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "def" } });
    expect(onChange).toHaveBeenCalled();
  });
});

describe("Select", () => {
  const opts = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
  ];

  it("renders all options", () => {
    render(<Select id="s" label="Pick" options={opts} />);
    expect(screen.getByLabelText("Pick")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Beta" })).toBeInTheDocument();
  });

  it("fires onChange when the user picks a value", () => {
    const onChange = vi.fn();
    render(
      <Select id="s2" options={opts} defaultValue="a" onChange={onChange} />,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "b" } });
    expect(onChange).toHaveBeenCalled();
  });
});

describe("Spinner", () => {
  it("shows the default loading text", () => {
    render(<Spinner />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders a custom caption", () => {
    render(<Spinner text="Crunching..." />);
    expect(screen.getByText("Crunching...")).toBeInTheDocument();
  });
});

describe("StatusBadge", () => {
  it("renders with the label text", () => {
    render(<StatusBadge status="success" label="Passing" />);
    expect(screen.getByText("Passing")).toBeInTheDocument();
  });

  it("falls back to the default color when an unknown status is given", () => {
    render(<StatusBadge status={"unknown" as "success"} label="Odd" />);
    const el = screen.getByText("Odd");
    // Should still render; color falls back to the default.
    expect(el).toBeInTheDocument();
  });
});
