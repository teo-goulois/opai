import { useEffect, useRef, type ReactNode, type RefObject } from "react";

// A pan-and-zoom surface for the design system canvas. It moves a "world"
// element with one CSS transform and never touches what it contains:
// - pan by dragging empty space, with the trackpad or wheel, or with the
//   arrow keys while the canvas itself has focus;
// - zoom with Ctrl/Cmd + wheel or a trackpad pinch (around the cursor), a
//   two-finger pinch on touch screens, or + and - on the keyboard;
// - focus moving to a hidden control brings it into view.
// Only the camera is saved, in localStorage, in a versioned format.

export type Camera = { x: number; y: number; scale: number };

const MIN_SCALE = 0.1;
const MAX_SCALE = 3;
const FIT_PADDING = 48;
const STORAGE_VERSION = 1;
const DEFAULT_CAMERA: Camera = { x: 48, y: 96, scale: 1 };

export type CanvasControls = {
  fit: () => void;
  reset: () => void;
  zoomBy: (factor: number) => void;
};

function isValidCamera(value: unknown): value is Camera {
  if (!value || typeof value !== "object") return false;
  const { x, y, scale } = value as Record<string, unknown>;
  return (
    typeof x === "number" &&
    typeof y === "number" &&
    typeof scale === "number" &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(scale) &&
    Math.abs(x) < 1e6 &&
    Math.abs(y) < 1e6 &&
    scale >= MIN_SCALE &&
    scale <= MAX_SCALE
  );
}

/** The saved camera, or null when missing, malformed, or from an unknown version. */
function loadCamera(key: string): Camera | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw || raw.length > 1000) return null;
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    const { version, camera } = data as { version?: unknown; camera?: unknown };
    // Version 1 is the only format so far; anything else falls back to defaults.
    return version === STORAGE_VERSION && isValidCamera(camera) ? camera : null;
  } catch {
    return null;
  }
}

function saveCamera(key: string, camera: Camera) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ version: STORAGE_VERSION, camera }));
  } catch {
    // Storage unavailable or full: the canvas still works, it just won't remember.
  }
}

