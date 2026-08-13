import assert from "node:assert";

import jsdom_global from "jsdom-global";
import { DataSet } from "vis-data/esnext";

import BackgroundItem from "../lib/timeline/component/item/BackgroundItem.js";

const internals = {};

const buildParent = ({
  groupId = 1,
  top = 48,
  height = 64,
  withItemsContainer = true,
} = {}) => {
  const background = document.createElement("div");
  const backgroundItemsContainer = withItemsContainer
    ? document.createElement("div")
    : null;
  const ungrouped = document.createElement("div");

  if (backgroundItemsContainer) {
    backgroundItemsContainer.style.transform = "translateX(0px)";
    background.appendChild(backgroundItemsContainer);
  }
  ungrouped.style.transform = "translateX(0px)";
  document.body.append(background, ungrouped);

  return {
    groupId,
    top,
    height,
    subgroups: {},
    dom: {
      background,
      backgroundItemsContainer,
      ungrouped,
    },
    itemSet: {
      itemsData: new DataSet(),
    },
  };
};

const buildItem = (parent, data, orientation = "top") => {
  parent.itemSet.itemsData.add(data);
  const item = new BackgroundItem(data, null, {
    editable: false,
    orientation: { item: orientation },
  });
  item.id = data.id;
  item.setParent(parent);
  item.redraw();
  return item;
};

describe("Timeline BackgroundItem", () => {
  before(() => {
    internals.jsdom = jsdom_global();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  after(() => {
    internals.jsdom();
  });

  it("positions grouped backgrounds locally inside the transformed item wrapper", () => {
    const parent = buildParent();
    const item = buildItem(parent, {
      id: "background",
      start: 0,
      end: 1,
      type: "background",
    });

    item.repositionY();

    assert.equal(item.dom.box.parentNode, parent.dom.backgroundItemsContainer);
    assert.equal(item.dom.box.style.top, "0px");
    assert.equal(item.dom.box.style.height, "64px");
    assert.equal(
      parent.dom.backgroundItemsContainer.style.transform,
      "translateX(0px)",
    );
  });

  it("positions grouped background subgroups locally inside the transformed item wrapper", () => {
    const parent = buildParent();
    parent.subgroups.operations = { top: 7, height: 20 };
    const item = buildItem(parent, {
      id: "background-subgroup",
      start: 0,
      end: 1,
      type: "background",
      subgroup: "operations",
    });

    item.repositionY();

    assert.equal(item.dom.box.style.top, "7px");
    assert.equal(item.dom.box.style.height, "20px");
  });

  it("positions ungrouped backgrounds locally inside their transformed container", () => {
    const parent = buildParent({ groupId: "__ungrouped__" });
    const item = buildItem(parent, {
      id: "ungrouped-background",
      start: 0,
      end: 1,
      type: "background",
    });

    item.repositionY();

    assert.equal(item.dom.box.parentNode, parent.dom.ungrouped);
    assert.equal(item.dom.box.style.top, "0px");
  });

  it("keeps absolute group coordinates without an item wrapper", () => {
    const parent = buildParent({ withItemsContainer: false });
    const item = buildItem(parent, {
      id: "legacy-background",
      start: 0,
      end: 1,
      type: "background",
    });

    item.repositionY();

    assert.equal(item.dom.box.parentNode, parent.dom.background);
    assert.equal(item.dom.box.style.top, "48px");
  });
});
