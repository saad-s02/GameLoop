// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SourceBadge } from "./SourceBadge";

describe("SourceBadge", () => {
  it("renders the provenance class as visible text, not color alone", () => {
    render(<><SourceBadge source="live" /><SourceBadge source="snapshot" /><SourceBadge source="simulated" /></>);
    expect(screen.getByText("LIVE")).toBeDefined();
    expect(screen.getByText("SNAPSHOT")).toBeDefined();
    expect(screen.getByText("SIMULATED")).toBeDefined();
  });
});
