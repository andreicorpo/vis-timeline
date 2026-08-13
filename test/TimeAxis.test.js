import assert from "node:assert";

import jsdom_global from "jsdom-global";

import TimeAxis from "../lib/timeline/component/TimeAxis.js";

const internals = {};

describe("Timeline TimeAxis", () => {
  before(() => {
    internals.jsdom = jsdom_global();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  after(() => {
    internals.jsdom();
  });

  it("pans inner content without moving the clipping containers", () => {
    const axis = new TimeAxis({}, {});

    axis._applyAxisPan(-320);

    assert.equal(axis.dom.foreground.style.transform, "");
    assert.equal(axis.dom.background.style.transform, "");
    assert.equal(
      axis.dom.foregroundContent.style.transform,
      "translateX(320px)",
    );
    assert.equal(
      axis.dom.backgroundContent.style.transform,
      "translateX(320px)",
    );
    assert.equal(axis.dom.foregroundContent.parentNode, axis.dom.foreground);
    assert.equal(axis.dom.backgroundContent.parentNode, axis.dom.background);
  });
});
