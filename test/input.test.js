import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Small DOM surface so the real event handlers can run without a GPU/browser.
class Element extends EventTarget {
    constructor(dataset = {}) {
        super();
        this.dataset = dataset;
        this.style = {};
        this.classes = new Set();
        this.captures = new Set();
        this.attributes = {};
        this.classList = {
            add: (name) => this.classes.add(name),
            remove: (name) => this.classes.delete(name),
            contains: (name) => this.classes.has(name),
            toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name),
        };
    }
    closest() { return this; }
    querySelector() { return thumb; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
    setAttribute(name, value) { this.attributes[name] = value; }
    setPointerCapture(id) { this.captures.add(id); }
    hasPointerCapture(id) { return this.captures.has(id); }
    releasePointerCapture(id) { this.captures.delete(id); }
}

const canvas = new Element();
const controls = new Element();
const thumb = new Element();
const buttons = Object.fromEntries(["move", "sprint", "surf", "spell1", "spell2", "spell3", "spell4", "spell5"]
    .map((action) => [action, new Element({ action })]));
const settings = new Element();
const zoom = [new Element({ zoom: "-0.8" }), new Element({ zoom: "0.8" })];
controls.querySelector = () => settings;
controls.querySelectorAll = (selector) => selector === "[data-zoom]" ? zoom : Object.values(buttons);
globalThis.document = new Element();
document.documentElement = new Element();
document.getElementById = (id) => ({ "touch-controls": controls, "touch-move": buttons.move })[id];
globalThis.window = new EventTarget();
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { maxTouchPoints: 5 } });
globalThis.matchMedia = () => ({ matches: true });

function emit(target, type, props = {}) {
    const e = new Event(type, { cancelable: true });
    for (const [key, value] of Object.entries(props)) Object.defineProperty(e, key, { value });
    target.dispatchEvent(e);
}
function pointer(target, type, id, x = 50, y = 50) {
    emit(target === canvas ? canvas : controls, type, {
        target, pointerId: id, pointerType: "touch", button: 0, clientX: x, clientY: y,
    });
}
function key(type, code) { emit(window, type, { code }); }

const { initInput, input, pollInput, endFrame } = await import("../src/core/input.js");
let toggles = 0;
let lockRequests = 0;
canvas.requestPointerLock = () => { lockRequests++; };
initInput(canvas, { onToggleOverlay: () => toggles++ });
beforeEach(() => {
    emit(window, "blur");
    document.hidden = false;
    document.pointerLockElement = null;
    emit(document, "pointerlockchange");
});

test("independent fingers move, look, surf and hold Ribbon across frames", () => {
    pointer(buttons.move, "pointerdown", 1, 82, 18);
    pointer(canvas, "pointerdown", 2, 150, 80);
    pointer(buttons.surf, "pointerdown", 3);
    pointer(buttons.spell2, "pointerdown", 4);
    pointer(canvas, "pointermove", 2, 175, 70);
    pollInput();
    assert.ok(Math.abs(Math.hypot(input.moveX, input.moveZ) - 1) < 1e-10);
    assert.ok(input.moveX > 0 && input.moveZ > 0);
    assert.equal(input.surf, true);
    assert.equal(input.spellHeld2, true);
    assert.equal(input.spellPressed, 2);
    assert.equal(input.lookX, 0.1);
    assert.equal(input.lookY, -0.04);
    assert.equal(lockRequests, 0);
    endFrame();
    pollInput();
    assert.equal(input.spellPressed, 0);
    assert.equal(input.lookX, 0);
    assert.equal(input.spellHeld2, true);
    pointer(buttons.move, "pointerup", 1, 800, 800);
    pollInput();
    assert.equal(input.moving, false);
    assert.equal(input.surf, true);
    pointer(buttons.spell2, "pointercancel", 4);
    pollInput();
    assert.equal(input.spellHeld2, false);
});

test("extra fingers cannot steal a control or release its owner", () => {
    pointer(buttons.move, "pointerdown", 1, 82, 50);
    pointer(buttons.move, "pointerdown", 2, 18, 50);
    pointer(buttons.move, "pointerup", 2);
    pollInput();
    assert.equal(input.moveX, 1);
    pointer(buttons.move, "lostpointercapture", 1);
    pollInput();
    assert.equal(input.moveX, 0);
});

