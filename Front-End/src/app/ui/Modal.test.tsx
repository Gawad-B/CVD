import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

function renderModal(onClose = vi.fn()) {
  render(
    <>
      <button>outside trigger</button>
      <Modal open onClose={onClose} title="Add patient">
        <input aria-label="Name" />
        <button>Save</button>
      </Modal>
    </>
  );
  return onClose;
}

describe("Modal", () => {
  it("renders an accessible dialog and nothing when closed", () => {
    const { rerender } = render(
      <Modal open onClose={() => undefined} title="Add patient">
        body
      </Modal>
    );
    expect(screen.getByRole("dialog", { name: "Add patient" })).toBeInTheDocument();
    rerender(
      <Modal open={false} onClose={() => undefined} title="Add patient">
        body
      </Modal>
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const onClose = renderModal();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on outside click but not on clicks inside the dialog", () => {
    const onClose = renderModal();
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the dialog and traps Tab / Shift+Tab", async () => {
    renderModal();
    const close = screen.getByRole("button", { name: "Close dialog" });
    const save = screen.getByRole("button", { name: "Save" });
    expect(close).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByLabelText("Name")).toHaveFocus();
    await userEvent.tab();
    expect(save).toHaveFocus();
    await userEvent.tab();
    expect(close).toHaveFocus(); // wrapped, never reaches "outside trigger"
    await userEvent.tab({ shift: true });
    expect(save).toHaveFocus();
  });

  it("restores focus to the opener on close", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(
      <Modal open onClose={() => undefined} title="T">
        <button>x</button>
      </Modal>
    );
    expect(opener).not.toHaveFocus();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("Escape closes only the topmost modal", async () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(
      <>
        <Modal open onClose={outer} title="Outer">
          <button>o</button>
        </Modal>
        <Modal open onClose={inner} title="Inner">
          <button>i</button>
        </Modal>
      </>
    );
    await userEvent.keyboard("{Escape}");
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });
});
