import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Heart3D from "./Heart3D";
import { HeartCredit } from "./HeartCredit";

describe("Heart3D", () => {
  it("shows the fallback when WebGL is unavailable (jsdom) without throwing", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const { unmount } = render(<Heart3D risk="medium" bpm={91} />);
    expect(await screen.findByText("3D view unavailable")).toBeInTheDocument();
    unmount();
  });
});

describe("HeartCredit", () => {
  it("links the model and author safely", () => {
    render(<HeartCredit />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    links.forEach((a) => {
      expect(a).toHaveAttribute("target", "_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
    });
    expect(screen.getByText(/neshallads/)).toBeInTheDocument();
  });
});
