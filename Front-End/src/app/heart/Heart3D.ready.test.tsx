import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("three", async (importOriginal) => {
  const orig = await importOriginal<typeof import("three")>();
  class FakeRenderer {
    domElement = document.createElement("canvas");
    setPixelRatio() {}
    setSize() {}
    setClearColor() {}
    render() {}
    dispose() {}
    forceContextLoss() {}
  }
  return { ...orig, WebGLRenderer: FakeRenderer };
});
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", async () => {
  const THREE = await import("three");
  return {
    GLTFLoader: class {
      setMeshoptDecoder() {}
      load(_u: string, ok: (g: { scene: unknown }) => void) {
        const scene = new THREE.Group();
        scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
        ok({ scene });
      }
    },
  };
});

import Heart3D from "./Heart3D";

describe("Heart3D accessible name", () => {
  it("is an img with an illustration label once loaded", async () => {
    render(<Heart3D risk="high" bpm={118} />);
    const img = await waitFor(() => screen.getByRole("img"));
    expect(img).toHaveAccessibleName("3D heart illustration, high risk — not patient data");
  });
  it("uses a neutral unknown risk for an invalid risk", async () => {
    render(<Heart3D risk={"bogus" as never} bpm={0} />);
    const img = await waitFor(() => screen.getByRole("img"));
    expect(img).toHaveAccessibleName("3D heart illustration, unknown risk — not patient data");
  });
  it("describes a measured rate without claiming it is not patient data", async () => {
    render(<Heart3D risk="medium" bpm={72} measured />);
    const img = await waitFor(() => screen.getByRole("img"));
    expect(img).toHaveAccessibleName("3D heart illustration, medium risk; beat rate from measured 72 bpm");
  });
});