test("keyboard and mouse remain held when the matching touch is released", () => {
    document.pointerLockElement = canvas;
    emit(document, "pointerlockchange");
    key("keydown", "KeyW");
    key("keydown", "ShiftLeft");
    key("keydown", "Digit2");
    emit(document, "mousedown", { button: 2 });
    for (const [i, name] of ["sprint", "surf", "spell2"].entries()) {
        pointer(buttons[name], "pointerdown", i + 1);
        pointer(buttons[name], "pointerup", i + 1);
    }
    pollInput();
    assert.equal(input.moveZ, 1);
    assert.equal(input.sprint, true);
    assert.equal(input.surf, true);
    assert.equal(input.spellHeld2, true);
    pointer(buttons.surf, "pointerdown", 7);
    emit(document, "mouseup", { button: 2 });
    pollInput();
    assert.equal(input.surf, true);
    emit(document, "mousemove", { movementX: 10, movementY: -5 });
    emit(document, "wheel", { deltaY: 100 });
    assert.ok(Math.abs(input.lookX - 0.022) < 1e-10);
    assert.equal(input.zoomDelta, 0.16);
    emit(canvas, "pointerdown", { pointerType: "mouse", button: 0 });
    assert.equal(lockRequests, 0); // Already locked.
});

test("only a mouse requests pointer lock, and keyboard diagonals stay normalized", () => {
    emit(canvas, "pointerdown", { pointerType: "touch", button: 0, pointerId: 20, clientX: 0, clientY: 0 });
    assert.equal(lockRequests, 0);
    emit(canvas, "pointercancel", { pointerId: 20 });
    emit(canvas, "pointerdown", { pointerType: "mouse", button: 0 });
    assert.equal(lockRequests, 1);
    key("keydown", "KeyW");
    key("keydown", "KeyD");
    pollInput();
    assert.ok(Math.abs(Math.hypot(input.moveX, input.moveZ) - 1) < 1e-10);
    assert.ok(input.moveX > 0 && input.moveZ > 0);
});

test("all spells trigger once, while run, zoom and settings work without a keyboard", () => {
    for (let n = 1; n <= 5; n++) {
        pointer(buttons[`spell${n}`], "pointerdown", n);
        assert.equal(input.spellPressed, n);
        pointer(buttons[`spell${n}`], "pointerup", n);
        endFrame();
        assert.equal(input.spellPressed, 0);
    }
    pointer(buttons.sprint, "pointerdown", 8);
    pollInput();
    assert.equal(input.sprint, true);
    emit(zoom[0], "click");
    assert.equal(input.zoomDelta, -0.8);
    emit(zoom[1], "click");
    assert.equal(input.zoomDelta, 0);
    emit(settings, "click");
    pollInput();
    assert.equal(input.sprint, false);
    assert.equal(toggles, 1);
});

test("cancel, lost capture, blur, hidden tab, resize and unlock release held input", () => {
    const resetEvents = [
        () => emit(window, "blur"),
        () => { document.hidden = true; emit(document, "visibilitychange"); },
        () => emit(window, "resize"),
        () => emit(document, "pointerlockchange"),
    ];
    for (const reset of resetEvents) {
        pointer(buttons.move, "pointerdown", 1, 50, 18);
        pointer(buttons.surf, "pointerdown", 2);
        pointer(buttons.spell2, "pointerdown", 3);
        reset();
        pollInput();
        assert.equal(input.moving || input.surf || input.spellHeld2, false);
        assert.equal(controls.captures.size, 0);
    }
    pointer(buttons.surf, "pointerdown", 4);
    pointer(buttons.surf, "lostpointercapture", 4);
    pollInput();
    assert.equal(input.surf, false);
});

test("keyboard and assistive activation operate action buttons", () => {
    emit(buttons.spell2, "keydown", { code: "Space" });
    pollInput();
    assert.equal(input.spellHeld2, true);
    assert.equal(buttons.spell2.attributes["aria-pressed"], "true");
    emit(buttons.spell2, "keyup", { code: "Space" });
    pollInput();
    assert.equal(input.spellHeld2, false);
    for (let i = 0; i < 2; i++) {
        endFrame();
        emit(buttons.spell1, "click", { detail: 0 });
        assert.equal(input.spellPressed, 1);
    }
    emit(buttons.surf, "click", { detail: 0 });
    pollInput();
    assert.equal(input.surf, true);
    emit(buttons.surf, "click", { detail: 0 });
    pollInput();
    assert.equal(input.surf, false);
});
