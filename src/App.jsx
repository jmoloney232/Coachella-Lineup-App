import { useEffect, useMemo, useState } from "react";
import {
  DAY_ORDER,
  DOLAB_ROW_PATTERNS,
  MY_LIST_STORAGE_KEY,
  QUASAR_DAY_ORDER,
  USER_ID_STORAGE_KEY,
  normalizeLookupValue,
} from "./lib/lineupData";

const DAY_META = {
  Friday: { label: "FRIDAY APRIL 10 & 17" },
  Saturday: { label: "SATURDAY APRIL 11 & 18" },
  Sunday: { label: "SUNDAY APRIL 12 & 19" },
};

const ROW_PATTERNS = {
  Friday: [1, 8, 10, 10, 10, 11],
  Saturday: [1, 9, 10, 10, 13],
  Sunday: [1, 9, 10, 10, 11, 1],
};

function buildRows(artists, pattern) {
  const rows = [];
  let cursor = 0;

  pattern.forEach((count) => {
    if (cursor >= artists.length) {
      return;
    }

    rows.push(artists.slice(cursor, cursor + count));
    cursor += count;
  });

  if (cursor < artists.length) {
    rows.push(artists.slice(cursor));
  }

  return rows.filter((row) => row.length > 0);
}

function buildBalancedRows(artists, size = 6) {
  const rows = [];
  for (let index = 0; index < artists.length; index += size) {
    rows.push(artists.slice(index, index + size));
  }
  return rows;
}

function coachellaArtistClassName(rowIndex, rowLength, artistIndex, totalRows) {
  if (rowIndex === 0) return "artistButton hero";
  if (rowIndex === totalRows - 1 && rowLength === 1) return "artistButton finale";
  if (rowIndex === 1) return "artistButton tierOne";
  if (rowIndex === 2) return "artistButton tierTwo";
  if (rowIndex === 3) return "artistButton tierThree";
  if (rowIndex === 4) return "artistButton tierFour";
  if (artistIndex > rowLength - 3) return "artistButton tierFive compact";
  return "artistButton tierFive";
}

