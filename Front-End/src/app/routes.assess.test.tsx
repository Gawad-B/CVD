import { render, screen, waitFor } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getPatients: vi.fn(),
  getRiskAssessments: vi.fn(),
  getDashboardStats: vi.fn(),
  submitRiskAssessment: vi.fn(),
}));
vi.mock("./api/client", () => api);
vi.mock("./context/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: { userId: 1, username: "doc", email: "", fullName: "Doc", role: "doctor" },
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}));

import { appRoutes } from "./routes";

describe("router: legacy assess deep link", () => {
  it("redirects /patients/:id/assess to /assessments?patient=:id with the patient preselected", async () => {
    api.getRiskAssessments.mockResolvedValue([]);
    api.getDashboardStats.mockResolvedValue({ pendingReview: 0 });
    api.getPatients.mockResolvedValue([
      { patientId: 7, externalPatientCode: "P-7", sex: "male", firstName: "Ned", lastName: "Stark", dateOfBirth: "1980-05-05", phone: "", email: "", createdAt: "", lastAssessment: null },
    ]);
    const router = createMemoryRouter(appRoutes, { initialEntries: ["/patients/7/assess"] });
    render(<RouterProvider router={router} />);

    const select = (await screen.findByLabelText("Patient")) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe("7"));
    expect(router.state.location.pathname).toBe("/assessments");
    expect(router.state.location.search).toBe("?patient=7");
  });
});
