'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  clearEntries,
  deleteEntry,
  getEntries,
  putEntries,
  putEntry,
  type JournalEntry,
} from '../lib/journal-storage';

type View = 'year' | 'memories' | 'more';
type Theme = 'garden' | 'dots';

const formatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

const shortFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function daysInYear(year: number) {
  return new Date(year, 1, 29).getMonth() === 1 ? 366 : 365;
}

function dayOfYear(date: Date) {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const current = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((current - start) / 86_400_000);
}

function keyForDay(year: number, day: number) {
  return localDateKey(new Date(year, 0, day, 12));
}

export default function JournalApp() {
  const today = useMemo(() => new Date(), []);
  const todayKey = localDateKey(today);
  const year = today.getFullYear();
  const currentDay = dayOfYear(today);
  const totalDays = daysInYear(year);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [view, setView] = useState<View>('year');
  const [editorDate, setEditorDate] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [theme, setTheme] = useState<Theme>('garden');
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getEntries()
      .then((saved) => setEntries(saved))
      .finally(() => setReady(true));

    const savedTheme = window.localStorage.getItem('flowery-day-theme');
    if (savedTheme === 'dots' || savedTheme === 'garden') setTheme(savedTheme);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const entryMap = useMemo(
    () => new Map(entries.map((entry) => [entry.date, entry])),
    [entries],
  );

  const yearEntries = useMemo(
    () => entries.filter((entry) => entry.date.startsWith(`${year}-`)),
    [entries, year],
  );

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...entries]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((entry) => !query || entry.text.toLowerCase().includes(query) || shortFormatter.format(dateFromKey(entry.date)).toLowerCase().includes(query));
  }, [entries, search]);

  function openEditor(date: string) {
    const selected = dateFromKey(date);
    if (selected.getTime() > today.getTime()) return;
    setEditorDate(date);
    setDraft(entryMap.get(date)?.text ?? '');
  }

  function closeEditor() {
    setEditorDate(null);
    setDraft('');
  }

  async function saveMemory() {
    if (!editorDate || !draft.trim()) return;
    const entry: JournalEntry = {
      date: editorDate,
      text: draft.trim(),
      updatedAt: new Date().toISOString(),
    };
    await putEntry(entry);
    setEntries((current) => [...current.filter((item) => item.date !== entry.date), entry]);
    setNotice('Memory saved on this device.');
    closeEditor();
  }

  async function removeMemory() {
    if (!editorDate || !entryMap.has(editorDate)) return;
    if (!window.confirm('Delete this memory? This cannot be undone.')) return;
    await deleteEntry(editorDate);
    setEntries((current) => current.filter((item) => item.date !== editorDate));
    setNotice('Memory deleted.');
    closeEditor();
  }

  function changeTheme(nextTheme: Theme) {
    setTheme(nextTheme);
    window.localStorage.setItem('flowery-day-theme', nextTheme);
  }

  function exportJournal() {
    const payload = JSON.stringify(
      { app: 'Flowery Day', exportedAt: new Date().toISOString(), entries },
      null,
      2,
    );
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `flowery-day-backup-${todayKey}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice('Backup downloaded.');
  }

  async function importJournal(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { entries?: JournalEntry[] } | JournalEntry[];
      const candidateEntries = Array.isArray(parsed) ? parsed : parsed.entries;
      if (!Array.isArray(candidateEntries)) throw new Error('Missing entries');
      const validEntries = candidateEntries.filter(
        (entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && typeof entry.text === 'string' && entry.text.trim(),
      ).map((entry) => ({
        date: entry.date,
        text: entry.text.trim(),
        updatedAt: entry.updatedAt || new Date().toISOString(),
      }));
      await putEntries(validEntries);
      setEntries(await getEntries());
      setNotice(`${validEntries.length} memories restored.`);
    } catch {
      setNotice('That file is not a valid Flowery Day backup.');
    }
  }

  async function eraseJournal() {
    if (!window.confirm('Delete every memory from this device? Export a backup first if you may want them later.')) return;
    await clearEntries();
    setEntries([]);
    setNotice('All memories were deleted.');
  }

  return (
    <main className={`app-shell theme-${theme}`}>
      <section className="phone-canvas" aria-label="Flowery Day journal">
        <header className="topbar">
          <button className="brand-button" type="button" onClick={() => setView('year')} aria-label="Go to year view">
            <span className="eyebrow">Your year in bloom</span>
            <span className="brand-name">Flowery Day</span>
          </button>
          <button className="icon-button" type="button" onClick={() => setView('more')} aria-label="Open settings">
            <span aria-hidden="true">☼</span>
          </button>
        </header>

        {view === 'year' && (
          <div className="view-stack">
            <section className="year-card" aria-labelledby="year-heading">
              <div className="year-summary">
                <div>
                  <p className="date-label">{formatter.format(today)}</p>
                  <h1 id="year-heading">{year}</h1>
                </div>
                <div className="days-left">
                  <strong>{totalDays - currentDay}</strong>
                  <span>days left</span>
                </div>
              </div>

              <div className="meadow" aria-label={`${currentDay - 1} days complete. Today is day ${currentDay} of ${totalDays}.`}>
                {Array.from({ length: totalDays }, (_, index) => {
                  const day = index + 1;
                  const date = keyForDay(year, day);
                  const state = day < currentDay ? 'lived' : day === currentDay ? 'today' : 'future';
                  const recorded = entryMap.has(date) ? 'recorded' : '';
                  return (
                    <button
                      className={`day-dot ${state} ${recorded}`}
                      key={date}
                      type="button"
                      onClick={() => openEditor(date)}
                      aria-label={`${shortFormatter.format(dateFromKey(date))}${recorded ? ', memory saved' : ''}`}
                      title={shortFormatter.format(dateFromKey(date))}
                    />
                  );
                })}
              </div>

              <div className="progress-copy">
                <span><strong>{currentDay}</strong> of {totalDays} days</span>
                <span>{Math.round((currentDay / totalDays) * 100)}% of the year</span>
              </div>
            </section>

            <section className="journal-card" aria-labelledby="today-heading">
              <div className="journal-heading">
                <div className="today-flower" aria-hidden="true">✿</div>
                <div>
                  <p className="eyebrow">Today’s memory</p>
                  <h2 id="today-heading">
                    {entryMap.has(todayKey) ? 'Today is safely tucked away.' : 'What made today yours?'}
                  </h2>
                </div>
              </div>
              {entryMap.has(todayKey) ? (
                <p className="saved-preview">“{entryMap.get(todayKey)?.text}”</p>
              ) : (
                <p className="journal-prompt">A sentence is enough. Save one small thing you want to remember.</p>
              )}
              <button className="primary-button" type="button" onClick={() => openEditor(todayKey)}>
                {entryMap.has(todayKey) ? 'Read or edit today' : 'Write today’s memory'}
                <span aria-hidden="true">→</span>
              </button>
            </section>

            <p className="memory-count" aria-live="polite">
              {ready ? `${yearEntries.length} ${yearEntries.length === 1 ? 'memory' : 'memories'} blooming this year` : 'Opening your private journal…'}
            </p>
          </div>
        )}

        {view === 'memories' && (
          <section className="memories-view" aria-labelledby="memories-heading">
            <div className="section-heading">
              <p className="eyebrow">Your collection</p>
              <h1 id="memories-heading">Memories</h1>
              <p>Small moments, kept close.</p>
            </div>
            <label className="search-field">
              <span aria-hidden="true">⌕</span>
              <span className="sr-only">Search memories</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your memories" type="search" />
            </label>

            <div className="memory-list">
              {filteredEntries.length ? filteredEntries.map((entry) => (
                <button className="memory-card" key={entry.date} type="button" onClick={() => openEditor(entry.date)}>
                  <span className="memory-date">{formatter.format(dateFromKey(entry.date))}</span>
                  <span className="memory-text">{entry.text}</span>
                  <span className="memory-arrow" aria-hidden="true">↗</span>
                </button>
              )) : (
                <div className="empty-state">
                  <span aria-hidden="true">❀</span>
                  <h2>{search ? 'No memories found' : 'Your first bloom starts today'}</h2>
                  <p>{search ? 'Try a different word or date.' : 'Write one small thing you want to keep.'}</p>
                  {!search && <button type="button" onClick={() => openEditor(todayKey)}>Write today’s memory</button>}
                </div>
              )}
            </div>
          </section>
        )}

        {view === 'more' && (
          <section className="more-view" aria-labelledby="more-heading">
            <div className="section-heading">
              <p className="eyebrow">Make it yours</p>
              <h1 id="more-heading">Your journal</h1>
              <p>Private, simple, and stored on this device.</p>
            </div>

            <section className="settings-card">
              <div className="setting-title">
                <div>
                  <h2>Year style</h2>
                  <p>Choose how your days grow.</p>
                </div>
              </div>
              <div className="theme-picker" role="group" aria-label="Year style">
                <button className={theme === 'garden' ? 'selected' : ''} type="button" onClick={() => changeTheme('garden')}>
                  <span className="theme-sample garden-sample" aria-hidden="true"><i /><i /><i /><i /></span>
                  Garden
                </button>
                <button className={theme === 'dots' ? 'selected' : ''} type="button" onClick={() => changeTheme('dots')}>
                  <span className="theme-sample dots-sample" aria-hidden="true"><i /><i /><i /><i /></span>
                  Dots
                </button>
              </div>
            </section>

            <section className="settings-card install-card">
              <div className="install-mark" aria-hidden="true">↥</div>
              <div>
                <h2>Put it on your Home Screen</h2>
                <p>In Safari, tap Share, then <strong>Add to Home Screen</strong>. It will open like an app and work offline.</p>
              </div>
            </section>

            <section className="settings-card data-card">
              <div className="setting-title">
                <div>
                  <h2>Your data</h2>
                  <p>Entries stay in this browser. Keep a backup before changing phones or clearing browser data.</p>
                </div>
                <span className="privacy-pill">Local only</span>
              </div>
              <button type="button" onClick={exportJournal} disabled={!entries.length}>Download backup <span>↓</span></button>
              <button type="button" onClick={() => importRef.current?.click()}>Restore backup <span>↑</span></button>
              <button className="danger-action" type="button" onClick={eraseJournal} disabled={!entries.length}>Delete all memories</button>
              <input ref={importRef} className="sr-only" type="file" accept="application/json,.json" onChange={importJournal} />
            </section>
          </section>
        )}

        <nav className="bottom-nav" aria-label="Main navigation">
          <button className={`nav-item ${view === 'year' ? 'active' : ''}`} type="button" onClick={() => setView('year')} aria-current={view === 'year' ? 'page' : undefined}>
            <span aria-hidden="true">❋</span>
            Year
          </button>
          <button className={`nav-item ${view === 'memories' ? 'active' : ''}`} type="button" onClick={() => setView('memories')} aria-current={view === 'memories' ? 'page' : undefined}>
            <span aria-hidden="true">◫</span>
            Memories
          </button>
          <button className={`nav-item ${view === 'more' ? 'active' : ''}`} type="button" onClick={() => setView('more')} aria-current={view === 'more' ? 'page' : undefined}>
            <span aria-hidden="true">◌</span>
            More
          </button>
        </nav>
      </section>

      {editorDate && (
        <div className="editor-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeEditor()}>
          <section className="editor-sheet" role="dialog" aria-modal="true" aria-labelledby="editor-heading">
            <div className="sheet-handle" aria-hidden="true" />
            <div className="editor-topline">
              <div>
                <p className="eyebrow">Daily memory</p>
                <h2 id="editor-heading">{formatter.format(dateFromKey(editorDate))}</h2>
              </div>
              <button type="button" onClick={closeEditor} aria-label="Close editor">×</button>
            </div>
            <label className="memory-editor">
              <span className="sr-only">Your memory</span>
              <textarea
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Today, I want to remember…"
              />
            </label>
            <div className="editor-actions">
              {entryMap.has(editorDate) && <button className="delete-button" type="button" onClick={removeMemory}>Delete</button>}
              <button className="save-button" type="button" onClick={saveMemory} disabled={!draft.trim()}>Save memory</button>
            </div>
          </section>
        </div>
      )}

      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}
