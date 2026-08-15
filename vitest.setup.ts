import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// vitest.config.ts does not set test.globals, so @testing-library/react's
// own automatic afterEach(cleanup) registration (which only fires when it
// detects a global afterEach, the Jest-style convention) never runs here —
// without this, DOM from one test leaks into the next within the same
// file, and multiple it() blocks calling render() on the same component
// start finding duplicate elements.
afterEach(() => {
  cleanup();
});
