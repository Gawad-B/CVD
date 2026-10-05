// Date formatting assertions must not depend on the machine's timezone.
process.env.TZ = "UTC";

import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());
