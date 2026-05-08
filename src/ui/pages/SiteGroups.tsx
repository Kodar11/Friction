import { useEffect, useState } from 'react';
import { Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useConfig } from '../hooks/useConfig';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PRESETS } from '../components/presets';
import { parseHost } from '../../shared/parseHost';

export function SiteGroupsPage() {
  const { config, update } = useConfig();
  const [presetOpen, setPresetOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  if (!config) return <div className="card card-section text-[13px] text-muted">Loading…</div>;

  const addEmptyGroup = () => {
    void update((draft) => {
      draft.siteGroups.push({ id: uid(), name: 'New group', sites: [] });
    });
  };
  const renameGroup = (id: string, name: string) => {
    void update((draft) => {
      const g = draft.siteGroups.find((x) => x.id === id);
      if (g) g.name = name;
    });
  };
  const addSite = (groupId: string, raw: string): string | null => {
    const cleaned = parseHost(raw);
    if (!cleaned) return "Enter a valid domain like 'youtube.com'.";
    void update((draft) => {
      const g = draft.siteGroups.find((x) => x.id === groupId);
      if (!g) return;
      if (!g.sites.includes(cleaned)) g.sites.push(cleaned);
      g.sites.sort();
    });
    return null;
  };
  const removeSite = (groupId: string, site: string) => {
    void update((draft) => {
      const g = draft.siteGroups.find((x) => x.id === groupId);
      if (g) g.sites = g.sites.filter((s) => s !== site);
    });
  };
  const removeGroup = (id: string) => {
    void update((draft) => {
      draft.siteGroups = draft.siteGroups.filter((g) => g.id !== id);
      for (const b of draft.scheduleBlocks) {
        b.siteGroupIds = b.siteGroupIds.filter((gid) => gid !== id);
      }
      draft.scheduleBlocks = draft.scheduleBlocks.filter((b) => b.siteGroupIds.length > 0);
    });
  };
  const importPresets = (selected: string[]) => {
    void update((draft) => {
      for (const presetId of selected) {
        const p = PRESETS.find((x) => x.id === presetId);
        if (!p) continue;
        draft.siteGroups.push({ id: uid(), name: p.name, sites: [...p.sites] });
      }
    });
    setPresetOpen(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-default">Site groups</h1>
          <p className="text-[13.5px] text-muted mt-0.5">
            Organize sites into groups, then assign groups to schedule blocks.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setPresetOpen(true)} className="btn">
            <Sparkles size={14} /> Presets
          </button>
          <button onClick={addEmptyGroup} className="btn btn-primary">
            <Plus size={14} /> New group
          </button>
        </div>
      </div>

      {config.siteGroups.length === 0 && (
        <div className="card card-section text-center py-10">
          <div className="text-[15px] font-medium">No groups yet</div>
          <p className="text-[13px] text-muted mt-1">Create one or import a preset to get started.</p>
          <div className="mt-4 flex justify-center gap-2">
            <button onClick={() => setPresetOpen(true)} className="btn"><Sparkles size={14} /> Browse presets</button>
            <button onClick={addEmptyGroup} className="btn btn-primary"><Plus size={14} /> Empty group</button>
          </div>
        </div>
      )}

      <ul className="space-y-3">
        {config.siteGroups.map((g) => (
          <SiteGroupCard
            key={g.id}
            group={g}
            onRename={(n) => renameGroup(g.id, n)}
            onAddSite={(s) => addSite(g.id, s)}
            onRemoveSite={(s) => removeSite(g.id, s)}
            onDelete={() => setPendingDelete(g.id)}
          />
        ))}
      </ul>

      <p className="text-[12px] text-muted">
        Tip: paste any URL — <span className="kbd">https://www.youtube.com/watch</span> works as well as <span className="kbd">youtube.com</span>. We extract the host and add the matching <code className="kbd">www.</code>/<code className="kbd">m.</code>/apex variants when blocking.
      </p>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this group?"
        message="The group and any references to it in your schedule will be removed."
        destructive
        confirmLabel="Delete"
        onConfirm={() => {
          if (pendingDelete) removeGroup(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />

      <PresetModal open={presetOpen} onClose={() => setPresetOpen(false)} onImport={importPresets} />
    </div>
  );
}

function SiteGroupCard(props: {
  group: SiteGroup;
  onRename: (name: string) => void;
  onAddSite: (site: string) => string | null;
  onRemoveSite: (site: string) => void;
  onDelete: () => void;
}) {
  const { group, onRename, onAddSite, onRemoveSite, onDelete } = props;
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState(group.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [savedName, setSavedName] = useState(false);

  useEffect(() => {
    setNameDraft(group.name);
    setNameError(null);
    setEditingName(false);
  }, [group.name]);

  useEffect(() => {
    if (!savedName) return;
    const t = setTimeout(() => setSavedName(false), 1200);
    return () => clearTimeout(t);
  }, [savedName]);

  const commitName = () => {
    const next = nameDraft.trim();
    if (!next) {
      setNameError('Group name cannot be empty.');
      setNameDraft(group.name);
      return;
    }
    if (next.length > 80) {
      setNameError('Group name must be 80 characters or less.');
      setNameDraft(group.name);
      return;
    }
    if (next !== group.name) {
      onRename(next);
      setSavedName(true);
    }
    setEditingName(false);
  };

  return (
    <li className="card group">
      <div className="card-section flex items-center gap-3">
        <input
          value={nameDraft}
          onChange={(e) => {
            setNameDraft(e.target.value);
            if (nameError) setNameError(null);
          }}
          onBlur={() => editingName && commitName()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitName();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setNameDraft(group.name);
              setNameError(null);
              setEditingName(false);
            }
          }}
          className={
            'flex-1 bg-transparent text-[16px] font-semibold focus:outline-none border-b py-0.5 ' +
            (editingName ? 'border-default' : 'border-transparent')
          }
          placeholder="Group name"
          readOnly={!editingName}
        />
        <span className="text-[12px] text-muted">{group.sites.length} site{group.sites.length === 1 ? '' : 's'}</span>
        {savedName && <span className="text-[11px] text-muted">Saved</span>}
        <button
          onClick={() => {
            setEditingName(true);
            setNameError(null);
          }}
          className="btn btn-ghost opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition"
          title="Rename group"
          aria-label="Rename group"
        >
          <Pencil size={14} />
        </button>
        <button onClick={onDelete} className="btn btn-ghost" title="Delete group">
          <Trash2 size={14} />
        </button>
      </div>
      {nameError && <div className="px-5 pb-2 text-[12px] text-red-500">{nameError}</div>}
      <div className="divider" />
      <div className="card-section">
        {group.sites.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {group.sites.map((s) => (
              <li key={s} className="chip">
                <span>{s}</span>
                <button
                  onClick={() => onRemoveSite(s)}
                  aria-label={`Remove ${s}`}
                  className="text-faint hover:text-default"
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-[12.5px] text-faint">No sites yet.</div>
        )}

        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const message = onAddSite(draft);
            setError(message);
            if (!message) setDraft('');
          }}
        >
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Add site, e.g. youtube.com"
            className="field flex-1"
          />
          <button type="submit" className="btn">Add</button>
        </form>
        {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
      </div>
    </li>
  );
}

function PresetModal(props: { open: boolean; onClose: () => void; onImport: (ids: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  if (!props.open) return null;
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40" onClick={props.onClose}>
      <div
        className="card w-full max-w-lg"
        style={{ boxShadow: 'var(--shadow-lg)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-section">
          <h2 className="text-[16px] font-semibold">Add from preset</h2>
          <p className="text-[12.5px] text-muted mt-0.5">You can always edit them after adding.</p>
        </div>
        <div className="divider" />
        <div className="card-section pt-2 pb-2">
          <ul className="space-y-1">
            {PRESETS.map((p) => {
              const checked = selected.includes(p.id);
              return (
                <li
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className="flex items-start gap-3 px-2 py-2 rounded-md cursor-pointer transition-colors"
                  style={{ background: checked ? 'var(--bg-active)' : 'transparent' }}
                  onMouseEnter={(e) => {
                    if (!checked) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (!checked) (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggle(p.id)} className="mt-1" />
                  <div className="flex-1">
                    <div className="text-[13.5px] font-medium">{p.name}</div>
                    <div className="text-[12px] text-muted mt-0.5 truncate">{p.sites.join(', ')}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="divider" />
        <div className="card-section py-3 flex justify-end gap-2">
          <button onClick={props.onClose} className="btn">Cancel</button>
          <button
            disabled={selected.length === 0}
            onClick={() => {
              props.onImport(selected);
              setSelected([]);
            }}
            className="btn btn-primary"
          >
            Add {selected.length || ''}
          </button>
        </div>
      </div>
    </div>
  );
}

function uid() {
  return 'g_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
