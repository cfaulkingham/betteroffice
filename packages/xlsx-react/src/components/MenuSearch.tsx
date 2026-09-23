import { useEffect, useId, useRef, useState } from 'react';

export interface MenuCommand {
  label: string;
  run: () => void;
  disabled?: boolean;
}

/** Searchable spreadsheet actions with modal keyboard navigation. */
export function MenuSearch({ commands, onClose }: { commands: MenuCommand[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const id = useId();
  const matches = commands.filter((command) => command.label.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(() => {
    dialog.current?.showModal();
    input.current?.focus();
  }, []);
  useEffect(() => {
    dialog.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, query]);
  const close = () => {
    dialog.current?.close();
    onClose();
  };
  const run = (command: MenuCommand | undefined) => {
    if (!command || command.disabled) return;
    close();
    command.run();
  };
  return <dialog ref={dialog} aria-labelledby={`${id}-title`} onCancel={(event) => { event.preventDefault(); close(); }}
    onClick={(event) => { if (event.target === event.currentTarget) close(); }}
    style={{ padding: 0, width: 440, maxWidth: 'calc(100vw - 32px)', border: '1px solid #c7cacf', borderRadius: 10, background: '#fff', color: '#202124', boxShadow: '0 12px 48px #0004' }}>
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 id={`${id}-title`} style={{ margin: 0, fontSize: 18 }}>Search menus</h2>
        <button type="button" aria-label="Close search" onClick={close}>×</button>
      </div>
      <input ref={input} role="combobox" aria-label="Search spreadsheet commands" aria-expanded="true" aria-autocomplete="list"
        aria-controls={`${id}-results`} aria-activedescendant={matches[active] ? `${id}-${active}` : undefined}
        value={query} placeholder="Try bold, print, zoom, or PNG" onChange={(event) => { setQuery(event.target.value); setActive(0); }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((value) => matches.length ? (value + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length : 0);
          } else if (event.key === 'Enter') { event.preventDefault(); run(matches[active]); }
        }} style={{ boxSizing: 'border-box', width: '100%', padding: 10, marginBottom: 8 }} />
      <div id={`${id}-results`} role="listbox" aria-label="Spreadsheet commands" style={{ maxHeight: 'min(360px, 50vh)', overflow: 'auto' }}>
        {matches.map((command, index) => <div key={command.label} id={`${id}-${index}`} role="option" aria-selected={active === index}
          aria-disabled={Boolean(command.disabled)} onMouseEnter={() => setActive(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => run(command)}
          style={{ padding: '10px 12px', borderRadius: 4, background: active === index ? '#edf2fa' : 'transparent', opacity: command.disabled ? 0.45 : 1, cursor: command.disabled ? 'default' : 'pointer' }}>
          {command.label}
        </div>)}
      </div>
      {!matches.length && <p role="status">No matching commands.</p>}
    </div>
  </dialog>;
}
