'use client';

import {
  ChangeEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  TouchEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  clearEntries,
  deleteEntry,
  getEntries,
  putEntries,
  putEntry,
  type JournalEntry,
} from '../lib/journal-storage';

type View = 'year' | 'memories' | 'more';
type CalendarMode = 'year' | 'month';

const DRAFT_PREFIX = 'little-orbit-draft:';
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type DotDay = {
  tone: number;
  scale: number;
  delay: number;
};

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function createDotLayout(total: number, seed: number): DotDay[] {
  const random = seededRandom(seed);
  const tones = Array.from({ length: total }, (_, index) => index % 12);
  for (let index = tones.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [tones[index], tones[swapIndex]] = [tones[swapIndex], tones[index]];
  }
  return tones.map((tone) => ({
    tone,
    scale: 0.48 + random() * 0.3,
    delay: -random(),
  }));
}

function nearestDotAt(container: HTMLDivElement, clientX: number, clientY: number) {
  const bounds = container.getBoundingClientRect();
  const localX = clientX - bounds.left;
  const localY = clientY - bounds.top;
  let nearestDate: string | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  container.querySelectorAll<HTMLButtonElement>('[data-dot-date]').forEach((dot) => {
    const xDistance = dot.offsetLeft + dot.offsetWidth / 2 - localX;
    const yDistance = dot.offsetTop + dot.offsetHeight / 2 - localY;
    const distance = xDistance * xDistance + yDistance * yDistance;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestDate = dot.dataset.dotDate ?? null;
    }
  });

  return nearestDate;
}

function createFreshSeed() {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Date.now() >>> 0;
}

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

const backupDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
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

function parseMarkdownBackup(markdown: string): JournalEntry[] {
  const entries: JournalEntry[] = [];
  const pattern = /<!--\s*little-orbit-entry:(\d{4}-\d{2}-\d{2})(?:\s+favorite:(true|false))?\s*-->\s*\n([\s\S]*?)\n\s*<!--\s*\/little-orbit-entry\s*-->/g;
  for (const match of markdown.matchAll(pattern)) {
    const text = match[3].trim();
    if (text) entries.push({
      date: match[1],
      text,
      updatedAt: new Date().toISOString(),
      favorite: match[2] === 'true',
    });
  }
  return entries;
}


