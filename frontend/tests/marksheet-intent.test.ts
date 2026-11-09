import { describe, expect, it } from "vitest";
import { classifyMarksheetRequest } from "../lib/marksheet-intent";

const meera = {
  username: "VU003",
  name: "Meera Nair",
  synthetic_student_id: "VU-SYN-103",
};

describe("marksheet request identity guard", () => {
  it("allows a request for the signed-in student's own marksheet", () => {
    expect(classifyMarksheetRequest("show me my marksheet", meera)).toBe("self");
    expect(classifyMarksheetRequest("download Meera Nair's marksheet", meera)).toBe("self");
  });

  it("refuses to trigger a PDF download for another named synthetic account", () => {
    expect(classifyMarksheetRequest("show me Isha's marksheet", meera)).toBe("other");
    expect(classifyMarksheetRequest("show me VU001's marksheet", meera)).toBe("other");
    expect(classifyMarksheetRequest("generate VU-SYN-106 transcript", meera)).toBe("other");
  });

  it("does not classify unrelated prompts as marksheet requests", () => {
    expect(classifyMarksheetRequest("what is a marksheet?", meera)).toBe("none");
    expect(classifyMarksheetRequest("show me my CGPA", meera)).toBe("none");
  });
});
