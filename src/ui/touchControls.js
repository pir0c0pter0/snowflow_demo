/** Touch controls feed the same state as keyboard/mouse, with one owner per gesture. */
export const touch = { moveX: 0, moveZ: 0, sprint: false, surf: false, spellHeld2: false };

export function initTouchControls(canvas, input, onToggleOverlay) {
    const controls = document.getElementById("touch-controls");
    const stick = document.getElementById("touch-move");
    const thumb = stick.querySelector("span");
    const pointers = new Map();
    const enable = () => document.documentElement.classList.add("touch-enabled");
    if (navigator.maxTouchPoints > 0 || matchMedia("(any-pointer: coarse)").matches) enable();

    function setButton(button, held) {
        const name = button.dataset.action;
        button.classList.toggle("held", held);
        if (name === "sprint" || name === "surf" || name === "spell2") {
            button.setAttribute("aria-pressed", String(held));
            touch[name === "spell2" ? "spellHeld2" : name] = held;
        }
        if (held && name.startsWith("spell")) input.spellPressed = Number(name.slice(-1));
    }

    function move(e) {
        const p = pointers.get(e.pointerId);
        if (!p) return;
        if (p.action === "move") {
            const rect = stick.getBoundingClientRect();
            const radius = rect.width * 0.32;
            let x = (e.clientX - rect.left - rect.width / 2) / radius;
            let z = (rect.top + rect.height / 2 - e.clientY) / radius;
            const length = Math.hypot(x, z);
            const scale = Math.max(1, length);
            x /= scale;
            z /= scale;
            touch.moveX = length > 0.12 ? x : 0;
            touch.moveZ = length > 0.12 ? z : 0;
            thumb.style.transform = `translate(${x * radius}px, ${-z * radius}px)`;
        } else if (p.action === "look") {
            input.lookX += (e.clientX - p.x) * 0.004;
            input.lookY += (e.clientY - p.y) * 0.004;
        }
        p.x = e.clientX;
        p.y = e.clientY;
    }

    function start(e) {
        const isCanvas = e.currentTarget === canvas;
        if (isCanvas && e.pointerType !== "touch" && e.pointerType !== "pen") return;
        if (e.button !== 0) return;
        const button = isCanvas ? null : e.target.closest("button[data-action]");
        const action = isCanvas ? "look" : button?.dataset.action;
        if (!action) return;
        e.preventDefault();
        enable();
        // Ignore an extra finger on an occupied control; never steal its release.
        for (const p of pointers.values()) if (p.action === action) return;
        const target = e.currentTarget;
        pointers.set(e.pointerId, { action, button, target, x: e.clientX, y: e.clientY });
        target.setPointerCapture(e.pointerId);
        if (action === "move") move(e);
        else if (button) setButton(button, true);
    }

    function finish(e) {
        const p = pointers.get(e.pointerId);
        if (!p) return;
        pointers.delete(e.pointerId);
        if (p.action === "move") {
            touch.moveX = touch.moveZ = 0;
            thumb.style.transform = "";
        } else if (p.button) setButton(p.button, false);
        if (p.target.hasPointerCapture(e.pointerId)) p.target.releasePointerCapture(e.pointerId);
    }
    // Keep a single update path for pointer and keyboard activation.
    for (const button of controls.querySelectorAll("button[data-action]")) {
        if (button === stick) continue; // Arrow keys already move through the input module.
        setButton(button, false);
        button.addEventListener("click", (e) => {
            // Screen readers can activate buttons without sending pointer events.
            if (e.detail !== 0) return;
            setButton(button, !button.classList.contains("held"));
            if (!["sprint", "surf", "spell2"].includes(button.dataset.action)) setButton(button, false);
        });
        button.addEventListener("keydown", (e) => {
            if (e.code !== "Space" && e.code !== "Enter") return;
            e.preventDefault();
            if (!e.repeat) setButton(button, true);
        });
        button.addEventListener("keyup", (e) => {
            if (e.code !== "Space" && e.code !== "Enter") return;
            e.preventDefault();
            setButton(button, false);
        });
        button.addEventListener("blur", () => setButton(button, false));
    }

    for (const target of [canvas, controls]) {
        target.addEventListener("pointerdown", start);
        target.addEventListener("pointermove", move);
        target.addEventListener("pointerup", finish);
        target.addEventListener("pointercancel", finish);
        target.addEventListener("lostpointercapture", finish);
        target.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    // Ordinary buttons retain native keyboard and assistive-technology activation.
    controls.querySelector('[data-command="settings"]').addEventListener("click", () => {
        reset();
        onToggleOverlay?.();
    });
    for (const button of controls.querySelectorAll("[data-zoom]")) {
        button.addEventListener("click", () => { input.zoomDelta += Number(button.dataset.zoom); });
    }

    function reset() {
        for (const pointerId of pointers.keys()) finish({ pointerId });
        for (const button of controls.querySelectorAll("button[data-action]")) {
            if (button !== stick) setButton(button, false);
        }
    }
    window.addEventListener("resize", reset);
    return reset;
}
