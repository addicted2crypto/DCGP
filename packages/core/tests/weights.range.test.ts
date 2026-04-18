import { describe, it, expect } from "vitest";
import { EntropyMonitor } from "../src";

describe("EntropyMonitor weight validation", () => {
  it("throws when weights do not sum to 1.0", () => {
    expect(
      () =>
        new EntropyMonitor({
          weights: {
            gate_pressure: 0.5,
            drift_pressure: 0.5,
            confidence_decay: 0.5,
            citation_pressure: 0.5,
            session_age: 0.5,
          },
        }),
    ).toThrow(/sum to 1.0/);
  });

  it("accepts weights summing to exactly 1.0", () => {
    expect(
      () =>
        new EntropyMonitor({
          weights: {
            gate_pressure: 0.2,
            drift_pressure: 0.2,
            confidence_decay: 0.2,
            citation_pressure: 0.2,
            session_age: 0.2,
          },
        }),
    ).not.toThrow();
  });

  it("accepts weights within 0.001 of 1.0", () => {
    expect(
      () =>
        new EntropyMonitor({
          weights: {
            gate_pressure: 0.2001,
            drift_pressure: 0.2,
            confidence_decay: 0.2,
            citation_pressure: 0.2,
            session_age: 0.2,
          },
        }),
    ).not.toThrow();
  });

  it("throws when any single weight is negative", () => {
    expect(
      () =>
        new EntropyMonitor({
          weights: {
            gate_pressure: 1.5,
            drift_pressure: -0.5,
            confidence_decay: 0,
            citation_pressure: 0,
            session_age: 0,
          },
        }),
    ).toThrow(/\[0, 1\]/);
  });

  it("throws when any single weight exceeds 1.0", () => {
    expect(
      () =>
        new EntropyMonitor({
          weights: {
            gate_pressure: 1.2,
            drift_pressure: -0.1,
            confidence_decay: -0.05,
            citation_pressure: -0.05,
            session_age: 0,
          },
        }),
    ).toThrow(/\[0, 1\]/);
  });

  it("throws on NaN weight", () => {
    expect(
      () =>
        new EntropyMonitor({
          weights: {
            gate_pressure: NaN,
            drift_pressure: 0.25,
            confidence_decay: 0.2,
            citation_pressure: 0.2,
            session_age: 0.05,
          },
        }),
    ).toThrow();
  });
});
