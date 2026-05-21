const assert = require("node:assert/strict");
const test = require("node:test");

const { constrainFloatingWindow, placementEdge } = require("../.test-build/utils/geometry.js");

const wideRect = {
  left: 0,
  top: 0,
  width: 1000,
  height: 200
};

test("placement edge uses proportional regions for tab, menu, and toolbar drag", () => {
  assert.equal(placementEdge(650, 100, wideRect), "right");
  assert.equal(placementEdge(350, 100, wideRect), "left");
  assert.equal(placementEdge(500, 20, wideRect), "top");
  assert.equal(placementEdge(500, 180, wideRect), "bottom");
});

test("placement edge clamps points outside the pane", () => {
  assert.equal(placementEdge(1200, 100, wideRect), "right");
  assert.equal(placementEdge(-200, 100, wideRect), "left");
  assert.equal(placementEdge(500, -100, wideRect), "top");
  assert.equal(placementEdge(500, 300, wideRect), "bottom");
});

test("floating window constraints keep the full window inside the viewport", () => {
  global.window = {
    innerWidth: 1000,
    innerHeight: 700
  };

  const win = constrainFloatingWindow({
    x: 980,
    y: 690,
    width: 360,
    height: 240
  });

  assert.equal(win.x + win.width, 1000);
  assert.equal(win.y + win.height, 700);

  delete global.window;
});

test("floating window constraints shrink oversized windows before clamping position", () => {
  global.window = {
    innerWidth: 360,
    innerHeight: 260
  };

  const win = constrainFloatingWindow({
    x: 200,
    y: 200,
    width: 900,
    height: 900
  });

  assert.equal(win.width, 336);
  assert.equal(win.height, 236);
  assert.equal(win.x + win.width, 360);
  assert.equal(win.y + win.height, 260);

  delete global.window;
});
