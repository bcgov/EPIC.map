// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { scrollIntoNearestView } from "@/utils/scroll";

/** A list scrolled to 100, showing 200..400 of the viewport, with a row in it. */
const setUp = (rowTop: number, rowHeight = 20) => {
  const page = document.createElement("div");
  page.style.overflowY = "auto";
  const list = document.createElement("div");
  list.style.overflowY = "auto";
  list.scrollTop = 100;
  const wrapper = document.createElement("div");
  const row = document.createElement("button");
  wrapper.append(row);
  list.append(wrapper);
  page.append(list);
  document.body.append(page);
  page.scrollTop = 50;

  const box = (top: number, height: number) => () =>
    ({ top, bottom: top + height }) as DOMRect;
  list.getBoundingClientRect = box(200, 200);
  row.getBoundingClientRect = box(rowTop, rowHeight);
  return { page, list, row };
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("scrolling a row into its list's view", () => {
  it("scrolls up to a row above the view", () => {
    const { list, row } = setUp(150);

    scrollIntoNearestView(row);

    expect(list.scrollTop).toBe(50);
  });

  it("scrolls down just far enough for a row below the view", () => {
    const { list, row } = setUp(420);

    scrollIntoNearestView(row);

    expect(list.scrollTop).toBe(140);
  });

  it("shows the top of a row taller than the view", () => {
    const { list, row } = setUp(450, 500);

    scrollIntoNearestView(row);

    expect(list.scrollTop).toBe(350);
  });

  it("leaves a row in view, and the page, alone", () => {
    const { page, list, row } = setUp(250);

    scrollIntoNearestView(row);

    expect(list.scrollTop).toBe(100);
    expect(page.scrollTop).toBe(50);
  });

  it("does nothing for no row", () => {
    expect(() => scrollIntoNearestView(null)).not.toThrow();
  });
});