export default function JournalApp() {
  const [today, setToday] = useState(() => new Date(2000, 0, 1, 12));
  const [dateReady, setDateReady] = useState(false);
  const todayKey = localDateKey(today);
  const year = today.getFullYear();
  const currentDay = dayOfYear(today);
  const totalDays = daysInYear(year);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [view, setView] = useState<View>('year');
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('year');
  const [selectedMonth, setSelectedMonth] = useState(0);
  const [editorDate, setEditorDate] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [draftFavorite, setDraftFavorite] = useState(false);
  const [draftStatus, setDraftStatus] = useState('');
  const [search, setSearch] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [dotSeed, setDotSeed] = useState(20_260_828);
  const importRef = useRef<HTMLInputElement>(null);
  const touchMovedRef = useRef(false);
  const memoryOpenTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const localToday = new Date();
      setToday(localToday);
      setSelectedMonth(localToday.getMonth());
      setDateReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    getEntries()
      .then((saved) => setEntries(saved))
      .finally(() => setReady(true));

    const savedSeed = Number(
      window.localStorage.getItem('little-orbit-dot-seed')
      || window.localStorage.getItem('little-orbit-sky-seed'),
    );
    if (Number.isFinite(savedSeed) && savedSeed > 0) {
      setDotSeed(savedSeed);
      window.localStorage.setItem('little-orbit-dot-seed', String(savedSeed));
    } else {
      const nextSeed = createFreshSeed();
      setDotSeed(nextSeed);
      window.localStorage.setItem('little-orbit-dot-seed', String(nextSeed));
    }


    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then((registration) => registration.update())
        .catch(() => undefined);
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

  useEffect(() => {
    if (!editorDate) return;
    const savedText = entryMap.get(editorDate)?.text ?? '';
    const draftKey = `${DRAFT_PREFIX}${editorDate}`;
    if (draft === savedText) {
      window.localStorage.removeItem(draftKey);
      setDraftStatus('');
      return;
    }
    if (!draft) {
      window.localStorage.removeItem(draftKey);
      setDraftStatus('');
      return;
    }

    setDraftStatus('Saving draft…');
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(draftKey, draft);
      setDraftStatus('Draft saved on this device');
    }, 450);
    return () => window.clearTimeout(timer);
  }, [draft, editorDate, entryMap]);

  const yearEntries = useMemo(
    () => entries.filter((entry) => entry.date.startsWith(`${year}-`)),
    [entries, year],
  );

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...entries]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((entry) => !favoritesOnly || entry.favorite)
      .filter((entry) => !query || entry.text.toLowerCase().includes(query) || shortFormatter.format(dateFromKey(entry.date)).toLowerCase().includes(query));
  }, [entries, favoritesOnly, search]);

  const onThisDayEntries = useMemo(
    () => [...entries]
      .filter((entry) => entry.date.endsWith(todayKey.slice(4)) && entry.date < todayKey)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [entries, todayKey],
  );

  const hoveredDay = hoveredDate ? dayOfYear(dateFromKey(hoveredDate)) : null;
  const dotLayout = useMemo(() => createDotLayout(totalDays, dotSeed), [totalDays, dotSeed]);
  const daysThisMonth = new Date(year, selectedMonth + 1, 0).getDate();
  const monthStartOffset = (new Date(year, selectedMonth, 1).getDay() + 6) % 7;

  function openEditor(date: string) {
    if (date > todayKey) return;
    const savedDraft = window.localStorage.getItem(`${DRAFT_PREFIX}${date}`);
    setEditorDate(date);
    setDraft(savedDraft ?? entryMap.get(date)?.text ?? '');
    setDraftFavorite(entryMap.get(date)?.favorite === true);
    setDraftStatus(savedDraft ? 'Draft recovered from this device' : '');
  }

  function trackDotTouch(event: TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    if (!touch) return;
    touchMovedRef.current = true;
    setHoveredDate(nearestDotAt(event.currentTarget, touch.clientX, touch.clientY));
  }

  function trackDotPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'touch') return;
    setHoveredDate(nearestDotAt(event.currentTarget, event.clientX, event.clientY));
  }

  function activateDay(date: string) {
    if (touchMovedRef.current) {
      touchMovedRef.current = false;
      return;
    }
    openEditor(date);
  }

  function activateNearestGap(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const date = nearestDotAt(event.currentTarget, event.clientX, event.clientY);
    if (date) activateDay(date);
  }

  function closeEditor() {
    setEditorDate(null);
    setDraft('');
    setDraftFavorite(false);
    setDraftStatus('');
  }

  async function saveMemory() {
    if (!editorDate || !draft.trim()) return;
    const entry: JournalEntry = {
      date: editorDate,
      text: draft.trim(),
      updatedAt: new Date().toISOString(),
      favorite: draftFavorite,
    };
    await putEntry(entry);
    window.localStorage.removeItem(`${DRAFT_PREFIX}${editorDate}`);
    setEntries((current) => [...current.filter((item) => item.date !== entry.date), entry]);
    setNotice('Memory saved on this device.');
    closeEditor();
  }

  async function removeMemory() {
    if (!editorDate || !entryMap.has(editorDate)) return;
    if (!window.confirm('Delete this memory? This cannot be undone.')) return;
    await deleteEntry(editorDate);
    window.localStorage.removeItem(`${DRAFT_PREFIX}${editorDate}`);
    setEntries((current) => current.filter((item) => item.date !== editorDate));
    setNotice('Memory deleted.');
    closeEditor();
  }

  async function toggleFavorite() {
    if (!editorDate) return;
    const nextFavorite = !draftFavorite;
    setDraftFavorite(nextFavorite);
    const savedEntry = entryMap.get(editorDate);
    if (!savedEntry) return;
    const updatedEntry = { ...savedEntry, favorite: nextFavorite };
    await putEntry(updatedEntry);
    setEntries((current) => current.map((entry) => entry.date === editorDate ? updatedEntry : entry));
    setNotice(nextFavorite ? 'Added to favorites.' : 'Removed from favorites.');
  }

  async function toggleEntryFavorite(date: string) {
    const savedEntry = entryMap.get(date);
    if (!savedEntry) return;
    const nextFavorite = !savedEntry.favorite;
    const updatedEntry = { ...savedEntry, favorite: nextFavorite };
    await putEntry(updatedEntry);
    setEntries((current) => current.map((entry) => entry.date === date ? updatedEntry : entry));
    setNotice(nextFavorite ? "Added to favorites." : "Removed from favorites.");
  }

  function openMemoryFromList(date: string, event: ReactMouseEvent<HTMLButtonElement>) {
    if (event.detail === 0) {
      openEditor(date);
      return;
    }
    if (memoryOpenTimerRef.current !== null) window.clearTimeout(memoryOpenTimerRef.current);
    memoryOpenTimerRef.current = window.setTimeout(() => {
      memoryOpenTimerRef.current = null;
      openEditor(date);
    }, 240);
  }

  function favoriteMemoryFromList(date: string, event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (memoryOpenTimerRef.current !== null) window.clearTimeout(memoryOpenTimerRef.current);
    memoryOpenTimerRef.current = null;
    void toggleEntryFavorite(date);
  }

  function exportJournal() {
    const exportedAt = new Date().toISOString();
    const sections = [...entries]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((entry) => [
        `## ${backupDateFormatter.format(dateFromKey(entry.date))}`,
        `<!-- little-orbit-entry:${entry.date}${entry.favorite ? ' favorite:true' : ''} -->`,
        '',
        entry.text,
        '',
        '<!-- /little-orbit-entry -->',
      ].join('\n'))
      .join('\n\n---\n\n');
    const payload = [
      '---',
      'title: "Little Orbit Journal"',
      `exported_at: "${exportedAt}"`,
      `entry_count: ${entries.length}`,
      '---',
      '',
      '# Little Orbit Journal',
      '',
      '> My year among the stars.',
      '',
      sections,
      '',
    ].join('\n');
    const url = URL.createObjectURL(new Blob([payload], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `little-orbit-backup-${todayKey}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice('Backup downloaded.');
  }

  async function importJournal(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const contents = await file.text();
      let candidateEntries: JournalEntry[] | undefined;
      if (file.name.toLowerCase().endsWith('.md')) {
        candidateEntries = parseMarkdownBackup(contents);
      } else {
        const parsed = JSON.parse(contents) as { entries?: JournalEntry[] } | JournalEntry[];
        candidateEntries = Array.isArray(parsed) ? parsed : parsed.entries;
      }
      if (!Array.isArray(candidateEntries) || !candidateEntries.length) throw new Error('Missing entries');
      const validEntries = candidateEntries.filter(
        (entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && typeof entry.text === 'string' && entry.text.trim(),
      ).map((entry) => ({
        date: entry.date,
        text: entry.text.trim(),
        updatedAt: entry.updatedAt || new Date().toISOString(),
        favorite: entry.favorite === true,
      }));
      await putEntries(validEntries);
      setEntries(await getEntries());
      setNotice(`${validEntries.length} memories restored.`);
    } catch {
      setNotice('That file is not a valid Little Orbit backup.');
    }
  }

  async function eraseJournal() {
    if (!window.confirm('Delete every memory from this device? Export a backup first if you may want them later.')) return;
    await clearEntries();
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(DRAFT_PREFIX)) window.localStorage.removeItem(key);
    }
    setEntries([]);
    setNotice('All memories were deleted.');
  }


  return (
    <main className="app-shell theme-dots" aria-busy={!dateReady} style={{ visibility: dateReady ? 'visible' : 'hidden' }}>
      <section className="phone-canvas" aria-label="Little Orbit journal">
        <header className="topbar">
          <button className="brand-button" type="button" onClick={() => setView('year')} aria-label="Go to year view">
            <span className="eyebrow">{view === 'year' ? 'My year among the stars' : view === 'memories' ? 'My collection' : 'Make it mine'}</span>
            <span className="brand-name">{view === 'year' ? 'Little Orbit' : view === 'memories' ? 'Memories' : 'My journal'}</span>
          </button>
          {view === 'year' && (
            <button
              className="calendar-view-button"
              type="button"
              onClick={() => setCalendarMode((mode) => mode === 'year' ? 'month' : 'year')}
              aria-label={`Switch to ${calendarMode === 'year' ? 'month' : 'year'} view`}
            >
              <span aria-hidden="true" />
              {calendarMode === 'year' ? 'Month' : 'Year'}
            </button>
          )}
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

              {calendarMode === 'year' ? (
                <>
                  <div
                    className="meadow"
                    aria-label={`${currentDay - 1} days complete. Today is day ${currentDay} of ${totalDays}.`}
                    onClick={activateNearestGap}
                    onPointerMove={trackDotPointer}
                    onPointerLeave={() => setHoveredDate(null)}
                    onTouchStart={() => { touchMovedRef.current = false; }}
                    onTouchMove={trackDotTouch}
                    onTouchEnd={() => {
                      setHoveredDate(null);
                      window.setTimeout(() => { touchMovedRef.current = false; }, 500);
                    }}
                    onTouchCancel={() => {
                      setHoveredDate(null);
                      touchMovedRef.current = false;
                    }}
                  >
                    {Array.from({ length: totalDays }, (_, index) => {
                      const day = index + 1;
                      const date = keyForDay(year, day);
                      const state = day < currentDay ? 'lived' : day === currentDay ? 'today' : 'future';
                      const entry = entryMap.get(date);
                      const recorded = entry ? 'recorded' : '';
                      const empty = entry ? '' : 'empty';
                      const favorite = entry?.favorite ? 'favorite' : '';
                      const dotDay = dotLayout[index];
                      const { tone } = dotDay;
                      let ripple = '';
                      if (hoveredDay !== null) {
                        const rowDistance = Math.abs(Math.floor((day - 1) / 19) - Math.floor((hoveredDay - 1) / 19));
                        const columnDistance = Math.abs(((day - 1) % 19) - ((hoveredDay - 1) % 19));
                        const distance = Math.hypot(rowDistance, columnDistance);
                        if (distance > 0 && distance <= 1.5) ripple = 'orbit-near';
                        else if (distance > 1.5 && distance <= 2.5) ripple = 'orbit-mid';
                      }
                      const dotStyle = {
                        '--day-scale': dotDay.scale.toFixed(3),
                        '--ripple-delay': `${dotDay.delay}s`,
                      } as CSSProperties;
                      return (
                        <button
                          className={`day-dot tone-${tone} ${state} ${recorded} ${empty} ${favorite} ${ripple} ${hoveredDate === date ? 'is-hovered' : ''}`}
                          key={date}
                          type="button"
                          data-dot-date={date}
                          style={dotStyle}
                          onClick={() => activateDay(date)}
                          aria-label={`${shortFormatter.format(dateFromKey(date))}${recorded ? ', memory saved' : ', no memory yet'}${favorite ? ', favorite' : ''}`}
                          title={shortFormatter.format(dateFromKey(date))}
                        />
                      );
                    })}
                  </div>

                  <div className="progress-copy">
                    <span><strong>{currentDay}</strong> of {totalDays} days</span>
                    <span>{Math.round((currentDay / totalDays) * 100)}% of the year</span>
                  </div>
                </>
              ) : (
                <section className="month-explorer" aria-label={`${monthFormatter.format(new Date(year, selectedMonth, 1))} ${year}`}>
                  <div className="month-heading">
                    <button type="button" onClick={() => setSelectedMonth((month) => Math.max(0, month - 1))} disabled={selectedMonth === 0} aria-label="Previous month">‹</button>
                    <strong>{monthFormatter.format(new Date(year, selectedMonth, 1))}</strong>
                    <button type="button" onClick={() => setSelectedMonth((month) => Math.min(11, month + 1))} disabled={selectedMonth === 11} aria-label="Next month">›</button>
                  </div>
                  <div className="month-weekdays" aria-hidden="true">
                    {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
                  </div>
                  <div className="month-grid">
                    {Array.from({ length: monthStartOffset }, (_, index) => <span className="month-blank" key={`blank-${index}`} />)}
                    {Array.from({ length: daysThisMonth }, (_, index) => {
                      const dateObject = new Date(year, selectedMonth, index + 1, 12);
                      const date = localDateKey(dateObject);
                      const yearIndex = dayOfYear(dateObject) - 1;
                      const dotDay = dotLayout[yearIndex];
                      const entry = entryMap.get(date);
                      const isFuture = date > todayKey;
                      return (
                        <button
                          className={`month-day tone-${dotDay.tone} ${date === todayKey ? 'today' : ''} ${entry ? 'recorded' : 'empty'} ${entry?.favorite ? 'favorite' : ''}`}
                          key={date}
                          type="button"
                          style={{ '--day-scale': dotDay.scale.toFixed(3) } as CSSProperties}
                          onClick={() => openEditor(date)}
                          disabled={isFuture}
                          aria-label={`${formatter.format(dateObject)}${entry ? ', memory saved' : ''}${entry?.favorite ? ', favorite' : ''}`}
                        >
                          <span className="month-dot" aria-hidden="true" />
                          <span>{index + 1}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
            </section>

            <section className="journal-card" aria-labelledby="today-heading">
              <div className="journal-heading">
                <div className="today-flower" aria-hidden="true">☾</div>
                <div>
                  <p className="eyebrow">Today’s memory</p>
                  <h2 id="today-heading">
                    {entryMap.has(todayKey) ? 'Today is safely tucked away.' : 'What made today mine?'}
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
              {ready ? `${yearEntries.length} ${yearEntries.length === 1 ? 'memory' : 'memories'} in my orbit this year` : 'Opening my private journal…'}
            </p>
          </div>
        )}

        {view === 'memories' && (
          <section className="memories-view" aria-label="Memories">
            <div className="section-heading">
              <p>Small moments, kept close.</p>
            </div>
            <label className="search-field">
              <span aria-hidden="true">⌕</span>
              <span className="sr-only">Search memories</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search my memories" type="search" />
            </label>

            <div className="memory-filters" role="group" aria-label="Filter memories">
              <button className={!favoritesOnly ? 'selected' : ''} type="button" onClick={() => setFavoritesOnly(false)}>All</button>
              <button className={favoritesOnly ? 'selected' : ''} type="button" onClick={() => setFavoritesOnly(true)}>
                Favorites <span>{entries.filter((entry) => entry.favorite).length}</span>
              </button>
            </div>

            {onThisDayEntries.length > 0 && (
              <section className="on-this-day" aria-labelledby="on-this-day-heading">
                <p className="eyebrow">On this day</p>
                <h2 id="on-this-day-heading">A memory found its way back</h2>
                <div>
                  {onThisDayEntries.map((entry) => (
                    <button key={entry.date} type="button" onClick={() => openEditor(entry.date)}>
                      <span>{dateFromKey(entry.date).getFullYear()}</span>
                      <strong>{entry.text}</strong>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div className="memory-list">
              {filteredEntries.length ? filteredEntries.map((entry) => (
                <button className={`memory-card ${entry.favorite ? 'favorite' : ''}`} key={entry.date} type="button" onClick={(event) => openMemoryFromList(entry.date, event)} onDoubleClick={(event) => favoriteMemoryFromList(entry.date, event)}>
                  <span className="memory-date">{formatter.format(dateFromKey(entry.date))}</span>
                  <span className="memory-text">{entry.text}</span>
                  <span className="memory-arrow" aria-hidden="true">↗</span>
                </button>
              )) : (
                <div className="empty-state">
                  <span aria-hidden="true">✦</span>
                  <h2>{favoritesOnly ? 'No favorites yet' : search ? 'No memories found' : 'My first star starts today'}</h2>
                  <p>{favoritesOnly ? 'Mark a memory as a favorite when you want to keep it close.' : search ? 'Try a different word or date.' : 'Write one small thing you want to keep.'}</p>
                  {!search && !favoritesOnly && <button type="button" onClick={() => openEditor(todayKey)}>Write today’s memory</button>}
                </div>
              )}
            </div>
          </section>
        )}

        {view === 'more' && (
          <section className="more-view" aria-label="My journal">
            <div className="section-heading">
              <p>Private, simple, and stored on this device.</p>
            </div>

            <section className="settings-card install-card">
              <div className="install-mark" aria-hidden="true">↥</div>
              <div>
                <h2>Put it on my Home Screen</h2>
                <p>In Safari, tap Share, then <strong>Add to Home Screen</strong>. It will open like an app and work offline.</p>
              </div>
            </section>


            <section className="settings-card data-card">
              <div className="setting-title">
                <div>
                  <h2>My data</h2>
                  <p>Entries stay in this browser. Markdown backups open in Notion or Obsidian and can also restore this journal.</p>
                </div>
                <span className="privacy-pill">Local only</span>
              </div>
              <button type="button" onClick={exportJournal} disabled={!entries.length}>Download Markdown backup <span>↓</span></button>
              <button type="button" onClick={() => importRef.current?.click()}>Restore backup <span>↑</span></button>
              <button className="danger-action" type="button" onClick={eraseJournal} disabled={!entries.length}>Delete all memories</button>
              <input ref={importRef} className="sr-only" type="file" accept="text/markdown,.md,application/json,.json" onChange={importJournal} />
            </section>
          </section>
        )}

        <nav className="bottom-nav" aria-label="Main navigation">
          <button className={`nav-item ${view === 'year' ? 'active' : ''}`} type="button" onClick={() => setView('year')} aria-current={view === 'year' ? 'page' : undefined}>
            <span aria-hidden="true">☾</span>
            Year
          </button>
          <button className={`nav-item ${view === 'memories' ? 'active' : ''}`} type="button" onClick={() => setView('memories')} aria-current={view === 'memories' ? 'page' : undefined}>
            <span aria-hidden="true">✦</span>
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
              <div className="editor-tools">
                <button className={`favorite-toggle ${draftFavorite ? 'selected' : ''}`} type="button" onClick={toggleFavorite} aria-pressed={draftFavorite} aria-label={draftFavorite ? 'Remove from favorites' : 'Add to favorites'} title={draftFavorite ? 'Remove from favorites' : 'Add to favorites'}>
                  <span aria-hidden="true">☾</span>
                </button>
                <button className="editor-close" type="button" onClick={closeEditor} aria-label="Close editor">×</button>
              </div>
            </div>
            <label className="memory-editor">
              <span className="sr-only">My memory</span>
              <textarea
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Today, I want to remember…"
              />
            </label>
            <p className="draft-status" aria-live="polite">{draftStatus || 'Drafts are saved automatically on this device.'}</p>
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
