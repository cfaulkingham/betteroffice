import { useEffect, useRef, type CSSProperties } from "react";
import type { TrackAxis } from "./SheetHeaders";

export type TrackTarget = { axis: TrackAxis; at: number; count: number };
export type TrackAction = TrackTarget & {
  type: "insertBefore" | "insertAfter" | "delete" | "unhide";
};
export const trackLimit = (axis: TrackAxis) =>
  axis === "row" ? 1_048_576 : 16_384;

export function trackActionLabel({ axis, count, type }: TrackAction): string {
  const tracks = count === 1 ? axis : `${count} ${axis}s`;
  if (type === "unhide") return `Unhide ${axis}s`;
  if (type === "delete") return `Delete ${tracks}`;
  const side =
    axis === "row"
      ? type === "insertBefore"
        ? "above"
        : "below"
      : type === "insertBefore"
      ? "left"
      : "right";
  return `Insert ${tracks} ${side}`;
}

const itemStyle: CSSProperties = {
  display: "block",
  width: "100%",
  border: 0,
  borderRadius: 4,
  padding: "9px 12px",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  textAlign: "left",
  cursor: "pointer",
};

/** Row and column actions with keyboard navigation. */
export function TrackMenu({
  target,
  hidden,
  label,
  left,
  top,
  onAction,
  onResize,
  onClose,
}: {
  target: TrackTarget;
  hidden: TrackTarget | null;
  label: string;
  left: number;
  top: number;
  onAction: (action: TrackAction) => boolean;
  onResize: () => void;
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    menu.current
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
    const outside = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node)) close.current();
    };
    const scrolled = () => close.current();
    document.addEventListener("mousedown", outside);
    window.addEventListener("scroll", scrolled, true);
    window.addEventListener("resize", scrolled);
    return () => {
      document.removeEventListener("mousedown", outside);
      window.removeEventListener("scroll", scrolled, true);
      window.removeEventListener("resize", scrolled);
    };
  }, []);
  return (
    <div
      ref={menu}
      role="menu"
      aria-label={`${label} options`}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape" || event.key === "Tab") {
          event.preventDefault();
          onClose();
          return;
        }
        const buttons = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)"
          )
        );
        const active = buttons.indexOf(
          document.activeElement as HTMLButtonElement
        );
        const next =
          event.key === "ArrowDown"
            ? (active + 1) % buttons.length
            : event.key === "ArrowUp"
            ? (active + buttons.length - 1) % buttons.length
            : event.key === "Home"
            ? 0
            : event.key === "End"
            ? buttons.length - 1
            : null;
        if (next !== null) {
          event.preventDefault();
          buttons[next]?.focus();
        }
      }}
      style={{
        position: "fixed",
        left: Math.max(8, Math.min(left, window.innerWidth - 228)),
        top: Math.max(8, Math.min(top, window.innerHeight - 240)),
        zIndex: 10_000,
        width: 220,
        maxWidth: "calc(100vw - 16px)",
        maxHeight: "calc(100vh - 16px)",
        overflowY: "auto",
        padding: 4,
        border: "1px solid #cbd5e1",
        borderRadius: 6,
        background: "#fff",
        color: "#202124",
        boxShadow: "0 4px 16px #0003",
        font: "13px system-ui, sans-serif",
      }}
    >
      {(["insertBefore", "insertAfter", "delete"] as const).map((type) => {
        const action = { ...target, type };
        return (
          <button
            key={type}
            type="button"
            role="menuitem"
            style={itemStyle}
            disabled={
              type === "insertAfter" &&
              target.at + target.count >= trackLimit(target.axis)
            }
            onClick={() => {
              if (onAction(action)) onClose();
            }}
          >
            {trackActionLabel(action)}
          </button>
        );
      })}
      {hidden && (
        <button
          type="button"
          role="menuitem"
          style={itemStyle}
          onClick={() => {
            if (onAction({ ...hidden, type: "unhide" })) onClose();
          }}
        >
          {trackActionLabel({ ...hidden, type: "unhide" })}
        </button>
      )}
      <div
        role="separator"
        style={{ borderTop: "1px solid #e2e8f0", margin: "4px 0" }}
      />
      <button
        type="button"
        role="menuitem"
        style={itemStyle}
        onClick={onResize}
      >
        {target.axis === "row" ? "Row height…" : "Column width…"}
      </button>
    </div>
  );
}
