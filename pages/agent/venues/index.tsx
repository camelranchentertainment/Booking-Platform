// pages/agent/venues/index.tsx
// Venues & Buyers: the agent's venue book, in the Tours page style —
// illustrated hero, four trackers, "Find new venues", type tabs and a grid of
// venue cards. Venues, festivals, fairs, promoters and private-event buyers,
// each with its contacts on one profile.
//
// Two searches, deliberately separate and both always visible:
//   • "Find new venues" searches Google by city and adds to the book.
//   • "Search your book" filters what is already saved, including contacts'
//     names and emails and the agent's tags, so there is no separate
//     Contacts page. It tolerates typos (lib/booker/fuzzy.ts).
// Tag, state and size filters narrow the book further; all filters combine.
// Counting lives in lib/booker/summary.ts (unit-tested).

import { useMemo, useState } from 'react';
import BookerShell from '../../../components/booker/BookerShell';
import VenueCard from '../../../components/booker/VenueCard';
import VenueSearchPanel from '../../../components/booker/VenueSearchPanel';
import VenueTownCheck from '../../../components/VenueTownCheck';
import { VenueForm } from '../../../components/booker/forms';
import PageHero from '../../../components/layout/PageHero';
import MainStreetScene from '../../../components/venues/MainStreetScene';
import { listContacts, listShows, listVenues } from '../../../lib/booker/data';
import { todayIso } from '../../../lib/booker/dates';
import { VENUE_SIZES, filterVenueCards, plural, venueBookSummary, venueCards, venueIndex, venueKindCounts, venueStates, type VenueSize } from '../../../lib/booker/summary';
import { searchIndex } from '../../../lib/booker/fuzzy';
import { tagCounts } from '../../../lib/booker/tags';
import { useLoad } from '../../../lib/booker/useLoad';
import { VENUE_KINDS, VENUE_KIND_LABEL, type VenueKind } from '../../../lib/booker/types';

/** Cards drawn at first; "Show more" adds this many again. Keeps big books quick. */
const PAGE_SIZE = 60;