const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/** Can `element` scroll further in this direction? Then the wheel belongs to it. */
function canScroll(element: HTMLElement, deltaX: number, deltaY: number) {
  const style = window.getComputedStyle(element);
  const scrollsY =
    /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight;
  const scrollsX =
    /(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth;
  if (scrollsY && deltaY !== 0) {
    if (
      deltaY < 0
        ? element.scrollTop > 0
        : element.scrollTop + element.clientHeight < element.scrollHeight
    ) {
      return true;
    }
  }
  if (scrollsX && deltaX !== 0) {
    if (
      deltaX < 0
        ? element.scrollLeft > 0
        : element.scrollLeft + element.clientWidth < element.scrollWidth
    ) {
      return true;
    }
  }
  return false;
}

export function ComponentCanvas({
  storageKey,
  label,
  controlsRef,
  zoomLabelRef,
  children,
}: {
  storageKey: string;
  /** Accessible name of the focusable canvas, with its keyboard shortcuts. */
  label: string;
  /** Filled with fit, reset, and zoom, for buttons outside the canvas. */
  controlsRef: RefObject<CanvasControls | null>;
  /** A text node kept in step with the zoom level, without re-rendering. */
  zoomLabelRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    const world = worldRef.current;
    if (!viewport || !world) return;

    let camera: Camera = loadCamera(storageKey) ?? DEFAULT_CAMERA;
    let frame = 0;
    let saveTimer = 0;
    let disposed = false;
    // Only a camera the user moved is worth saving.
    let moved = false;
    const pointers = new Map<number, { x: number; y: number }>();

    // Writes the transform at most once per animation frame.
    const render = () => {
      frame = 0;
      world.style.transform = `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`;
      if (zoomLabelRef?.current) {
        zoomLabelRef.current.textContent = `${Math.round(camera.scale * 100)}%`;
      }
    };

    const setCamera = (next: Camera) => {
      if (!isValidCamera(next)) return;
      // Keep part of the world on screen, so the view can't be lost.
      const bounds = viewport.getBoundingClientRect();
      const width = world.offsetWidth * next.scale;
      const height = world.offsetHeight * next.scale;
      const margin = 64;
      camera = {
        scale: next.scale,
        x: Math.min(bounds.width - margin, Math.max(margin - width, next.x)),
        y: Math.min(bounds.height - margin, Math.max(margin - height, next.y)),
      };
      moved = true;
      if (!frame) frame = window.requestAnimationFrame(render);
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => saveCamera(storageKey, camera), 300);
    };

    /** Zooms by `factor`, keeping the point under (clientX, clientY) still. */
    const zoomAt = (factor: number, clientX: number, clientY: number) => {
      const bounds = viewport.getBoundingClientRect();
      const scale = clampScale(camera.scale * factor);
      const px = clientX - bounds.left;
      const py = clientY - bounds.top;
      const ratio = scale / camera.scale;
      setCamera({ scale, x: px - (px - camera.x) * ratio, y: py - (py - camera.y) * ratio });
    };

    const fit = () => {
      const bounds = viewport.getBoundingClientRect();
      const width = world.offsetWidth;
      const height = world.offsetHeight;
      if (!width || !height || !bounds.width || !bounds.height) return;
      const scale = clampScale(
        Math.min(
          (bounds.width - FIT_PADDING * 2) / width,
          (bounds.height - FIT_PADDING * 2) / height,
          1,
        ),
      );
      setCamera({
        scale,
        x: (bounds.width - width * scale) / 2,
        y: Math.max(FIT_PADDING, (bounds.height - height * scale) / 2),
      });
    };

    controlsRef.current = {
      fit,
      reset: () => setCamera(DEFAULT_CAMERA),
      zoomBy: (factor) => {
        const bounds = viewport.getBoundingClientRect();
        zoomAt(factor, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      },
    };

    render();
    // No saved camera: fit once the layout and fonts have settled.
    if (!loadCamera(storageKey)) {
      void document.fonts.ready.then(() => {
        window.requestAnimationFrame(() => {
          if (!disposed) fit();
        });
      });
    }

    // Pointer: drag on empty space pans; two pointers pinch.
    let pinch: { distance: number; scale: number } | null = null;
    const isEmptySpace = (target: EventTarget | null) =>
      target instanceof HTMLElement && target.dataset.canvasEmpty === "true";

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !isEmptySpace(event.target)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        if (a && b) pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: camera.scale };
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size >= 2 && pinch) {
        const [a, b] = [...pointers.values()];
        if (!a || !b) return;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        const scale = clampScale(pinch.scale * (distance / pinch.distance));
        zoomAt(scale / camera.scale, (a.x + b.x) / 2, (a.y + b.y) / 2);
        return;
      }
      setCamera({
        ...camera,
        x: camera.x + event.clientX - previous.x,
        y: camera.y + event.clientY - previous.y,
      });
    };

    const endPointer = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
    };

    const clearPointers = () => {
      pointers.clear();
      pinch = null;
    };

    const onVisibility = () => {
      if (document.hidden) clearPointers();
    };

    // Wheel: Ctrl/Cmd (and trackpad pinch) zooms; otherwise pan, unless a
    // scrollable preview under the cursor can still scroll that way.
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        // Trackpad pinches send small deltas; mouse wheels send large steps.
        const speed = Math.abs(event.deltaY) >= 50 ? 0.002 : 0.01;
        zoomAt(Math.exp(-event.deltaY * speed), event.clientX, event.clientY);
        return;
      }
      for (
        let element = event.target instanceof HTMLElement ? event.target : null;
        element && element !== viewport;
        element = element.parentElement
      ) {
        if (canScroll(element, event.deltaX, event.deltaY)) return;
      }
      event.preventDefault();
      const scaleY = event.deltaMode === 1 ? 16 : 1;
      setCamera({
        ...camera,
        x: camera.x - (event.shiftKey ? event.deltaY : event.deltaX) * scaleY,
        y: camera.y - (event.shiftKey ? 0 : event.deltaY) * scaleY,
      });
    };

    // Keyboard: only when the canvas itself has focus, never inside a preview.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target !== viewport || event.metaKey || event.ctrlKey || event.altKey) return;
      const step = event.shiftKey ? 256 : 64;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [step, 0],
        ArrowRight: [-step, 0],
        ArrowUp: [0, step],
        ArrowDown: [0, -step],
      };
      const move = moves[event.key];
      if (move) {
        event.preventDefault();
        setCamera({ ...camera, x: camera.x + move[0], y: camera.y + move[1] });
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        controlsRef.current?.zoomBy(1.2);
      } else if (event.key === "-") {
        event.preventDefault();
        controlsRef.current?.zoomBy(1 / 1.2);
      } else if (event.key === "0") {
        event.preventDefault();
        setCamera(DEFAULT_CAMERA);
      } else if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        fit();
      }
    };

    // Focus moving into a hidden preview control: bring it into view.
    const onFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLElement) || !world.contains(event.target)) return;
      const bounds = viewport.getBoundingClientRect();
      const rect = event.target.getBoundingClientRect();
      const margin = 32;
      let dx = 0;
      let dy = 0;
      if (rect.left < bounds.left + margin) dx = bounds.left + margin - rect.left;
      else if (rect.right > bounds.right - margin) dx = bounds.right - margin - rect.right;
      if (rect.top < bounds.top + margin) dy = bounds.top + margin - rect.top;
      else if (rect.bottom > bounds.bottom - margin) dy = bounds.bottom - margin - rect.bottom;
      if (dx || dy) setCamera({ ...camera, x: camera.x + dx, y: camera.y + dy });
    };

    // The browser may scroll the clipped viewport to show focus; the camera does that instead.
    const onScroll = () => {
      if (viewport.scrollTop || viewport.scrollLeft) {
        viewport.scrollTop = 0;
        viewport.scrollLeft = 0;
      }
    };

    // Sample links ("#") stay put; links to app pages navigate normally.
    const onClick = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a") : null;
      if (anchor && world.contains(anchor) && anchor.getAttribute("href")?.startsWith("#")) {
        event.preventDefault();
      }
    };

    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("pointermove", onPointerMove);
    viewport.addEventListener("pointerup", endPointer);
    viewport.addEventListener("pointercancel", endPointer);
    viewport.addEventListener("lostpointercapture", endPointer);
    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("keydown", onKeyDown);
    viewport.addEventListener("focusin", onFocusIn);
    viewport.addEventListener("scroll", onScroll);
    viewport.addEventListener("click", onClick, true);
    window.addEventListener("blur", clearPointers);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(saveTimer);
      if (moved) saveCamera(storageKey, camera);
      for (const id of pointers.keys()) {
        try {
          viewport.releasePointerCapture(id);
        } catch {
          // Already released.
        }
      }
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", endPointer);
      viewport.removeEventListener("pointercancel", endPointer);
      viewport.removeEventListener("lostpointercapture", endPointer);
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("keydown", onKeyDown);
      viewport.removeEventListener("focusin", onFocusIn);
      viewport.removeEventListener("scroll", onScroll);
      viewport.removeEventListener("click", onClick, true);
      window.removeEventListener("blur", clearPointers);
      document.removeEventListener("visibilitychange", onVisibility);
      controlsRef.current = null;
    };
  }, [storageKey, controlsRef, zoomLabelRef]);

  return (
    <div
      ref={viewportRef}
      role="application"
      aria-label={label}
      aria-roledescription="canvas"
      tabIndex={0}
      className="relative size-full overflow-hidden bg-neutral-2 outline-none focus-visible:outline-offset-[calc(-1*var(--border-l))] focus-visible:focus-ring"
    >
      {/* Empty space: where a drag or pinch pans the canvas. */}
      <div data-canvas-empty="true" className="absolute inset-0 touch-none" />
      <div
        ref={worldRef}
        className="pointer-events-none absolute top-0 left-0 origin-top-left will-change-transform"
      >
        {children}
      </div>
    </div>
  );
}
