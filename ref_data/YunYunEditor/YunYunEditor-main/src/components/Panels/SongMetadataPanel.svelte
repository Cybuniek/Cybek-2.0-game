<script lang="ts">
  import { chart, updateSong } from '../../lib/state/chartStore';
  import { pushHistory } from '../../lib/state/history';
  import { putImage, getImage, deleteImage } from '../../lib/storage/imageStore';
  import { CURRENT_ID } from '../../lib/storage/drafts';
  import type { SongJson } from '../../lib/model/song';

  function patch(field: keyof SongJson, value: string): void {
    updateSong({ [field]: value } as Partial<SongJson>);
  }

  // Object URL for the icon thumbnail. The bytes live in IndexedDB (keyed by CURRENT_ID, same as
  // audio), so the preview is rebuilt from there whenever song.Icon changes — including a draft
  // load that swaps IDB out from under us without remounting this panel.
  let iconUrl = $state<string | null>(null);

  async function refreshIconPreview(): Promise<void> {
    const stored = await getImage(CURRENT_ID).catch(() => undefined);
    if (iconUrl) {
      URL.revokeObjectURL(iconUrl);
      iconUrl = null;
    }
    if (stored) {
      iconUrl = URL.createObjectURL(new Blob([stored.bytes], { type: stored.mime }));
    }
  }

  $effect(() => {
    // Re-run on pick/remove/draft-load (all change song.Icon). Revoke on teardown so the URL
    // doesn't leak across re-runs or unmount.
    void $chart.song.Icon;
    void refreshIconPreview();
    return () => {
      if (iconUrl) {
        URL.revokeObjectURL(iconUrl);
        iconUrl = null;
      }
    };
  });

  function isImageFilename(name: string): boolean {
    return /\.(png|jpe?g)$/i.test(name);
  }

  function pickIcon(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.png,.jpg,.jpeg,image/png,image/jpeg';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      if (!isImageFilename(f.name)) {
        alert('Only .png and .jpg images are accepted.');
        return;
      }
      try {
        // Icon is an IDB-backed asset, not undoable document state (see history.ts) — no
        // pushHistory: a snapshot here would just clear the redo stack for a non-undoable action.
        const bytes = await f.arrayBuffer();
        const mime = f.type || (/\.png$/i.test(f.name) ? 'image/png' : 'image/jpeg');
        await putImage({ id: CURRENT_ID, filename: f.name, mime, bytes });
        updateSong({ Icon: f.name });
        await refreshIconPreview();
      } catch (err: any) {
        alert(`Icon import failed: ${err?.message ?? err}`);
      }
    };
    input.click();
  }

  async function removeIcon(): Promise<void> {
    // Asset removal, not undoable document state — see pickIcon / history.ts.
    await deleteImage(CURRENT_ID).catch(() => undefined);
    updateSong({ Icon: '' });
    await refreshIconPreview();
  }

  // Live cross-ref check vs each level's MusicInfoName.
  const mismatches = $derived.by(() => {
    const song = $chart.song;
    const out: string[] = [];
    for (const ref of song.Levels) {
      const lvl = $chart.levels[ref.Path];
      if (lvl && lvl.MusicInfoName !== song.ID) out.push(`${ref.Path}: MusicInfoName="${lvl.MusicInfoName}"`);
    }
    return out;
  });

  const fields: { key: keyof SongJson; label: string }[] = [
    { key: 'ID', label: 'ID' },
    { key: 'Title', label: 'Title' },
    { key: 'ListArtist', label: 'List Artist' },
    { key: 'Artist', label: 'Artist' },
    { key: 'Lyricist', label: 'Lyricist' },
    { key: 'Composer', label: 'Composer' },
    { key: 'Arranger', label: 'Arranger' },
    { key: 'Audio', label: 'Audio (filename)' },
  ];
</script>

<div class="form">
  {#each fields as f}
    <label>
      <span>{f.label}</span>
      <input
        type="text"
        value={String($chart.song[f.key] ?? '')}
        onfocus={() => pushHistory()}
        oninput={(e) => patch(f.key, (e.currentTarget as HTMLInputElement).value)}
      />
    </label>
  {/each}

  <div class="icon-field">
    <span>Icon (optional)</span>
    {#if iconUrl}
      <div class="icon-preview"><img src={iconUrl} alt="song icon preview" /></div>
    {/if}
    <div class="icon-actions">
      <button type="button" onclick={pickIcon}>
        {$chart.song.Icon ? 'Replace icon…' : 'Choose icon…'}
      </button>
      {#if $chart.song.Icon}
        <button type="button" onclick={removeIcon}>Remove</button>
      {/if}
    </div>
    {#if $chart.song.Icon}
      <span class="mono">{$chart.song.Icon}</span>
    {/if}
    <span class="hint">Recommended size 180×80 (.png/.jpg)</span>
  </div>
</div>

{#if mismatches.length > 0}
  <div class="warn">
    <div class="warn-title">song.ID does not match these levels:</div>
    <ul>
      {#each mismatches as m}
        <li class="mono">{m}</li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }
  label {
    display: grid;
    grid-template-columns: 1fr;
    gap: 2px;
  }
  span {
    font-size: 11px;
    color: var(--fg-dim);
  }
  input {
    background: var(--bg-2);
    border: var(--hairline);
    color: var(--fg);
    padding: 4px 6px;
    border-radius: 2px;
  }
  input:focus {
    outline: 1px solid var(--accent);
  }
  .icon-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .icon-preview {
    width: 180px;
    height: 80px;
    border: var(--hairline);
    border-radius: 2px;
    background: var(--bg-2);
    overflow: hidden;
  }
  .icon-preview img {
    /* The game resizes the icon to 180x80 (stretches, doesn't crop) — mirror that here so the
       preview matches in-game. object-fit: fill ignores the source aspect ratio. */
    width: 100%;
    height: 100%;
    object-fit: fill;
  }
  .icon-actions {
    display: flex;
    gap: var(--sp-2);
  }
  .icon-field button {
    background: var(--bg-2);
    border: var(--hairline);
    color: var(--fg);
    padding: 4px 8px;
    border-radius: 2px;
    cursor: pointer;
  }
  .icon-field button:hover {
    background: var(--bg-3);
  }
  .mono {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--fg-dim);
  }
  .hint {
    color: var(--fg-mute);
  }
  .warn {
    margin-top: var(--sp-3);
    padding: var(--sp-2);
    border: 1px solid var(--warn);
    background: rgba(255, 180, 84, 0.06);
    border-radius: 2px;
    font-size: 11px;
  }
  .warn-title {
    color: var(--warn);
    margin-bottom: 4px;
  }
  ul {
    margin: 0;
    padding-left: var(--sp-3);
    font-size: 11px;
  }
</style>