function VenuesContent() {
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const { data, loading, error, reload } = useLoad(async () => {
    const [venues, contacts, shows] = await Promise.all([listVenues(), listContacts(), listShows()]);
    return { venues, contacts, shows };
  });
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<VenueKind | 'all'>('all');
  const [tags, setTags] = useState<string[]>([]);
  const [state, setState] = useState('');
  const [size, setSize] = useState<VenueSize | ''>('');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const view = useMemo(() => {
    if (!data) return null;
    const cards = venueCards(data.venues, data.contacts, data.shows, today);
    return {
      cards,
      // Built once per load; each keystroke only queries it.
      index: venueIndex(cards),
      summary: venueBookSummary(cards),
      kinds: venueKindCounts(cards),
      tags: tagCounts(data.venues),
      states: venueStates(cards),
    };
  }, [data, today]);

  const shown = useMemo(() => {
    if (!view) return [];
    const allowed = new Set(filterVenueCards(kind === 'all' ? view.cards : view.cards.filter(c => c.venue.kind === kind), { tags, state, size }).map(c => c.venue.id));
    return searchIndex(view.index, search).filter(c => allowed.has(c.venue.id));
  }, [view, kind, search, tags, state, size]);

  const filtersOn = Boolean(search.trim() || tags.length || state || size || kind !== 'all');
  const clearFilters = () =>
    changeFilter(() => {
      setSearch('');
      setTags([]);
      setState('');
      setSize('');
      setKind('all');
    });
  const toggleTag = (t: string) => changeFilter(() => setTags(prev => (prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])));

  const kindTabs = view ? VENUE_KINDS.filter(k => (view.kinds[k] ?? 0) > 0) : [];
  const heroSummary = view && view.summary.venues > 0
    ? `${plural(view.summary.venues, 'place')} in your book across ${plural(view.summary.states, 'state')} — ${view.summary.withEmail} with a booking email.`
    : undefined;
  const changeFilter = (fn: () => void) => {
    fn();
    setLimit(PAGE_SIZE);
  };

  return (
    <>
      <PageHero
        title="Venues & Buyers"
        subtitle="Your venue book"
        summary={heroSummary}
        scene={<MainStreetScene />}
        actions={
          <div className="agent-hero-actions">
            <button type="button" className="btn btn-primary tours-new-btn" onClick={() => setAdding(true)}>
              + Add manually
            </button>
            <VenueTownCheck endpoint="/api/booker/venues/towns" onApplied={() => void reload()} />
          </div>
        }
      />

      <div className="tours-body">
        {error && (
          <div className="card tours-empty" role="alert">
            <div className="tours-empty-title">Your venue book didn’t load</div>
            <p>{error}</p>
            <button type="button" className="btn btn-primary" onClick={() => void reload()}>
              Try again
            </button>
          </div>
        )}

        {loading && !data && !error && (
          <div className="tours-metrics" aria-busy="true">
            <span className="sr-only" role="status">
              Loading your venue book…
            </span>
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="tour-metric tour-skeleton" />
            ))}
          </div>
        )}

        {view && view.summary.venues > 0 && (
          <section className="tours-metrics" aria-label="Venue book at a glance">
            <div className="tour-metric">
              <span className="tour-metric-label">In your book</span>
              <div className="tour-metric-value">
                <strong>{view.summary.venues.toLocaleString()}</strong>
                <span>across {plural(view.summary.states, 'state')}</span>
              </div>
              <span className="tour-metric-note">Venues, festivals, fairs, promoters &amp; private events</span>
            </div>
            <div className="tour-metric">
              <span className="tour-metric-label">Booking emails</span>
              <div className="tour-metric-value">
                <strong className={view.summary.emailPct < 50 ? 'tour-metric-hot' : undefined}>{view.summary.withEmail.toLocaleString()}</strong>
                <span>
                  of {view.summary.venues.toLocaleString()} · {view.summary.emailPct}%
                </span>
              </div>
              <div className="tour-meter" role="progressbar" aria-label="Venues with a booking email" aria-valuemin={0} aria-valuemax={100} aria-valuenow={view.summary.emailPct}>
                <div className="tour-meter-bar" style={{ width: `${view.summary.emailPct}%` }} />
              </div>
            </div>
            <div className="tour-metric">
              <span className="tour-metric-label">Contacts</span>
              <div className="tour-metric-value">
                <strong>{view.summary.contacts.toLocaleString()}</strong>
                <span>{view.summary.contacts === 1 ? 'person' : 'people'}</span>
              </div>
              <span className="tour-metric-note">At your venues · {view.summary.sharedContacts > 0 ? `${view.summary.sharedContacts} shown to your bands` : 'none shown to your bands'}</span>
            </div>
            <div className="tour-metric">
              <span className="tour-metric-label">Booked at</span>
              <div className="tour-metric-value">
                <strong>{view.summary.bookedAt}</strong>
                <span>{view.summary.bookedAt === 1 ? 'venue' : 'venues'} with shows</span>
              </div>
              <span className="tour-metric-note">{view.summary.upcomingAt > 0 ? `${plural(view.summary.upcomingAt, 'venue')} with something coming up` : 'Nothing coming up yet'}</span>
            </div>
          </section>
        )}

        <div id="find" className="card" style={{ scrollMarginTop: '1rem' }}>
          <VenueSearchPanel heading="Find new venues" onAdded={() => void reload()} />
        </div>

        {view && view.summary.venues === 0 && (
          <div className="card tours-empty">
            <div className="tours-empty-title">Your venue book is empty</div>
            <p>Search a city above to find live-music venues, or add a venue, festival, fair or promoter yourself. Each one keeps its own contacts, and you decide which contacts your bands can see.</p>
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
              + Add manually
            </button>
          </div>
        )}

        {view && view.summary.venues > 0 && (
          <section className="agent-section" aria-labelledby="book-h">
            <div className="agent-section-head">
              <h2 id="book-h" className="agent-section-title">
                Your book
              </h2>
              <span className="agent-section-note">{search.trim() ? 'Best match first' : 'Sorted by name'}</span>
            </div>
            {kindTabs.length > 1 && (
              <div className="tours-toolbar">
                <div className="tours-tabs" role="group" aria-label="Show by type">
                  <button type="button" className={`tours-tab${kind === 'all' ? ' tours-tab--on' : ''}`} aria-pressed={kind === 'all'} onClick={() => changeFilter(() => setKind('all'))}>
                    All · {view.summary.venues}
                  </button>
                  {kindTabs.map(k => (
                    <button key={k} type="button" className={`tours-tab${kind === k ? ' tours-tab--on' : ''}`} aria-pressed={kind === k} onClick={() => changeFilter(() => setKind(k))}>
                      {VENUE_KIND_LABEL[k]} · {view.kinds[k]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div role="search" className="agent-filters" aria-label="Search and filter your book">
              <label className="sr-only" htmlFor="v-search">
                Search your book
              </label>
              <input
                id="v-search"
                className="input"
                type="search"
                value={search}
                onChange={e => changeFilter(() => setSearch(e.target.value))}
                placeholder="Search venue, city, tag, or a contact — typos are OK"
                style={{ minWidth: 'min(100%, 22rem)' }}
                enterKeyHint="search"
              />
              {view.states.length > 1 && (
                <>
                  <label className="sr-only" htmlFor="v-state">
                    State
                  </label>
                  <select id="v-state" className="select" value={state} onChange={e => changeFilter(() => setState(e.target.value))}>
                    <option value="">All states</option>
                    {view.states.map(st => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <label className="sr-only" htmlFor="v-size">
                Capacity
              </label>
              <select id="v-size" className="select" value={size} onChange={e => changeFilter(() => setSize(e.target.value as VenueSize | ''))}>
                <option value="">Any size</option>
                {VENUE_SIZES.map(z => (
                  <option key={z.key} value={z.key}>
                    Capacity {z.label}
                  </option>
                ))}
              </select>
              {filtersOn && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
                  Clear all
                </button>
              )}
            </div>
            {view.tags.length > 0 && (
              <div className="agent-filter-row" role="group" aria-label="Filter by tag (a venue must have every tag picked)">
                <span className="agent-filter-label" aria-hidden="true">
                  Tags
                </span>
                {view.tags.map(({ tag, count }) => (
                  <button key={tag} type="button" className="tag-filter" aria-pressed={tags.includes(tag)} onClick={() => toggleTag(tag)}>
                    {tag} <span className="tag-filter-count">{count}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="sr-only" role="status" aria-live="polite">
              {filtersOn ? `${plural(shown.length, 'venue')} shown` : ''}
            </p>

            {shown.length === 0 ? (
              <div className="card tours-empty">
                <div className="tours-empty-title">Nothing matches</div>
                <p>{search.trim() ? `No venue or contact in your book matches “${search.trim()}” with the filters picked.` : 'No venue in your book has everything picked.'} Clear a filter, or try Find new venues above.</p>
                <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                  Clear all filters
                </button>
              </div>
            ) : (
              <>
                <div className="tours-grid" aria-label={`${plural(shown.length, 'venue')} shown`}>
                  {shown.slice(0, limit).map(c => (
                    <VenueCard key={c.venue.id} card={c} currentYear={year} search={search} />
                  ))}
                </div>
                {shown.length > limit && (
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setLimit(l => l + PAGE_SIZE)}>
                      Show more · {shown.length - limit} left
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>

      {adding && (
        <VenueForm
          tagSuggestions={view?.tags.map(t => t.tag)}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            void reload();
          }}
        />
      )}
    </>
  );
}

export default function BookerVenues() {
  return (
    <BookerShell title="Venues & Buyers">
      <VenuesContent />
    </BookerShell>
  );
}
