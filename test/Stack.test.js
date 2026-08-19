import assert from "node:assert";

import { stack } from "../lib/timeline/Stack.js";

const MARGIN = { item: { horizontal: 0, vertical: 5 }, axis: 2.5 };

/**
 * Minimal stand-in for a positioned timeline item, as seen by stack().
 * @param {number} left left edge in pixels
 * @param {number} width box width in pixels
 * @return {object} fake item
 */
function fakeItem(left, width) {
  return {
    left,
    width,
    renderedBoxWidth: width,
    height: 51,
    top: null,
    stack: true,
    options: { rtl: false },
    dom: { box: { clientWidth: width } },
  };
}

describe("Stack", function () {
  describe("stack", function () {
    it("keeps non-overlapping items on the first lane regardless of processing order", function () {
      // Items processed in descending-start order (as produced by custom
      // order functions, e.g. ordering by duration). Every horizontal
      // overlap window is legitimately empty here; a regression treated the
      // empty window's endIndex of 0 as "no bound" and chained all items
      // onto separate lanes.
      const items = [
        fakeItem(1784, 168),
        fakeItem(1469, 168),
        fakeItem(802, 252),
        fakeItem(349, 252),
      ];

      stack(items, MARGIN, true);

      for (const item of items) {
        assert.equal(item.top, MARGIN.axis);
      }
    });

    it("still stacks genuinely overlapping items in descending-start order", function () {
      const items = [
        fakeItem(300, 200),
        fakeItem(250, 200),
        fakeItem(120, 200),
      ];

      stack(items, MARGIN, true);

      const tops = items.map((item) => item.top).toSorted((a, b) => a - b);
      assert.deepEqual(tops, [2.5, 58.5, 114.5]);
    });

    it("stacks overlapping items and leaves detached items alone in mixed order", function () {
      const overlapA = fakeItem(500, 100);
      const overlapB = fakeItem(550, 100);
      const detached = fakeItem(1000, 100);

      stack([overlapB, detached, overlapA], MARGIN, true);

      assert.equal(detached.top, MARGIN.axis);
      const tops = [overlapA.top, overlapB.top].toSorted((a, b) => a - b);
      assert.deepEqual(tops, [2.5, 58.5]);
    });
  });
});
