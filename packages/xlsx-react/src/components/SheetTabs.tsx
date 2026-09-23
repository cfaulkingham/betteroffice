import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

export type SheetAction =
  | { type: 'add'; name: string }
  | { type: 'rename'; id: string; name: string }
  | { type: 'delete'; id: string }
  | { type: 'move'; id: string; to: number };

type Sheet = { id: string; name: string };
type Dialog = { type: 'rename' | 'delete' | 'move'; sheet: Sheet };
interface Props {
  sheets: Sheet[];
  active: number;
  readOnly: boolean;
  onSelect: (index: number) => void;
  onAction: (action: SheetAction) => string | null;
}

const button: CSSProperties = {
  appearance: 'none',
  border: '1px solid #dadce0',
  borderRadius: 4,
  background: '#fff',
  color: '#3c4043',
  padding: '6px 10px',
  font: 'inherit',
  cursor: 'pointer',
};
const menuItem: CSSProperties = {
  ...button,
  border: 0,
  textAlign: 'left',
  width: '100%',
  minHeight: 32,
};

function nameError(name: string, sheets: Sheet[], except?: string): string | null {
  if (!name.trim()) return 'Enter a worksheet name.';
  if (name.length > 31) return 'Worksheet names can contain at most 31 characters.';
  if (/[\\/?*\[\]:\x00-\x1f]/.test(name) || name.startsWith("'") || name.endsWith("'")) {
    return 'Names cannot contain \\ / ? * [ ] : or start or end with an apostrophe.';
  }
  if (
    sheets.some((sheet) => sheet.id !== except && sheet.name.toLowerCase() === name.toLowerCase())
  ) {
    return 'A worksheet with this name already exists.';
  }
  return null;
}

