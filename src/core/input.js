/**
 * Raw input state. Everything lands in one mutable struct that systems poll —
 * no events fired into game code, no per-frame allocation.
 *
 * Mouse look uses pointer lock; touch gestures work without it.
 */

import { initTouchControls, touch } from "../ui/touchControls.js";

export const input = {
    // Movement axes, camera-relative, already normalised to a unit disc.
    moveX: 0,
    moveZ: 0,
    moving: false,

    // Accumulated look delta since last `endFrame()`, in radians.
    lookX: 0,
    lookY: 0,

    // Zoom, consumed by the camera rig.
    zoomDelta: 0,

    surf: false, // RMB or touch held
    sprint: false, // shift or touch held

    /** @type {number} 0 = none, else 1..5 — set on keydown, cleared each frame */
    spellPressed: 0,
    /** @type {boolean} spell 2 (Ribbon) is a held cast */
    spellHeld2: false,

    locked: false,
};

const keys = Object.create(null);

const LOOK_SCALE = 0.0022;

/** @type {(() => void)|null} */
let onToggleOverlay = null;
let resetTouch = () => {};

function resetInput() {
    for (const k in keys) keys[k] = false;
    resetTouch();
    input.moveX = input.moveZ = 0;
    input.moving = input.sprint = input.surf = input.spellHeld2 = false;
    endFrame();
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ onToggleOverlay?: () => void }} [hooks]
 */
export function initInput(canvas, hooks) {
    onToggleOverlay = hooks?.onToggleOverlay ?? null;
    resetTouch = initTouchControls(canvas, input, onToggleOverlay);

    canvas.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button === 0 && !input.locked) {
            canvas.requestPointerLock?.();
        }
    });

    document.addEventListener("pointerlockchange", () => {
        input.locked = document.pointerLockElement === canvas;
        document.documentElement.classList.toggle("pointer-locked", input.locked);
        if (!input.locked) {
            // Drop held state so the character doesn't run off while unfocused.
            resetInput();
        }
    });

    document.addEventListener("mousemove", (e) => {
        if (!input.locked) return;
        input.lookX += e.movementX * LOOK_SCALE;
        input.lookY += e.movementY * LOOK_SCALE;
    });

    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    document.addEventListener("mousedown", (e) => {
        if (!input.locked) return;
        if (e.button === 2) keys.MouseRight = true;
    });

    document.addEventListener("mouseup", (e) => {
        if (e.button === 2) keys.MouseRight = false;
    });

    document.addEventListener(
        "wheel",
        (e) => {
            if (!input.locked) return;
            e.preventDefault();
            input.zoomDelta += e.deltaY * 0.0016;
        },
        { passive: false }
    );

    window.addEventListener("keydown", (e) => {
        // Overlay toggle works whether or not the pointer is locked.
        if (e.code === "F1" || e.code === "Backquote") {
            e.preventDefault();
            onToggleOverlay?.();
            return;
        }
        if (e.repeat) return;
        keys[e.code] = true;

        const n = SPELL_KEYS[e.code];
        if (n) {
            input.spellPressed = n;
        }
    });

    window.addEventListener("keyup", (e) => {
        keys[e.code] = false;
    });

    window.addEventListener("blur", resetInput);
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) resetInput();
    });
}

const SPELL_KEYS = {
    Digit1: 1,
    Digit2: 2,
    Digit3: 3,
    Digit4: 4,
    Digit5: 5,
};

/** Resolve held keys and touch into input. Called once per frame before update. */
export function pollInput() {
    let x = touch.moveX;
    let z = touch.moveZ;
    if (keys.KeyW || keys.ArrowUp) z += 1;
    if (keys.KeyS || keys.ArrowDown) z -= 1;
    if (keys.KeyD || keys.ArrowRight) x += 1;
    if (keys.KeyA || keys.ArrowLeft) x -= 1;

    // Clamp to a unit disc so diagonals aren't faster.
    const len = Math.sqrt(x * x + z * z);
    if (len > 1) {
        x /= len;
        z /= len;
    }
    input.moveX = x;
    input.moveZ = z;
    input.moving = len > 0.001;
    input.sprint = !!(keys.ShiftLeft || keys.ShiftRight || touch.sprint);
    input.surf = !!(keys.MouseRight || touch.surf);
    input.spellHeld2 = !!(keys.Digit2 || touch.spellHeld2);
}

/** Clear per-frame accumulators. Called at the very end of the frame. */
export function endFrame() {
    input.lookX = 0;
    input.lookY = 0;
    input.zoomDelta = 0;
    input.spellPressed = 0;
}

export function isDown(code) {
    return !!keys[code];
}
