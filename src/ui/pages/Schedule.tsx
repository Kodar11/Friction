import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Layers, Pencil, Plus, Trash2, Monitor } from 'lucide-react';
import { useConfig } from '../hooks/useConfig';
import { Timeline } from '../components/Timeline';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PageLoader } from '../components/PageLoader';
import { fmt, currentMinute, dayChipSummary } from '../lib/format';
import { DayChips } from '../components/DayChips';
import type { Route } from '../components/Sidebar';

export function SchedulePage(props: { onNavigate?: (r: Route) => void }) {
  const { config, update } = useConfig();
  const [editing, setEditing] = useState<EditState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const [nowMinute, setNowMinute] = useState(currentMinute);
  useEffect(() => {
    const t = setInterval(() => setNowMinute(currentMinute()), 30_000);
    return () => clearInterval(t);
  }, []);

  const onCreateRange = (startMinute: number, endMinute: number) => {
    const groupId = config?.siteGroups[0]?.id;
    setEditing({
      kind: 'create',
      startMinute,
      endMinute,
      days: [0, 1, 2, 3, 4, 5, 6],
      blockApplications: true,
      siteGroupIds: groupId ? [groupId] : [],
    });
  };

  const onAddBlock = () => {
    const now = currentMinute();
    const rounded = Math.floor(now / 60) * 60;
    const groupId = config?.siteGroups[0]?.id;
    setEditing({
      kind: 'create',
      startMinute: rounded,
      endMinute: rounded === 23 * 60 ? 0 : rounded + 60,
      days: [0, 1, 2, 3, 4, 5, 6],
      blockApplications: true,
      siteGroupIds: groupId ? [groupId] : [],
    });
  };

  const onSelectBlock = (id: string) => {
    const b = config?.scheduleBlocks.find((x) => x.id === id);
    if (!b) return;
    setEditing({
      kind: 'edit',
      id: b.id,
      startMinute: b.startMinute,
      endMinute: b.endMinute,
      days: [...b.days],
      blockApplications: !!b.blockApplications,
      siteGroupIds: [...b.siteGroupIds],
    });
  };

  const saveBlock = (e: EditState) => {
    void update((draft) => {
      if (e.kind === 'edit') {
        const idx = draft.scheduleBlocks.findIndex((x) => x.id === e.id);
        if (idx >= 0) {
          draft.scheduleBlocks[idx] = {
            id: e.id,
            startMinute: e.startMinute,
            endMinute: e.endMinute,
            days: e.days,
            blockApplications: e.blockApplications,
            siteGroupIds: e.siteGroupIds,
          };
        }
      } else {
        draft.scheduleBlocks.push({
          id: 'b_' + Math.random().toString(36).slice(2, 10),
          startMinute: e.startMinute,
          endMinute: e.endMinute,
          days: e.days,
          blockApplications: e.blockApplications,
          siteGroupIds: e.siteGroupIds,
        });
      }
    });
    setEditing(null);
    setConfirmDiscard(false);
  };

  const deleteBlock = (id: string) => {
    void update((draft) => {
      draft.scheduleBlocks = draft.scheduleBlocks.filter((b) => b.id !== id);
    });
    setPendingDelete(null);
    setEditing(null);
  };

  const handleEditorCancel = () => {
    setEditing(null);
    setConfirmDiscard(false);
  };

  const handleBackdropClick = () => {
    if (!editing) return;
    const hasChanges = editing.kind === 'create' || (
      editing.kind === 'edit' && config
    );
    if (hasChanges) {
      setConfirmDiscard(true);
    } else {
      setEditing(null);
    }
  };

  if (!config) return <PageLoader />;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-default">Schedule</h1>
          <p className="text-[13.5px] text-muted mt-0.5">
            Drag on the timeline to add a block · click an existing block to edit.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onAddBlock} className="btn btn-primary">
            <Plus size={14} /> Add block
          </button>
          <span className="chip text-muted"><CalendarClock size={12} /> Now: {fmt(nowMinute)}</span>
        </div>
      </div>

      <div className="card card-section">
        <Timeline
          blocks={config.scheduleBlocks}
          groups={config.siteGroups}
          nowMinute={nowMinute}
          onSelectBlock={onSelectBlock}
          onCreateRange={onCreateRange}
        />
      </div>

      <BlockList
        config={config}
        onEdit={onSelectBlock}
        onDelete={(id) => setPendingDelete(id)}
        onAdd={onAddBlock}
      />

      {editing && (
        <BlockEditor
          state={editing}
          groups={config.siteGroups}
          onChange={setEditing}
          onSave={() => saveBlock(editing)}
          onCancel={handleEditorCancel}
          onDelete={editing.kind === 'edit' ? () => setPendingDelete(editing.id) : undefined}
          onNavigate={props.onNavigate}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this schedule block?"
        message="This block will be removed from your schedule."
        destructive
        confirmLabel="Delete"
        onConfirm={() => pendingDelete && deleteBlock(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard changes?"
        message="You have unsaved changes in the block editor. Are you sure you want to close it?"
        destructive
        confirmLabel="Discard"
        onConfirm={() => { setEditing(null); setConfirmDiscard(false); }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </div>
  );
}

interface EditCreate {
  kind: 'create';
  startMinute: number;
  endMinute: number;
  days: number[];
  blockApplications: boolean;
  siteGroupIds: string[];
}
interface EditEdit {
  kind: 'edit';
  id: string;
  startMinute: number;
  endMinute: number;
  days: number[];
  blockApplications: boolean;
  siteGroupIds: string[];
}
type EditState = EditCreate | EditEdit;

function BlockList(props: { config: BlockerConfig; onEdit: (id: string) => void; onDelete: (id: string) => void; onAdd: () => void }) {
  const { config, onAdd } = props;
  if (config.scheduleBlocks.length === 0) {
    return (
      <div className="card card-section text-center py-8">
        <div className="text-[14px] font-medium">No schedule blocks yet</div>
        <p className="text-[12.5px] text-muted mt-1">Drag on the timeline above or use the button to create one.</p>
        <div className="mt-3">
          <button onClick={onAdd} className="btn btn-primary"><Plus size={14} /> Add block</button>
        </div>
      </div>
    );
  }
  const groupName = (id: string) => config.siteGroups.find((g) => g.id === id)?.name ?? '(removed)';
  return (
    <ul className="space-y-2">
      {[...config.scheduleBlocks]
        .sort((a, b) => a.startMinute - b.startMinute)
        .map((b) => (
          <li key={b.id} className="card flex items-center justify-between px-5 py-3">
            <div>
              <div className="text-[14px] font-medium tabular-nums">
                {fmt(b.startMinute)} <span className="text-faint">→</span> {fmt(b.endMinute)}
                {b.endMinute < b.startMinute && (
                  <span className="text-[11px] text-faint ml-2">(wraps midnight)</span>
                )}
              </div>
              <div className="text-[12.5px] text-muted mt-0.5">
                {b.siteGroupIds.length > 0 ? b.siteGroupIds.map(groupName).join(', ') : '(no groups)'}
                {b.blockApplications && (
                  <span className="inline-flex items-center gap-1 ml-2">
                    <Monitor size={11} />
                    <span className="text-[11px]">+ apps</span>
                  </span>
                )}
                {b.days.length < 7 && (
                  <span className="text-faint"> · {dayChipSummary(b.days)}</span>
                )}
              </div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => props.onEdit(b.id)} className="btn btn-ghost"><Pencil size={13} /> Edit</button>
              <button onClick={() => props.onDelete(b.id)} className="btn btn-ghost"><Trash2 size={13} /></button>
            </div>
          </li>
        ))}
    </ul>
  );
}

function BlockEditor(props: {
  state: EditState;
  groups: SiteGroup[];
  onChange: (s: EditState) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  onNavigate?: (r: Route) => void;
}) {
  const { state, groups, onChange, onSave, onCancel, onDelete, onNavigate } = props;
  const valid = useMemo(
    () => (state.siteGroupIds.length > 0 || state.blockApplications) && state.startMinute !== state.endMinute,
    [state],
  );

  const setField = <K extends keyof EditState>(k: K, v: EditState[K]) => {
    onChange({ ...state, [k]: v } as EditState);
  };
  const toggleGroup = (id: string) => {
    const next = state.siteGroupIds.includes(id)
      ? state.siteGroupIds.filter((x) => x !== id)
      : [...state.siteGroupIds, id];
    setField('siteGroupIds', next);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40" onClick={props.onNavigate ? undefined : onCancel}>
      <div
        className="card w-full max-w-md"
        style={{ boxShadow: 'var(--shadow-lg)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-section">
          <h2 className="text-[16px] font-semibold">{state.kind === 'create' ? 'New schedule block' : 'Edit block'}</h2>
        </div>
        <div className="divider" />
        <div className="card-section space-y-4">
          <div>
            <div className="text-[11.5px] uppercase tracking-wide text-muted mb-1.5">Days</div>
            <DayChips value={state.days} onChange={(next) => setField('days', next)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <TimeField label="Start" value={state.startMinute} onChange={(v) => setField('startMinute', v)} />
            <TimeField label="End" value={state.endMinute} onChange={(v) => setField('endMinute', v)} />
          </div>
          {state.endMinute < state.startMinute && (
            <p className="text-[12px] text-muted">This block wraps past midnight.</p>
          )}

          <div>
            <div className="text-[11.5px] uppercase tracking-wide text-muted mb-1.5">Block these groups</div>
            {groups.length === 0 ? (
              <div className="text-[12.5px] text-muted">
                <p>No groups exist yet.</p>
                {onNavigate ? (
                  <button onClick={() => onNavigate('groups')} className="btn btn-ghost mt-2 text-[12.5px]">
                    <Layers size={13} /> Create a group
                  </button>
                ) : (
                  <p className="mt-1">Create one on the Site groups page first.</p>
                )}
              </div>
            ) : (
              <>
                <ul className="space-y-1">
                  {groups.map((g) => {
                    const checked = state.siteGroupIds.includes(g.id);
                    return (
                      <li
                        key={g.id}
                        onClick={() => toggleGroup(g.id)}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors"
                        style={{ background: checked ? 'var(--bg-active)' : 'transparent' }}
                      >
                        <input type="checkbox" checked={checked} onChange={() => toggleGroup(g.id)} />
                        <span className="text-[13.5px] font-medium">{g.name}</span>
                        <span className="text-[12px] text-muted ml-auto">{g.sites.length}</span>
                      </li>
                    );
                  })}
                </ul>
                {onNavigate && (
                  <button onClick={() => onNavigate('groups')} className="text-[12px] text-muted mt-2 inline-flex items-center gap-1 hover:text-default transition-colors">
                    <Layers size={11} /> Manage groups
                  </button>
                )}
              </>
            )}
          </div>

          <div
            onClick={() => setField('blockApplications', !state.blockApplications)}
            className="flex items-center gap-3 px-2 py-2.5 rounded-md cursor-pointer transition-colors"
            style={{ background: state.blockApplications ? 'var(--bg-active)' : 'transparent' }}
          >
            <input
              type="checkbox"
              checked={state.blockApplications}
              onChange={() => setField('blockApplications', !state.blockApplications)}
            />
            <div className="flex items-center gap-1.5">
              <Monitor size={13} className="text-muted" />
              <span className="text-[13.5px] font-medium">Block applications</span>
            </div>
          </div>
          {state.blockApplications && (
            <p className="text-[11.5px] text-muted -mt-1 ml-7">
              Kill blocked applications during this schedule block.
            </p>
          )}
        </div>
        <div className="divider" />
        <div className="card-section py-3 flex justify-between">
          {onDelete ? (
            <button onClick={onDelete} className="btn btn-ghost" style={{ color: 'var(--danger)' }}>
              <Trash2 size={13} /> Delete
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onCancel} className="btn">Cancel</button>
            <button onClick={onSave} disabled={!valid} className="btn btn-primary">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimeField(props: { label: string; value: number; onChange: (m: number) => void }) {
  const hh = String(Math.floor(props.value / 60)).padStart(2, '0');
  const mm = String(props.value % 60).padStart(2, '0');
  return (
    <label className="block">
      <div className="text-[11.5px] uppercase tracking-wide text-muted">{props.label}</div>
      <input
        type="time"
        value={`${hh}:${mm}`}
        onChange={(e) => {
          const [h, m] = e.target.value.split(':').map((n) => parseInt(n, 10));
          if (Number.isFinite(h) && Number.isFinite(m)) props.onChange(h * 60 + m);
        }}
        className="field w-full mt-1 tabular-nums"
      />
    </label>
  );
}