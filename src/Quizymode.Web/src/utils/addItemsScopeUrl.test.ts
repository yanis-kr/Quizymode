import { describe, expect, it } from "vitest";
import {
  buildAddItemsPathWithParams,
  keywordsParamFromScope,
  mergeKeywordsForAddItemsUrl,
  parseKeywordsParam,
} from "./addItemsScopeUrl";

describe("addItemsScopeUrl", () => {
  it("merges path and query keywords with case-insensitive dedupe", () => {
    expect(
      mergeKeywordsForAddItemsUrl(
        [" Algebra ", "Geometry", ""],
        ["geometry", "  Trigonometry  ", "algebra"]
      )
    ).toEqual(["Algebra", "Geometry", "Trigonometry"]);
  });

  it("builds an add-items URL with trimmed category and merged keywords", () => {
    expect(
      buildAddItemsPathWithParams(
        "  Mathematics  ",
        ["Algebra"],
        ["geometry", "Algebra"]
      )
    ).toBe("/items/add?category=Mathematics&keywords=Algebra%2Cgeometry");
  });

  it("omits empty params when no category or keywords are present", () => {
    expect(buildAddItemsPathWithParams("   ", [], ["   "])).toBe("/items/add");
  });

  it("builds ranked keyword params from scope fields", () => {
    expect(
      keywordsParamFromScope(" Algebra ", " Geometry ", " trig, calculus , ")
    ).toBe("Algebra,Geometry,trig,calculus");
    expect(keywordsParamFromScope(" ", "", " , ")).toBeUndefined();
  });

  it("parses ranked keywords back into scope fields", () => {
    expect(parseKeywordsParam("algebra,geometry,trig,calculus")).toEqual({
      rank1: "algebra",
      rank2: "geometry",
      extrasJoined: "trig, calculus",
    });

    expect(parseKeywordsParam(null)).toEqual({
      rank1: "",
      rank2: "",
      extrasJoined: "",
    });
  });
});
