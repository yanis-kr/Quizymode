import { describe, expect, it } from "vitest";
import { classifySwipe } from "./swipeGesture";

describe("classifySwipe", () => {
  it("needs at least 50 px", () => {
    expect(classifySwipe(49, 0)).toBeNull();
    expect(classifySwipe(-49, 0)).toBeNull();
    expect(classifySwipe(50, 0)).toBe("right");
    expect(classifySwipe(-50, 0)).toBe("left");
  });

  it("needs to be mostly horizontal", () => {
    expect(classifySwipe(60, 40)).toBeNull();
    expect(classifySwipe(60, 39)).toBe("right");
    expect(classifySwipe(-80, 100)).toBeNull();
    expect(classifySwipe(5, 120)).toBeNull();
  });
});
