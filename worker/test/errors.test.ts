import { describe, expect, test } from "vitest";
import { ContractViolation } from "@stratum/core";
import { errorBody, loadFailure } from "../src/errors.js";

describe("legible load failures (tp-021)", () => {
  test("a contract failure on load carries the contract's own message", () => {
    const body = errorBody(loadFailure(new ContractViolation("event x: schema_version 3 unsupported")));
    expect(body.kind).toBe("load_failure");
    expect(body.error).toBe("stored log fails the contract on load: event x: schema_version 3 unsupported");
  });
  test("survives RPC flattening: only the message crosses the DO boundary", () => {
    const flattened = new Error(loadFailure(new Error("chain break at seq 4")).message);
    expect(errorBody(flattened).kind).toBe("load_failure");
  });
  test("anything else stays generic — internals never leak", () => {
    expect(errorBody(new TypeError("cannot read properties of undefined (reading 'secret')"))).toEqual({
      error: "internal error", kind: "internal",
    });
  });
});
