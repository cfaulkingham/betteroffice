import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { GridMeta, Selection } from '@betteroffice/xlsx';

export type TrackAxis = 'row' | 'column';
export type TrackSize = {
  axis: TrackAxis;
  index: number;
  value: number | null;
};
export const HEADER_WIDTH = 52;
export const HEADER_HEIGHT = 24;
const limits = { row: { min: 6, max: 409 }, column: { min: 1, max: 255 } };
const round = (value: number) => Math.round(value * 100) / 100;

// These conversions match xlsx-render's screen geometry (96 dpi, 7 px MDW).
export function pixelsToTrackSize(axis: TrackAxis, pixels: number): number {
  return round(axis === 'row' ? pixels * 0.75 : (pixels - 5) / 7);
}
const clampSize = (axis: TrackAxis, value: number) =>
  round(Math.max(limits[axis].min, Math.min(limits[axis].max, value)));

function columnLabel(index: number): string {
  let label = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
  return label;
}
const trackLabel = (axis: TrackAxis, index: number) =>
  axis === 'row' ? `Row ${index + 1}` : `Column ${columnLabel(index)}`;
const chrome: CSSProperties = {
  position: 'absolute',
  background: '#f3f5f7',
  color: '#4b5563',
  boxSizing: 'border-box',
  overflow: 'hidden',
  userSelect: 'none',
  font: '12px system-ui, sans-serif',
};
const actionStyle: CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 4,
  padding: '6px 12px',
  color: '#202124',
  background: '#fff',
  cursor: 'pointer',
};

type Props = {
  grid: GridMeta;
  zoom: number;
  width: number;
  height: number;
  selection: Selection | null;
  readOnly: boolean;
  getSize: (axis: TrackAxis, index: number) => number;
  getPixelsPerUnit: (axis: TrackAxis, index: number) => number;
  onBegin: () => boolean;
  onResize: (sizes: TrackSize[]) => boolean;
  onFocusGrid: () => void;
};
type Drag = {
  axis: TrackAxis;
  index: number;
  pointerId: number;
  origin: number;
  size: number;
  value: number;
  edge: number;
  pixelsPerUnit: number;
};
type SizeTarget = {
  axis: TrackAxis;
  index: number;
  initial: number;
  text: string;
};