function TrackSection({ label, tracks, compact = false }) {
  return (
    <div className="trackSection">
      <p className="trackSectionLabel">{label}</p>
      <div className={`trackGridScroller ${compact ? "compact" : ""}`}>
        <div className="trackGrid">
          {tracks.length > 0 ? (
            <ol start={1}>
              {tracks.map((track) => (
                <li key={track}>{track}</li>
              ))}
            </ol>
          ) : (
            <p className="trackEmpty">No song data yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SaveActionButton({ isSaved, onToggleSave }) {
  return (
    <button className={`saveArtistButton ${isSaved ? "active" : ""}`} type="button" onClick={onToggleSave}>
      {isSaved ? "Remove from My List" : "Add to My List"}
    </button>
  );
}

function AuthMenu({
  authUser,
  authEmail,
  authPassword,
  authPending,
  authMenuOpen,
  onToggleMenu,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onLogout,
}) {
  return (
    <div className="authMenu">
      {authUser ? (
        <button className="authSecondaryButton compact" type="button" onClick={onLogout} disabled={authPending}>
          {authPending ? "Signing Out..." : "Sign Out"}
        </button>
      ) : (
        <>
          <button className="authSecondaryButton compact" type="button" onClick={onToggleMenu} disabled={authPending}>
            Sign In
          </button>
          {authMenuOpen ? (
            <form className="authPopover" onSubmit={onSubmit}>
              <label className="authField">
                <span>Email</span>
                <input type="email" value={authEmail} onChange={(event) => onEmailChange(event.target.value)} autoComplete="email" required />
              </label>
              <label className="authField">
                <span>Password</span>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(event) => onPasswordChange(event.target.value)}
                  autoComplete="current-password"
                  minLength={8}
                  required
                />
              </label>
              <button className="authPrimaryButton compact" type="submit" disabled={authPending}>
                {authPending ? "Signing In..." : "Sign In"}
              </button>
            </form>
          ) : null}
        </>
      )}
    </div>
  );
}

function CoachellaArtistPanel({ artist, artistLookup, onRelatedArtistSelect, isSaved, onToggleSave }) {
  const relatedArtists = artist.relatedArtistsList.map((name) => ({
    name,
    targetArtist: artistLookup.get(name) ?? null,
  }));

  return (
    <article className="artistPanel">
      <div className="artistPanelHeader">
        <div>
          <p className="panelEyebrow">{artist.day.toUpperCase()}</p>
          <h3>{artist.artist}</h3>
          <p className="panelGenre">{artist.genre || "Genre TBD"}</p>
        </div>
        <div className="panelMeta">
          <SaveActionButton isSaved={isSaved} onToggleSave={onToggleSave} />
          {artist.spotify_url ? (
            <a href={artist.spotify_url} target="_blank" rel="noreferrer">
              Open Spotify
            </a>
          ) : null}
        </div>
      </div>
      <p className="panelNote">{artist.note || "More artist notes coming soon."}</p>
      {relatedArtists.length > 0 ? (
        <div className="relatedArtistsSection">
          <p className="relatedArtistsLabel">Related Artists</p>
          <div className="relatedArtistsList">
            {relatedArtists.map((relatedArtist) =>
              relatedArtist.targetArtist ? (
                <button
                  key={relatedArtist.name}
                  className="relatedArtistLink"
                  type="button"
                  onClick={() => onRelatedArtistSelect(relatedArtist.targetArtist.id)}
                >
                  {relatedArtist.name}
                </button>
              ) : (
                <span key={relatedArtist.name} className="relatedArtistText">
                  {relatedArtist.name}
                </span>
              ),
            )}
          </div>
        </div>
      ) : null}
      <div className={`artistPanelContent ${artist.imageUrl ? "hasImage" : ""}`}>
        {artist.imageUrl ? (
          <div className="artistImageWrap">
            <img className="artistImage" src={artist.imageUrl} alt={artist.artist} />
          </div>
        ) : null}
        <div className="trackSections">
          <TrackSection label="Setlist Songs" tracks={artist.songsList} />
          <TrackSection label="Popular Songs" tracks={artist.popularSongsList} />
        </div>
      </div>
      <p className="panelFootnote">Based on your CSV data. You can expand the fields later without changing the layout.</p>
    </article>
  );
}

function DoLabArtistPanel({ artist, isSaved, onToggleSave }) {
  return (
    <article className="artistPanel dolabPanel">
      <div className="artistPanelHeader">
        <div>
          <p className="panelEyebrow dolabEyebrow">DO LAB 2026</p>
          <h3>{artist.artist}</h3>
          <p className="panelGenre">{artist.genre || "Genre TBD"}</p>
        </div>
        <div className="panelMeta">
          <SaveActionButton isSaved={isSaved} onToggleSave={onToggleSave} />
          {artist.spotify_url ? (
            <a href={artist.spotify_url} target="_blank" rel="noreferrer">
              Open Spotify
            </a>
          ) : null}
        </div>
      </div>
      <p className="panelNote">{artist.note || "Description coming soon."}</p>
      <div className="trackSections single">
        <TrackSection label="Popular Songs" tracks={artist.popularSongsList} compact />
      </div>
    </article>
  );
}

function GenericArtistPanel({ artist, eyebrow, isSaved, onToggleSave }) {
  return (
    <article className={`artistPanel ${artist.festival === "dolab" ? "dolabPanel" : artist.festival === "quasar" ? "quasarPanel" : ""}`}>
      <div className="artistPanelHeader">
        <div>
          <p className={`panelEyebrow ${artist.festival === "dolab" ? "dolabEyebrow" : artist.festival === "quasar" ? "quasarEyebrow" : ""}`}>{eyebrow}</p>
          <h3>{artist.artist}</h3>
          <p className="panelGenre">{artist.genre || "Genre TBD"}</p>
        </div>
        <div className="panelMeta">
          <SaveActionButton isSaved={isSaved} onToggleSave={onToggleSave} />
          {artist.spotify_url ? (
            <a href={artist.spotify_url} target="_blank" rel="noreferrer">
              Open Spotify
            </a>
          ) : null}
        </div>
      </div>
      <p className="panelNote">{artist.note || "Description coming soon."}</p>
      <div className={`artistPanelContent ${artist.imageUrl ? "hasImage" : ""}`}>
        {artist.imageUrl ? (
          <div className="artistImageWrap">
            <img className="artistImage" src={artist.imageUrl} alt={artist.artist} />
          </div>
        ) : null}
        <div className="trackSections single">
          <TrackSection label={artist.festival === "coachella" ? "Popular Songs" : "Popular Songs"} tracks={artist.popularSongsList ?? artist.songsList ?? []} compact />
        </div>
      </div>
    </article>
  );
}

function CoachellaRow({ artists, rowIndex, totalRows, selectedArtistId, onSelect }) {
  return (
    <div className="lineupRow">
      {artists.map((artist, artistIndex) => (
        <div key={artist.id} className="artistChip">
          <button
            id={`artist-${artist.id}`}
            className={`${coachellaArtistClassName(rowIndex, artists.length, artistIndex, totalRows)} ${
              selectedArtistId === artist.id ? "active" : ""
            }`}
            type="button"
            onClick={() => onSelect(artist.id, true)}
          >
            {artist.artist}
          </button>
          {artistIndex < artists.length - 1 ? <span className="separator">•</span> : null}
        </div>
      ))}
    </div>
  );
}

function DoLabRow({ artists, selectedArtistId, onSelect }) {
  return (
    <div className="dolabRow">
      {artists.map((artist, artistIndex) => (
        <div key={artist.id} className="dolabChip">
          <button
            id={`artist-${artist.id}`}
            className={`dolabArtistButton uniform ${
              artist.weekend === "weekend1" ? "peach" : artist.weekend === "weekend2" ? "violet" : "peach"
            } ${selectedArtistId === artist.id ? "active" : ""}`}
            type="button"
            onClick={() => onSelect(artist.id, true)}
          >
            {artist.artist}
          </button>
          {artistIndex < artists.length - 1 ? <span className="dolabSeparator">•</span> : null}
        </div>
      ))}
    </div>
  );
}

function CoachellaDaySection({ day, artists, selectedArtistId, onSelect, artistLookup, savedArtistIds, onToggleSavedArtist }) {
  const rows = useMemo(() => buildRows(artists, ROW_PATTERNS[day]), [artists, day]);
  const selectedArtist = artists.find((artist) => artist.id === selectedArtistId) ?? null;
  const selectedRowIndex = rows.findIndex((row) => row.some((artist) => artist.id === selectedArtistId));

  return (
    <section className={`daySection day-${day.toLowerCase()}`}>
      <div className="dayLabel">{DAY_META[day].label}</div>
      {rows.map((row, rowIndex) => (
        <div key={`${day}-row-${rowIndex}`} className="rowBlock">
          <CoachellaRow
            artists={row}
            rowIndex={rowIndex}
            totalRows={rows.length}
            selectedArtistId={selectedArtistId}
            onSelect={onSelect}
          />
          {selectedArtist && selectedRowIndex === rowIndex ? (
            <CoachellaArtistPanel
              artist={selectedArtist}
              artistLookup={artistLookup}
              onRelatedArtistSelect={(artistId) => onSelect(artistId, false)}
              isSaved={savedArtistIds.includes(selectedArtist.id)}
              onToggleSave={() => onToggleSavedArtist(selectedArtist.id)}
            />
          ) : null}
        </div>
      ))}
    </section>
  );
}

function CoachellaPoster({ artists, selectedArtistId, onSelect, artistLookup, savedArtistIds = [], onToggleSavedArtist = () => {} }) {
  const artistsByDay = useMemo(
    () =>
      DAY_ORDER.reduce((collection, day) => {
        collection[day] = artists.filter((artist) => artist.day === day);
        return collection;
      }, {}),
    [artists],
  );

  return (
    <div className="posterBody">
      {DAY_ORDER.map((day) =>
        artistsByDay[day]?.length ? (
          <CoachellaDaySection
            key={day}
            day={day}
            artists={artistsByDay[day]}
            selectedArtistId={selectedArtistId}
            onSelect={onSelect}
            artistLookup={artistLookup}
            savedArtistIds={savedArtistIds}
            onToggleSavedArtist={onToggleSavedArtist}
          />
        ) : null,
      )}
    </div>
  );
}

function DoLabPage({ artists, selectedArtistId, onSelect, savedArtistIds, onToggleSavedArtist }) {
  const rows = useMemo(() => buildRows(artists, DOLAB_ROW_PATTERNS), [artists]);
  const selectedArtist = artists.find((artist) => artist.id === selectedArtistId) ?? null;
  const selectedRowIndex = rows.findIndex((row) => row.some((artist) => artist.id === selectedArtistId));

  return (
    <main className="dolabShell">
      <div className="dolabStars" />
      <div className="dolabCityGlow" />
      <header className="dolabHeader">
        <p className="dolabWordmark">DO LAB</p>
        <h1>COACHELLA 2026</h1>
        <p className="dolabInstruction">Tap any artist to open their details.</p>
      </header>

      <section className="dolabPoster">
        {rows.map((row, rowIndex) => (
          <div key={`dolab-row-${rowIndex}`} className="rowBlock dolabRowBlock">
            <DoLabRow artists={row} selectedArtistId={selectedArtistId} onSelect={onSelect} />
            {selectedArtist && selectedRowIndex === rowIndex ? (
              <DoLabArtistPanel
                artist={selectedArtist}
                isSaved={savedArtistIds.includes(selectedArtist.id)}
                onToggleSave={() => onToggleSavedArtist(selectedArtist.id)}
              />
            ) : null}
          </div>
        ))}
      </section>

      <footer className="dolabFooter">
        <span>Weekend 1</span>
        <span>April 10-12</span>
        <span>Weekend 2</span>
        <span>April 17-19</span>
      </footer>
    </main>
  );
}

function QuasarPage({ artists, selectedArtistId, onSelect, activeWeekend, onWeekendChange, savedArtistIds, onToggleSavedArtist }) {
  const weekendArtists = useMemo(() => artists.filter((artist) => artist.weekend === activeWeekend), [artists, activeWeekend]);
  const artistsByDay = useMemo(
    () =>
      QUASAR_DAY_ORDER.reduce((collection, day) => {
        collection[day] = weekendArtists.find((artist) => artist.day === day) ?? null;
        return collection;
      }, {}),
    [weekendArtists],
  );

  return (
    <main className={`quasarShell ${activeWeekend}`}>
      <div className="quasarStars" />
      <div className="quasarGlow" />
      <header className="quasarHeader">
        <p>GOLDENVOICE PRESENTS IN INDIO</p>
        <h1>QUASAR</h1>
        <h2>COACHELLA 2026</h2>
        <p className="quasarSubhead">EXTENDED SETS</p>
        <div className="quasarWeekendNav">
          <button className={`quasarWeekendButton ${activeWeekend === "weekend1" ? "active" : ""}`} type="button" onClick={() => onWeekendChange("weekend1")}>
            Weekend 1
          </button>
          <button className={`quasarWeekendButton ${activeWeekend === "weekend2" ? "active" : ""}`} type="button" onClick={() => onWeekendChange("weekend2")}>
            Weekend 2
          </button>
        </div>
      </header>

      <section className="quasarPoster">
        {QUASAR_DAY_ORDER.map((day) => {
          const artist = artistsByDay[day];
          if (!artist) return null;

          const isSelected = selectedArtistId === artist.id;
          const dateLabel =
            activeWeekend === "weekend1"
              ? day === "Friday"
                ? "APRIL 10"
                : day === "Saturday"
                  ? "APRIL 11"
                  : "APRIL 12"
              : day === "Friday"
                ? "APRIL 17"
                : day === "Saturday"
                  ? "APRIL 18"
                  : "APRIL 19";

          return (
            <div key={artist.id} className="quasarDayBlock">
              <p className="quasarDayLabel">{`${day.toUpperCase()}, ${dateLabel}`}</p>
              <button
                id={`artist-${artist.id}`}
                className={`quasarArtistButton ${isSelected ? "active" : ""}`}
                type="button"
                onClick={() => onSelect(artist.id, true)}
              >
                {artist.artist}
              </button>
              {isSelected ? (
                <GenericArtistPanel
                  artist={artist}
                  eyebrow={activeWeekend === "weekend1" ? "Weekend 1" : "Weekend 2"}
                  isSaved={savedArtistIds.includes(artist.id)}
                  onToggleSave={() => onToggleSavedArtist(artist.id)}
                />
              ) : null}
            </div>
          );
        })}
      </section>
    </main>
  );
}

function CoachellaPage({ artists, selectedArtistId, onSelect, savedArtistIds, onToggleSavedArtist }) {
  const artistLookup = useMemo(() => {
    const lookup = new Map();
    const normalizedLookup = new Map();

    artists.forEach((artist) => {
      lookup.set(artist.artist, artist);
      normalizedLookup.set(normalizeLookupValue(artist.artist), artist);
    });

    artists.forEach((artist) => {
      artist.relatedArtistsList.forEach((name) => {
        if (lookup.has(name)) return;

        const normalizedName = normalizeLookupValue(name);
        const directMatch = normalizedLookup.get(normalizedName);
        if (directMatch) {
          lookup.set(name, directMatch);
          return;
        }

        const fuzzyMatch = artists.find((candidate) => {
          const normalizedCandidate = normalizeLookupValue(candidate.artist);
          return (
            normalizedCandidate.startsWith(normalizedName) ||
            normalizedName.startsWith(normalizedCandidate) ||
            normalizedCandidate.includes(normalizedName)
          );
        });

        if (fuzzyMatch) {
          lookup.set(name, fuzzyMatch);
        }
      });
    });

    return lookup;
  }, [artists]);

  return (
    <main className="posterShell">
      <div className="skyGlow" />
      <div className="horizon" />
      <header className="posterHeader">
        <p>GOLDENVOICE PRESENTS IN INDIO</p>
        <h1>COACHELLA</h1>
        <h2>COACHELLA VALLEY MUSIC AND ARTS FESTIVAL</h2>
        <div className="locationRow">
          <span>INDIO</span>
          <span>CALIFORNIA</span>
          <span>EMPIRE POLO CLUB</span>
        </div>
        <p className="instruction">Tap any artist to open their set details below their lineup tier.</p>
      </header>

      <CoachellaPoster
        artists={artists}
        selectedArtistId={selectedArtistId}
        onSelect={onSelect}
        artistLookup={artistLookup}
        savedArtistIds={savedArtistIds}
        onToggleSavedArtist={onToggleSavedArtist}
      />
    </main>
  );
}

function MyListRow({ artists, selectedArtistId, onSelect }) {
  return (
    <div className="lineupRow">
      {artists.map((artist, artistIndex) => (
        <div key={artist.id} className="artistChip">
          <button
            id={`artist-${artist.id}`}
            className={`artistButton tierThree ${selectedArtistId === artist.id ? "active" : ""}`}
            type="button"
            onClick={() => onSelect(artist.id, true)}
          >
            {artist.artist}
          </button>
          {artistIndex < artists.length - 1 ? <span className="separator">•</span> : null}
        </div>
      ))}
    </div>
  );
}

function SavedDaySection({ day, artists, selectedArtistId, onSelect }) {
  const rows = useMemo(() => buildRows(artists, ROW_PATTERNS[day]), [artists, day]);
  const selectedArtist = artists.find((artist) => artist.id === selectedArtistId) ?? null;
  const selectedRowIndex = rows.findIndex((row) => row.some((artist) => artist.id === selectedArtistId));

  return (
    <section className={`daySection day-${day.toLowerCase()}`}>
      <div className="dayLabel">{day.toUpperCase()}</div>
      {rows.map((row, rowIndex) => (
        <div key={`${day}-saved-row-${rowIndex}`} className="rowBlock">
          <CoachellaRow
            artists={row}
            rowIndex={rowIndex}
            totalRows={rows.length}
            selectedArtistId={selectedArtistId}
            onSelect={onSelect}
          />
          {selectedArtist && selectedRowIndex === rowIndex ? (
            <GenericArtistPanel
              artist={selectedArtist}
              eyebrow={
                selectedArtist.festival === "coachella"
                  ? selectedArtist.day.toUpperCase()
                  : selectedArtist.festival === "dolab"
                    ? "DO LAB"
                    : selectedArtist.weekend === "weekend1"
                      ? "QUASAR WEEKEND 1"
                      : "QUASAR WEEKEND 2"
              }
              isSaved
              onToggleSave={() => onSelect(selectedArtist.id, false, true)}
            />
          ) : null}
        </div>
      ))}
    </section>
  );
}

function SavedDoLabSection({ artists, selectedArtistId, onSelect }) {
  const rows = useMemo(() => buildBalancedRows(artists, 5), [artists]);
  const selectedArtist = artists.find((artist) => artist.id === selectedArtistId) ?? null;
  const selectedRowIndex = rows.findIndex((row) => row.some((artist) => artist.id === selectedArtistId));

  return (
    <section className="daySection savedSpecialSection">
      <div className="dayLabel">DO LAB</div>
        {rows.map((row, rowIndex) => (
          <div key={`saved-dolab-row-${rowIndex}`} className="rowBlock">
            <DoLabRow artists={row} selectedArtistId={selectedArtistId} onSelect={onSelect} />
          {selectedArtist && selectedRowIndex === rowIndex ? (
            <GenericArtistPanel
              artist={selectedArtist}
              eyebrow="DO LAB"
              isSaved
              onToggleSave={() => onSelect(selectedArtist.id, false, true)}
            />
          ) : null}
        </div>
      ))}
    </section>
  );
}

function MyListPage({ coachellaArtists, dolabArtists, quasarArtists, selectedArtistIds, onToggleArtist, selectedArtistId, onSelect }) {
  const selectedIds = useMemo(() => new Set(selectedArtistIds), [selectedArtistIds]);
  const selectedCoachella = useMemo(
    () => coachellaArtists.filter((artist) => selectedIds.has(artist.id)),
    [coachellaArtists, selectedIds],
  );
  const selectedQuasar = useMemo(
    () => quasarArtists.filter((artist) => selectedIds.has(artist.id)),
    [quasarArtists, selectedIds],
  );
  const selectedDoLab = useMemo(
    () => dolabArtists.filter((artist) => selectedIds.has(artist.id)),
    [dolabArtists, selectedIds],
  );
  const artistsByDay = useMemo(
    () =>
      DAY_ORDER.reduce((collection, day) => {
        collection[day] = [
          ...selectedCoachella.filter((artist) => artist.day === day),
          ...selectedQuasar.filter((artist) => artist.day === day),
        ].sort((left, right) => {
          const leftPriority = left.festival === "coachella" ? 0 : 1;
          const rightPriority = right.festival === "coachella" ? 0 : 1;
          if (leftPriority !== rightPriority) {
            return leftPriority - rightPriority;
          }
          return left.lineupRank - right.lineupRank;
        });
        return collection;
      }, {}),
    [selectedCoachella, selectedQuasar],
  );

  return (
    <main className="posterShell myListShell">
      <div className="skyGlow" />
      <div className="horizon" />
      <header className="posterHeader myListHeader">
        <p>GOLDENVOICE PRESENTS IN INDIO</p>
        <h1>MY LIST</h1>
        <h2>PERSONAL COACHELLA LINEUP</h2>
        <div className="locationRow">
          <span>INDIO</span>
          <span>CALIFORNIA</span>
          <span>EMPIRE POLO CLUB</span>
        </div>
        <p className="instruction">Artists keep their original lineup priority. Quasar and Do LaB appear after main lineup picks.</p>
      </header>

      <section className="posterBody myListBody">
        <div className="savedSectionHeader">
          <p>Your Saved Lineup</p>
          <span>{selectedArtistIds.length} artists selected</span>
        </div>

        {selectedArtistIds.length === 0 ? (
          <p className="savedEmpty">No artists selected yet.</p>
        ) : (
          <>
            {DAY_ORDER.map((day) =>
              artistsByDay[day]?.length ? (
                <SavedDaySection
                  key={day}
                  day={day}
                  artists={artistsByDay[day]}
                  selectedArtistId={selectedArtistId}
                  onSelect={(artistId, allowToggle = true, remove = false) => {
                    if (remove) {
                      onToggleArtist(artistId);
                      return;
                    }
                    onSelect(artistId, allowToggle);
                  }}
                />
              ) : null,
            )}
            {selectedDoLab.length ? (
              <SavedDoLabSection
                artists={selectedDoLab}
                selectedArtistId={selectedArtistId}
                onSelect={(artistId, allowToggle = true, remove = false) => {
                  if (remove) {
                    onToggleArtist(artistId);
                    return;
                  }
                  onSelect(artistId, allowToggle);
                }}
              />
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}

function getInitialPage() {
  const hash = window.location.hash.replace("#", "");
  if (hash === "dolab" || hash === "quasar" || hash === "my-list") {
    return hash;
  }
  return "coachella";
}

function getOrCreateGuestUserId() {
  try {
    const existing = window.localStorage.getItem(USER_ID_STORAGE_KEY);
    if (existing && existing.startsWith("guest_")) {
      return existing;
    }

    const nextId = `guest_${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(USER_ID_STORAGE_KEY, nextId);
    return nextId;
  } catch {
    return `guest_${Math.random().toString(36).slice(2, 12)}`;
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

export default function App() {
  const [activePage, setActivePage] = useState(getInitialPage);
  const [coachellaArtists, setCoachellaArtists] = useState([]);
  const [dolabArtists, setDolabArtists] = useState([]);
  const [quasarArtists, setQuasarArtists] = useState([]);
  const [selectedCoachellaArtistId, setSelectedCoachellaArtistId] = useState("");
  const [selectedDolabArtistId, setSelectedDolabArtistId] = useState("");
  const [selectedQuasarArtistId, setSelectedQuasarArtistId] = useState("");
  const [selectedMyListArtistId, setSelectedMyListArtistId] = useState("");
  const [activeQuasarWeekend, setActiveQuasarWeekend] = useState("weekend1");
  const [guestUserId] = useState(getOrCreateGuestUserId);
  const [authUser, setAuthUser] = useState(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPending, setAuthPending] = useState(false);
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [savedArtistIds, setSavedArtistIds] = useState(() => {
    try {
      const stored = window.localStorage.getItem(MY_LIST_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    function syncPageFromHash() {
      setActivePage(getInitialPage());
    }

    window.addEventListener("hashchange", syncPageFromHash);
    return () => window.removeEventListener("hashchange", syncPageFromHash);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(MY_LIST_STORAGE_KEY, JSON.stringify(savedArtistIds));
  }, [savedArtistIds]);

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        const [payload, authPayload] = await Promise.all([requestJson("/api/lineups"), requestJson("/api/auth/me")]);
        const nextCoachellaArtists = Array.isArray(payload.coachella) ? payload.coachella : [];
        const nextDolabArtists = Array.isArray(payload.dolab) ? payload.dolab : [];
        const nextQuasarArtists = Array.isArray(payload.quasar) ? payload.quasar : [];
        const nextAuthUser = authPayload.user ?? null;
        const myListPayload = await requestJson(
          nextAuthUser ? "/api/my-list" : `/api/my-list?userId=${encodeURIComponent(guestUserId)}`,
        );
        const nextSavedArtistIds = Array.isArray(myListPayload.artistIds) ? myListPayload.artistIds : [];
        const localSavedArtistIds = (() => {
          try {
            const stored = window.localStorage.getItem(MY_LIST_STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
          } catch {
            return [];
          }
        })();

        if (!active) return;

        setCoachellaArtists(nextCoachellaArtists);
        setDolabArtists(nextDolabArtists);
        setQuasarArtists(nextQuasarArtists);
        setAuthUser(nextAuthUser);
        setSavedArtistIds(nextSavedArtistIds);

        if (!nextAuthUser && nextSavedArtistIds.length === 0 && Array.isArray(localSavedArtistIds) && localSavedArtistIds.length > 0) {
          const migratedPayload = await requestJson(`/api/my-list?userId=${encodeURIComponent(guestUserId)}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ artistIds: localSavedArtistIds }),
          });

          if (active) {
            setSavedArtistIds(Array.isArray(migratedPayload.artistIds) ? migratedPayload.artistIds : []);
          }
        }
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load lineup data.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();
    return () => {
      active = false;
    };
  }, [guestUserId]);

  function handleSelectArtist(setter) {
    return (artistId, allowToggle = true) => {
      setter((current) => {
        const nextArtistId = allowToggle && current === artistId ? "" : artistId;
        if (nextArtistId) {
          window.requestAnimationFrame(() => {
            document.getElementById(`artist-${nextArtistId}`)?.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
          });
        }
        return nextArtistId;
      });
    };
  }

  async function handleToggleSavedArtist(artistId) {
    const currentArtistIds = savedArtistIds;
    const nextArtistIds = currentArtistIds.includes(artistId)
      ? currentArtistIds.filter((id) => id !== artistId)
      : [...currentArtistIds, artistId];

    setSavedArtistIds(nextArtistIds);

    try {
      setError("");
      const payload = await requestJson(authUser ? "/api/my-list" : `/api/my-list?userId=${encodeURIComponent(guestUserId)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ artistIds: nextArtistIds }),
      });
      setSavedArtistIds(Array.isArray(payload.artistIds) ? payload.artistIds : []);
    } catch (saveError) {
      setSavedArtistIds(currentArtistIds);
      setError(saveError instanceof Error ? saveError.message : "Unable to save your list.");
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthPending(true);
    setError("");

    try {
      const payload = await requestJson("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: authEmail,
          password: authPassword,
          guestUserId,
        }),
      });

      setAuthUser(payload.user ?? null);
      setAuthPassword("");
      setAuthMenuOpen(false);
      const myListPayload = await requestJson("/api/my-list");
      setSavedArtistIds(Array.isArray(myListPayload.artistIds) ? myListPayload.artistIds : []);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Unable to authenticate.");
    } finally {
      setAuthPending(false);
    }
  }

  async function handleLogout() {
    setAuthPending(true);
    setError("");

    try {
      await requestJson("/api/auth/logout", { method: "POST" });
      setAuthUser(null);
      setAuthPassword("");
      setAuthMenuOpen(false);
      const guestListPayload = await requestJson(`/api/my-list?userId=${encodeURIComponent(guestUserId)}`);
      setSavedArtistIds(Array.isArray(guestListPayload.artistIds) ? guestListPayload.artistIds : []);
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "Unable to log out.");
    } finally {
      setAuthPending(false);
    }
  }

  if (loading) {
    return <div className="statusScreen">Loading lineup poster…</div>;
  }

  return (
    <div className={`appShell ${activePage}`}>
      <nav className="siteNav">
        <button className={`siteNavButton ${activePage === "coachella" ? "active" : ""}`} type="button" onClick={() => {
          window.location.hash = "coachella";
          setActivePage("coachella");
        }}>
          Main Lineup
        </button>
        <button className={`siteNavButton ${activePage === "dolab" ? "active" : ""}`} type="button" onClick={() => {
          window.location.hash = "dolab";
          setActivePage("dolab");
        }}>
          Do LaB
        </button>
        <button className={`siteNavButton ${activePage === "quasar" ? "active" : ""}`} type="button" onClick={() => {
          window.location.hash = "quasar";
          setActivePage("quasar");
          setActiveQuasarWeekend("weekend1");
        }}>
          Quasar
        </button>
        <button className={`siteNavButton ${activePage === "my-list" ? "active" : ""}`} type="button" onClick={() => {
          window.location.hash = "my-list";
          setActivePage("my-list");
        }}>
          My List
        </button>
        <AuthMenu
          authUser={authUser}
          authEmail={authEmail}
          authPassword={authPassword}
          authPending={authPending}
          authMenuOpen={authMenuOpen}
          onToggleMenu={() => setAuthMenuOpen((current) => !current)}
          onEmailChange={setAuthEmail}
          onPasswordChange={setAuthPassword}
          onSubmit={handleAuthSubmit}
          onLogout={handleLogout}
        />
      </nav>
      {error ? <div className="errorBanner">{error}</div> : null}

      {activePage === "dolab" ? (
        <DoLabPage
          artists={dolabArtists}
          selectedArtistId={selectedDolabArtistId}
          onSelect={handleSelectArtist(setSelectedDolabArtistId)}
          savedArtistIds={savedArtistIds}
          onToggleSavedArtist={handleToggleSavedArtist}
        />
      ) : activePage === "quasar" ? (
        <QuasarPage
          artists={quasarArtists}
          selectedArtistId={selectedQuasarArtistId}
          onSelect={handleSelectArtist(setSelectedQuasarArtistId)}
          activeWeekend={activeQuasarWeekend}
          savedArtistIds={savedArtistIds}
          onToggleSavedArtist={handleToggleSavedArtist}
          onWeekendChange={(weekend) => {
            setActiveQuasarWeekend(weekend);
            setSelectedQuasarArtistId("");
          }}
        />
      ) : activePage === "my-list" ? (
        <MyListPage
          coachellaArtists={coachellaArtists}
          dolabArtists={dolabArtists}
          quasarArtists={quasarArtists}
          selectedArtistIds={savedArtistIds}
          onToggleArtist={handleToggleSavedArtist}
          selectedArtistId={selectedMyListArtistId}
          onSelect={handleSelectArtist(setSelectedMyListArtistId)}
        />
      ) : (
        <CoachellaPage
          artists={coachellaArtists}
          selectedArtistId={selectedCoachellaArtistId}
          onSelect={handleSelectArtist(setSelectedCoachellaArtistId)}
          savedArtistIds={savedArtistIds}
          onToggleSavedArtist={handleToggleSavedArtist}
        />
      )}
    </div>
  );
}