/** Worksheet navigation and undoable management controls. */
export function SheetTabs({ sheets, active, readOnly, onSelect, onAction }: Props) {
  const [menu, setMenu] = useState<{ sheet: Sheet; left: number; bottom: number } | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const dragged = useRef<string | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTrigger = useRef<HTMLElement | null>(null);
  const activeId = sheets[active]?.id;

  useEffect(() => {
    tabsRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeId, sheets.length]);

  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [menu]);

  const run = (action: SheetAction) => {
    const failure = onAction(action);
    setError(failure);
    return failure;
  };
  const focusActive = () =>
    requestAnimationFrame(() => {
      tabsRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    });
  const closeMenu = () => {
    setMenu(null);
    menuTrigger.current?.focus();
  };
  const openMenu = (sheet: Sheet, target: HTMLElement) => {
    if (readOnly) return;
    const rect = target.getBoundingClientRect();
    menuTrigger.current = target;
    setMenu({
      sheet,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 208)),
      bottom: window.innerHeight - rect.top + 4,
    });
  };
  const editSheet = (type: Dialog['type']) => {
    if (!menu) return;
    setDialog({ type, sheet: menu.sheet });
    setMenu(null);
  };
  const move = (id: string, to: number) => {
    run({ type: 'move', id, to });
    setMenu(null);
    focusActive();
  };
  const tabKeys = (event: KeyboardEvent<HTMLButtonElement>, sheet: Sheet, index: number) => {
    if (!readOnly && event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      move(
        sheet.id,
        Math.max(0, Math.min(sheets.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1))),
      );
      return;
    }
    if (
      !readOnly &&
      (event.key === 'F2' || event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))
    ) {
      event.preventDefault();
      if (event.key === 'F2') setDialog({ type: 'rename', sheet });
      else openMenu(sheet, event.currentTarget);
      return;
    }
    let next = index;
    if (event.key === 'ArrowLeft') next = (index + sheets.length - 1) % sheets.length;
    else if (event.key === 'ArrowRight') next = (index + 1) % sheets.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = sheets.length - 1;
    else return;
    event.preventDefault();
    onSelect(next);
    tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };
  const menuIndex = menu ? sheets.findIndex((sheet) => sheet.id === menu.sheet.id) : -1;

  return (
    <>
      {error && (
        <div role="alert" style={{ padding: '6px 10px', color: '#b00020', background: '#fff3f3' }}>
          {error}{' '}
          <button type="button" style={button} onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}
      <div
        data-testid="xlsx-sheet-bar"
        style={{
          display: 'flex',
          flexShrink: 0,
          alignItems: 'stretch',
          borderTop: '1px solid #dadce0',
          background: '#f8f9fa',
          minHeight: 38,
        }}
      >
        {!readOnly && (
          <button
            type="button"
            aria-label="Add worksheet"
            title="Add worksheet"
            style={{ ...button, flexShrink: 0, margin: 3, fontSize: 20, padding: '0 10px' }}
            onClick={() => {
              let number = 1;
              while (sheets.some((sheet) => sheet.name.toLowerCase() === `sheet${number}`))
                number++;
              run({ type: 'add', name: `Sheet${number}` });
              focusActive();
            }}
          >
            +
          </button>
        )}
        <div
          ref={tabsRef}
          data-testid="xlsx-sheet-tabs"
          role="tablist"
          aria-label="Worksheets"
          style={{ display: 'flex', overflowX: 'auto', gap: 2, flex: 1, minWidth: 0 }}
        >
          {sheets.map((sheet, index) => (
            <div
              key={sheet.id}
              role="presentation"
              style={{
                display: 'flex',
                flexShrink: 0,
                background: index === active ? '#fff' : 'transparent',
                borderBottom: index === active ? '2px solid #217346' : '2px solid transparent',
                boxShadow: dropId === sheet.id ? 'inset 0 0 0 2px #217346' : undefined,
              }}
              onDragOver={(event) => {
                if (!readOnly && dragged.current) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setDropId(sheet.id);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (!readOnly && dragged.current) move(dragged.current, index);
                dragged.current = null;
                setDropId(null);
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={index === active}
                tabIndex={index === active ? 0 : -1}
                draggable={!readOnly}
                title={
                  readOnly ? sheet.name : `${sheet.name} — double-click to rename; drag to reorder`
                }
                onDragStart={(event) => {
                  dragged.current = sheet.id;
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', sheet.id);
                }}
                onDragEnd={() => {
                  dragged.current = null;
                  setDropId(null);
                }}
                onClick={() => onSelect(index)}
                onDoubleClick={() => {
                  if (!readOnly) setDialog({ type: 'rename', sheet });
                }}
                onContextMenu={(event) => {
                  if (!readOnly) {
                    event.preventDefault();
                    openMenu(sheet, event.currentTarget);
                  }
                }}
                onKeyDown={(event) => tabKeys(event, sheet, index)}
                style={{
                  ...button,
                  border: 0,
                  borderRadius: 0,
                  background: 'transparent',
                  whiteSpace: 'nowrap',
                  padding: '6px 12px',
                  fontWeight: index === active ? 600 : 400,
                }}
              >
                {sheet.name}
              </button>
              {!readOnly && (
                <button
                  type="button"
                  aria-label={`Worksheet options for ${sheet.name}`}
                  title={`Worksheet options for ${sheet.name}`}
                  aria-haspopup="menu"
                  aria-expanded={menu?.sheet.id === sheet.id}
                  style={{ ...button, border: 0, background: 'transparent', padding: '4px 7px' }}
                  onClick={(event) => openMenu(sheet, event.currentTarget)}
                >
                  ▾
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      {menu &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={`Worksheet options for ${menu.sheet.name}`}
            style={{
              position: 'fixed',
              left: menu.left,
              bottom: menu.bottom,
              zIndex: 10000,
              width: 200,
              padding: 4,
              border: '1px solid #dadce0',
              borderRadius: 6,
              background: '#fff',
              color: '#3c4043',
              font: '13px system-ui, sans-serif',
              boxShadow: '0 4px 16px #0003',
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeMenu();
              }
              if (event.key === 'Tab') {
                setMenu(null);
                return;
              }
              const items = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
              );
              let next = items.indexOf(document.activeElement as HTMLButtonElement);
              if (event.key === 'ArrowDown') next = (next + 1) % items.length;
              else if (event.key === 'ArrowUp') next = (next + items.length - 1) % items.length;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = items.length - 1;
              else return;
              event.preventDefault();
              items[next]?.focus();
            }}
          >
            <button
              type="button"
              role="menuitem"
              style={menuItem}
              onClick={() => editSheet('rename')}
            >
              Rename…
            </button>
            <button
              type="button"
              role="menuitem"
              style={menuItem}
              disabled={menuIndex <= 0}
              onClick={() => move(menu.sheet.id, menuIndex - 1)}
            >
              Move left
            </button>
            <button
              type="button"
              role="menuitem"
              style={menuItem}
              disabled={menuIndex >= sheets.length - 1}
              onClick={() => move(menu.sheet.id, menuIndex + 1)}
            >
              Move right
            </button>
            <button
              type="button"
              role="menuitem"
              style={menuItem}
              disabled={sheets.length < 2}
              onClick={() => editSheet('move')}
            >
              Move to position…
            </button>
            <hr style={{ border: 0, borderTop: '1px solid #dadce0', margin: '4px 0' }} />
            <button
              type="button"
              role="menuitem"
              style={{ ...menuItem, color: sheets.length < 2 ? '#9aa0a6' : '#b3261e' }}
              disabled={sheets.length < 2}
              title={sheets.length < 2 ? 'Keep at least one worksheet in the workbook.' : undefined}
              onClick={() => editSheet('delete')}
            >
              Delete…
            </button>
          </div>,
          document.body,
        )}
      {dialog &&
        createPortal(
          <SheetDialog
            key={`${dialog.type}:${dialog.sheet.id}`}
            dialog={dialog}
            sheets={sheets}
            onAction={onAction}
            onClose={() => {
              setDialog(null);
              focusActive();
            }}
          />,
          document.body,
        )}
    </>
  );
}

function SheetDialog({
  dialog,
  sheets,
  onAction,
  onClose,
}: {
  dialog: Dialog;
  sheets: Sheet[];
  onAction: Props['onAction'];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(dialog.sheet.name);
  const [position, setPosition] = useState(
    sheets.findIndex((sheet) => sheet.id === dialog.sheet.id),
  );
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const node = ref.current!;
    node.showModal();
    input.current?.select();
    return () => node.close();
  }, []);
  const title =
    dialog.type === 'rename'
      ? 'Rename worksheet'
      : dialog.type === 'delete'
        ? 'Delete worksheet'
        : 'Move worksheet';
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={onClose}
      onKeyDown={(event) => event.stopPropagation()}
      style={{
        width: 380,
        maxWidth: 'calc(100vw - 32px)',
        boxSizing: 'border-box',
        padding: 20,
        border: '1px solid #dadce0',
        borderRadius: 10,
        color: '#202124',
        background: '#fff',
        font: '14px system-ui, sans-serif',
        boxShadow: '0 8px 32px #0004',
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const cleanName = name.trim();
          if (dialog.type === 'rename') {
            const invalid = nameError(cleanName, sheets, dialog.sheet.id);
            if (invalid) {
              setError(invalid);
              return;
            }
          }
          const action: SheetAction =
            dialog.type === 'rename'
              ? { type: 'rename', id: dialog.sheet.id, name: cleanName }
              : dialog.type === 'delete'
                ? { type: 'delete', id: dialog.sheet.id }
                : { type: 'move', id: dialog.sheet.id, to: position };
          const failure = onAction(action);
          if (failure) setError(failure);
          else onClose();
        }}
      >
        <h2 style={{ fontSize: 18, margin: '0 0 16px' }}>{title}</h2>
        {dialog.type === 'rename' && (
          <label style={{ display: 'grid', gap: 8 }}>
            Worksheet name
            <input
              ref={input}
              autoFocus
              value={name}
              aria-invalid={!!error}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              style={{ ...button, width: '100%', boxSizing: 'border-box', cursor: 'text' }}
            />
          </label>
        )}
        {dialog.type === 'move' && (
          <label style={{ display: 'grid', gap: 8 }}>
            Position for “{dialog.sheet.name}”
            <select
              autoFocus
              value={position}
              onChange={(event) => setPosition(Number(event.target.value))}
              style={button}
            >
              {sheets.map((sheet, index) => (
                <option key={sheet.id} value={index}>
                  {index + 1}
                  {index === 0 ? ' (first)' : index === sheets.length - 1 ? ' (last)' : ''} —{' '}
                  {sheet.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {dialog.type === 'delete' && (
          <p>Delete “{dialog.sheet.name}” and all its contents? You can undo this change.</p>
        )}
        {error && (
          <p role="alert" style={{ color: '#b3261e' }}>
            {error}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button
            type="button"
            autoFocus={dialog.type === 'delete'}
            style={button}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            style={{
              ...button,
              color: '#fff',
              background: dialog.type === 'delete' ? '#b3261e' : '#217346',
            }}
          >
            {dialog.type === 'delete' ? 'Delete' : dialog.type === 'rename' ? 'Rename' : 'Move'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