/** Visible, viewport-aligned labels and row/column sizing controls. */
export function SheetHeaders({
  grid,
  zoom,
  width,
  height,
  selection,
  readOnly,
  getSize,
  getPixelsPerUnit,
  onBegin,
  onResize,
  onFocusGrid,
}: Props) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [targets, setTargets] = useState<SizeTarget[] | null>(null);
  const updateDrag = (next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
  };
  const openSizes = (tracks: Array<{ axis: TrackAxis; index: number }>) => {
    if (readOnly || !onBegin()) return;
    updateDrag(null);
    setTargets(
      tracks.map(({ axis, index }) => {
        const initial = round(getSize(axis, index));
        return { axis, index, initial, text: String(initial) };
      })
    );
  };
  const closeSizes = () => {
    setTargets(null);
    onFocusGrid();
  };
  const movedSize = (current: Drag, event: PointerEvent<HTMLButtonElement>) => {
    const delta =
      ((current.axis === 'row' ? event.clientY : event.clientX) -
        current.origin) /
      zoom;
    return clampSize(
      current.axis,
      current.size + delta / current.pixelsPerUnit
    );
  };
  const startDrag = (
    event: PointerEvent<HTMLButtonElement>,
    axis: TrackAxis,
    index: number,
    edge: number
  ) => {
    if (event.button !== 0 || readOnly) return;
    event.preventDefault();
    event.stopPropagation();
    if (!onBegin()) return;
    const size = getSize(axis, index);
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    updateDrag({
      axis,
      index,
      pointerId: event.pointerId,
      origin: axis === 'row' ? event.clientY : event.clientX,
      size,
      value: size,
      pixelsPerUnit: getPixelsPerUnit(axis, index),
      edge,
    });
  };
  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    if (current?.pointerId === event.pointerId)
      updateDrag({ ...current, value: movedSize(current, event) });
  };
  const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const value = movedSize(current, event);
    updateDrag(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
    // A double-click opens the numeric dialog without generating empty undo entries.
    if (Math.abs(value - current.size) > 0.02)
      onResize([{ axis: current.axis, index: current.index, value }]);
  };
  const renderAxis = (axis: TrackAxis) => {
    const isRow = axis === 'row';
    const offsets = isRow ? grid.rowOffsets : grid.colOffsets;
    const indices = isRow ? grid.rowIndices : grid.colIndices;
    const start = isRow ? grid.startRow : grid.startCol;
    const selectedStart = selection
      ? Math.min(
          selection.anchor[isRow ? 'row' : 'col'],
          selection.focus[isRow ? 'row' : 'col']
        )
      : -1;
    const selectedEnd = selection
      ? Math.max(
          selection.anchor[isRow ? 'row' : 'col'],
          selection.focus[isRow ? 'row' : 'col']
        )
      : -1;
    return (
      <div
        data-testid={`xlsx-${axis}-headers`}
        aria-label={isRow ? 'Row headings' : 'Column headings'}
        role="group"
        style={{
          ...chrome,
          ...(isRow
            ? { left: 0, top: HEADER_HEIGHT, width: HEADER_WIDTH, height }
            : { left: HEADER_WIDTH, top: 0, width, height: HEADER_HEIGHT }),
          borderRight: isRow ? '1px solid #cbd5e1' : undefined,
          borderBottom: isRow ? undefined : '1px solid #cbd5e1',
        }}
      >
        {offsets.slice(0, -1).map((offset, slot) => {
          const index = indices?.[slot] ?? start + slot;
          const size = (offsets[slot + 1] - offset) * zoom;
          if (size <= 0) return null;
          const label = trackLabel(axis, index);
          const active = index >= selectedStart && index <= selectedEnd;
          return (
            <div
              key={index}
              data-testid={`xlsx-${axis}-header-${index}`}
              data-track-index={index}
              onDoubleClick={() => openSizes([{ axis, index }])}
              onContextMenu={(event) => {
                if (!readOnly) {
                  event.preventDefault();
                  openSizes([{ axis, index }]);
                }
              }}
              title={
                readOnly
                  ? label
                  : `${label} — drag its edge to resize; double-click to set a size`
              }
              style={{
                position: 'absolute',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
                background: active ? '#dcebe2' : '#f3f5f7',
                color: active ? '#175534' : '#4b5563',
                ...(isRow
                  ? {
                      top: offset * zoom,
                      left: 0,
                      height: size,
                      width: HEADER_WIDTH,
                      borderBottom: '1px solid #d9dee5',
                    }
                  : {
                      left: offset * zoom,
                      top: 0,
                      width: size,
                      height: HEADER_HEIGHT,
                      borderRight: '1px solid #d9dee5',
                    }),
              }}
            >
              <span
                aria-label={label}
                style={{
                  overflow: 'hidden',
                  padding: '0 3px',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                }}
              >
                {isRow ? index + 1 : columnLabel(index)}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  aria-label={`Resize ${isRow ? 'row' : 'column'} ${isRow ? index + 1 : columnLabel(index)}`}
                  tabIndex={
                    selection?.focus[isRow ? 'row' : 'col'] === index ? 0 : -1
                  }
                  data-testid={`xlsx-resize-${axis}-${index}`}
                  onPointerDown={(event) =>
                    startDrag(event, axis, index, offsets[slot + 1] * zoom)
                  }
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={() => updateDrag(null)}
                  onLostPointerCapture={() => updateDrag(null)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      event.stopPropagation();
                      updateDrag(null);
                    }
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openSizes([{ axis, index }]);
                    }
                  }}
                  style={{
                    position: 'absolute',
                    border: 0,
                    borderRadius: 0,
                    padding: 0,
                    margin: 0,
                    minWidth: 0,
                    minHeight: 0,
                    background: 'transparent',
                    touchAction: 'none',
                    zIndex: 1,
                    ...(isRow
                      ? {
                          bottom: -2,
                          left: 0,
                          width: '100%',
                          height: 6,
                          cursor: 'row-resize',
                        }
                      : {
                          right: -2,
                          top: 0,
                          height: '100%',
                          width: 6,
                          cursor: 'col-resize',
                        }),
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  };
  const guide = drag
    ? drag.edge + (drag.value - drag.size) * drag.pixelsPerUnit * zoom
    : 0;
  return (
    <>
      <button
        type="button"
        aria-label="Row and column size"
        title="Set the selected cell's row height and column width"
        disabled={readOnly || !selection}
        onClick={() =>
          selection &&
          openSizes([
            { axis: 'row', index: selection.focus.row },
            { axis: 'column', index: selection.focus.col },
          ])
        }
        style={{
          ...chrome,
          left: 0,
          top: 0,
          width: HEADER_WIDTH,
          height: HEADER_HEIGHT,
          border: '1px solid #cbd5e1',
          borderRadius: 0,
          padding: 0,
          fontWeight: 600,
          cursor: readOnly ? 'default' : 'pointer',
        }}
      >
        Size
      </button>
      {renderAxis('column')}
      {renderAxis('row')}
      {drag && (
        <div
          aria-hidden="true"
          data-testid="xlsx-resize-guide"
          style={{
            position: 'absolute',
            pointerEvents: 'none',
            zIndex: 10,
            ...(drag.axis === 'row'
              ? {
                  top: HEADER_HEIGHT + guide,
                  left: HEADER_WIDTH,
                  width,
                  borderTop: '1px dashed #217346',
                }
              : {
                  left: HEADER_WIDTH + guide,
                  top: HEADER_HEIGHT,
                  height,
                  borderLeft: '1px dashed #217346',
                }),
          }}
        >
          <span
            style={{
              position: 'absolute',
              padding: '3px 6px',
              background: '#175534',
              color: 'white',
              fontSize: 12,
              whiteSpace: 'nowrap',
            }}
          >
            {trackLabel(drag.axis, drag.index)}: {drag.value}{' '}
            {drag.axis === 'row' ? 'pt' : 'characters'}
          </span>
        </div>
      )}
      {targets &&
        createPortal(
          <SizeDialog
            targets={targets}
            onChange={setTargets}
            onClose={closeSizes}
            onApply={onResize}
          />,
          document.body
        )}
    </>
  );
}

function SizeDialog({
  targets,
  onChange,
  onClose,
  onApply,
}: {
  targets: SizeTarget[];
  onChange: (targets: SizeTarget[]) => void;
  onClose: () => void;
  onApply: (sizes: TrackSize[]) => boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  const close = () => {
    dialogRef.current?.close();
    onClose();
  };
  const apply = (sizes: TrackSize[]) => {
    if (onApply(sizes)) close();
  };
  const valid = targets.every(
    (target) =>
      target.text.trim() &&
      Number.isFinite(Number(target.text)) &&
      Number(target.text) >= limits[target.axis].min &&
      Number(target.text) <= limits[target.axis].max
  );
  return (
    <dialog
      ref={dialogRef}
      aria-label="Row and column size"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={(event) => event.stopPropagation()}
      style={{
        border: '1px solid #cbd5e1',
        borderRadius: 10,
        padding: 20,
        width: 340,
        maxWidth: 'calc(100vw - 40px)',
        color: '#202124',
        background: '#fff',
        boxShadow: '0 12px 48px #0003',
        font: '14px system-ui, sans-serif',
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid)
            apply(
              targets
                .filter((target) => Number(target.text) !== target.initial)
                .map(({ axis, index, text }) => ({
                  axis,
                  index,
                  value: Number(text),
                }))
            );
        }}
      >
        <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Row and column size</h2>
        <p style={{ margin: '0 0 16px', color: '#64748b', lineHeight: 1.4 }}>
          Changes affect every cell in the specified row or column.
        </p>
        {targets.map((target, slot) => (
          <label
            key={target.axis}
            style={{ display: 'block', marginBottom: 12 }}
          >
            {trackLabel(target.axis, target.index)}{' '}
            {target.axis === 'row' ? 'height (pt)' : 'width (characters)'}
            <input
              type="number"
              autoFocus={slot === 0}
              min={limits[target.axis].min}
              max={limits[target.axis].max}
              step="any"
              required
              value={target.text}
              onChange={(event) =>
                onChange(
                  targets.map((current, index) =>
                    index === slot
                      ? { ...current, text: event.target.value }
                      : current
                  )
                )
              }
              style={{
                display: 'block',
                width: '100%',
                boxSizing: 'border-box',
                border: '1px solid #94a3b8',
                borderRadius: 4,
                padding: 7,
                marginTop: 5,
                color: '#202124',
                background: '#fff',
                font: 'inherit',
              }}
            />
          </label>
        ))}
        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            marginTop: 18,
          }}
        >
          <button
            type="button"
            style={{ ...actionStyle, marginRight: 'auto' }}
            onClick={() =>
              apply(
                targets.map(({ axis, index }) => ({ axis, index, value: null }))
              )
            }
          >
            Reset
          </button>
          <button type="button" style={actionStyle} onClick={close}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid}
            style={{
              ...actionStyle,
              background: valid ? '#217346' : '#e2e8f0',
              color: valid ? '#fff' : '#64748b',
            }}
          >
            Apply
          </button>
        </div>
      </form>
    </dialog>
  );
}
