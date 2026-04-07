import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import {
  DAY_ORDER,
  DOLAB_ROW_PATTERNS,
  MY_LIST_STORAGE_KEY,
  QUASAR_DAY_ORDER,
  USER_ID_STORAGE_KEY,
  normalizeLookupValue,
} from "./lib/lineupData";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const PLAYLIST_STORAGE_KEY = "coachella-playlist";

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

const STAGE_ORDER = [
  "Coachella Stage",
  "Outdoor Theater",
  "Sahara",
  "Mojave",
  "Gobi",
  "Sonora",
  "Yuma",
  "Quasar",
  "Heineken House",
];

const STAGE_COLORS = {
  "Coachella Stage": "#c9a84c",
  "Outdoor Theater": "#5ab4e0",
  "Sahara":          "#e07a3a",
  "Mojave":          "#3aada3",
  "Gobi":            "#9e7ec8",
  "Sonora":          "#d4608a",
  "Yuma":            "#3aad6f",
  "Quasar":          "#d4895a",
  "Heineken House":  "#4a9e5c",
};

const PX_PER_MIN = 2;

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

function TrackSection({ label, tracks, compact = false, onAddSong, isInPlaylist }) {
  return (
    <div className="trackSection">
      <p className="trackSectionLabel">{label}</p>
      <div className={`trackGridScroller ${compact ? "compact" : ""}`}>
        <div className="trackGrid">
          {tracks.length > 0 ? (
            <ol start={1}>
              {tracks.map((track) => (
                <li key={track}>
                  <span className="trackName">{track}</span>
                  {onAddSong ? (
                    <button
                      className={`songAddButton${isInPlaylist && isInPlaylist(track) ? " added" : ""}`}
                      type="button"
                      onClick={() => onAddSong(track)}
                      aria-label={isInPlaylist && isInPlaylist(track) ? "Remove from playlist" : "Add to playlist"}
                    >
                      {isInPlaylist && isInPlaylist(track) ? "✓" : "+"}
                    </button>
                  ) : null}
                </li>
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

function StagesMenu({ activePage, onNavigate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const isActive = ["dolab", "quasar"].includes(activePage);

  useEffect(() => {
    function handler(e) {
      if (!ref.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function navigate(page) {
    setOpen(false);
    onNavigate(page);
  }

  return (
    <div className="stagesMenu" ref={ref}>
      <button
        className={`siteNavButton${isActive ? " active" : ""}`}
        type="button"
        onClick={() => setOpen((o) => !o)}
      >
        Stages ▾
      </button>
      {open && (
        <ul className="stagesDropdown">
          <li>
            <button
              className={`stagesOption${activePage === "dolab" ? " active" : ""}`}
              type="button"
              onClick={() => navigate("dolab")}
            >
              Do LaB
            </button>
          </li>
          <li>
            <button
              className={`stagesOption${activePage === "quasar" ? " active" : ""}`}
              type="button"
              onClick={() => navigate("quasar")}
            >
              Quasar
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

function AuthMenu({
  authUser,
  authEmail,
  authPassword,
  authConfirmPassword,
  authPending,
  authMode,
  onSetMode,
  onEmailChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onLoginSubmit,
  onSignupSubmit,
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
          <div className="authNavButtons">
            <button
              className="authSecondaryButton compact"
              type="button"
              onClick={() => onSetMode(authMode === "login" ? null : "login")}
              disabled={authPending}
            >
              Sign In
            </button>
            <button
              className="authSecondaryButton compact"
              type="button"
              onClick={() => onSetMode(authMode === "signup" ? null : "signup")}
              disabled={authPending}
            >
              Create Account
            </button>
          </div>
          {authMode ? (
            <div className="authPopover">
              <div className="authModeTabs">
                <button
                  type="button"
                  className={`authModeButton${authMode === "login" ? " active" : ""}`}
                  onClick={() => onSetMode("login")}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  className={`authModeButton${authMode === "signup" ? " active" : ""}`}
                  onClick={() => onSetMode("signup")}
                >
                  Create Account
                </button>
              </div>
              {authMode === "login" ? (
                <form onSubmit={onLoginSubmit} style={{ display: "contents" }}>
                  <label className="authField">
                    <span>Email</span>
                    <input type="email" value={authEmail} onChange={(e) => onEmailChange(e.target.value)} autoComplete="email" required />
                  </label>
                  <label className="authField">
                    <span>Password</span>
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(e) => onPasswordChange(e.target.value)}
                      autoComplete="current-password"
                      minLength={8}
                      required
                    />
                  </label>
                  <button className="authPrimaryButton compact" type="submit" disabled={authPending}>
                    {authPending ? "Signing In..." : "Sign In"}
                  </button>
                </form>
              ) : (
                <form onSubmit={onSignupSubmit} style={{ display: "contents" }}>
                  <label className="authField">
                    <span>Email</span>
                    <input type="email" value={authEmail} onChange={(e) => onEmailChange(e.target.value)} autoComplete="email" required />
                  </label>
                  <label className="authField">
                    <span>Password</span>
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(e) => onPasswordChange(e.target.value)}
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                  </label>
                  <label className="authField">
                    <span>Confirm Password</span>
                    <input
                      type="password"
                      value={authConfirmPassword}
                      onChange={(e) => onConfirmPasswordChange(e.target.value)}
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                  </label>
                  <button className="authPrimaryButton compact" type="submit" disabled={authPending}>
                    {authPending ? "Creating Account..." : "Create Account"}
                  </button>
                </form>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function CoachellaArtistPanel({ artist, artistLookup, onRelatedArtistSelect, isSaved, onToggleSave, onAddSong, isSongInPlaylist }) {
  const relatedArtists = artist.relatedArtistsList.map((name) => ({
    name,
    targetArtist: artistLookup.get(name) ?? null,
  }));

  return (
    <article className="artistPanel">
      <div className={`artistPanelLayout ${artist.imageUrl ? "hasImage" : ""}`}>
        {artist.imageUrl ? (
          <div className="artistImageColumn">
            <img className="artistImage" src={artist.imageUrl} alt={artist.artist} />
          </div>
        ) : null}
        <div className="artistPanelMain">
          <div className="artistPanelHeader">
            <div>
              <p className="panelEyebrow">{artist.day.toUpperCase()}</p>
              <h3>{artist.artist}</h3>
              <p className="panelGenre">{artist.genre || "Genre TBD"}</p>
            </div>
            <div className="panelMeta">
              <SaveActionButton isSaved={isSaved} onToggleSave={onToggleSave} />
              {artist.spotify_url?.startsWith("https://open.spotify.com/") ? (
                <a href={artist.spotify_url} target="_blank" rel="noreferrer">
                  Open Spotify
                </a>
              ) : null}
            </div>
          </div>
          <p className="panelNote">{artist.note || "More artist notes coming soon."}</p>
          <div className="trackSectionsStackedScroller">
            <div className="trackSections single trackSectionsStacked">
              <TrackSection
                label="Popular Songs"
                tracks={artist.popularSongsList}
                compact
                onAddSong={onAddSong ? (songName) => onAddSong({ songName, artistName: artist.artist, artistId: artist.id, day: artist.day, type: "popular" }) : undefined}
                isInPlaylist={isSongInPlaylist ? (songName) => isSongInPlaylist(artist.id, songName) : undefined}
              />
              <TrackSection
                label="Setlist Songs"
                tracks={artist.songsList}
                compact
                onAddSong={onAddSong ? (songName) => onAddSong({ songName, artistName: artist.artist, artistId: artist.id, day: artist.day, type: "setlist" }) : undefined}
                isInPlaylist={isSongInPlaylist ? (songName) => isSongInPlaylist(artist.id, songName) : undefined}
              />
            </div>
          </div>
          {relatedArtists.length > 0 ? (
            <div className="relatedArtistsSection relatedArtistsSectionBottom">
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
          <p className="panelFootnote">Based on your CSV data. You can expand the fields later without changing the layout.</p>
        </div>
      </div>
    </article>
  );
}

function DoLabArtistPanel({ artist, isSaved, onToggleSave, onAddSong, isSongInPlaylist }) {
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
        <TrackSection
          label="Popular Songs"
          tracks={artist.popularSongsList}
          compact
          onAddSong={onAddSong ? (songName) => onAddSong({ songName, artistName: artist.artist, artistId: artist.id, day: "Do LaB", type: "popular" }) : undefined}
          isInPlaylist={isSongInPlaylist ? (songName) => isSongInPlaylist(artist.id, songName) : undefined}
        />
      </div>
    </article>
  );
}

function GenericArtistPanel({ artist, eyebrow, isSaved, onToggleSave, onAddSong, isSongInPlaylist }) {
  return (
    <article className={`artistPanel ${artist.festival === "dolab" ? "dolabPanel" : artist.festival === "quasar" ? "quasarPanel" : ""}`}>
      <div className={`artistPanelLayout ${artist.imageUrl ? "hasImage" : ""}`}>
        {artist.imageUrl ? (
          <div className="artistImageColumn">
            <img className="artistImage" src={artist.imageUrl} alt={artist.artist} />
          </div>
        ) : null}
        <div className="artistPanelMain">
          <div className="artistPanelHeader">
            <div>
              <p className={`panelEyebrow ${artist.festival === "dolab" ? "dolabEyebrow" : artist.festival === "quasar" ? "quasarEyebrow" : ""}`}>{eyebrow}</p>
              <h3>{artist.artist}</h3>
              <p className="panelGenre">{artist.genre || "Genre TBD"}</p>
            </div>
            <div className="panelMeta">
              <SaveActionButton isSaved={isSaved} onToggleSave={onToggleSave} />
              {artist.spotify_url?.startsWith("https://open.spotify.com/") ? (
                <a href={artist.spotify_url} target="_blank" rel="noreferrer">
                  Open Spotify
                </a>
              ) : null}
            </div>
          </div>
          <p className="panelNote">{artist.note || "Description coming soon."}</p>
          <div className="trackSections single">
            <TrackSection
              label="Popular Songs"
              tracks={artist.popularSongsList ?? artist.songsList ?? []}
              compact
              onAddSong={onAddSong ? (songName) => onAddSong({ songName, artistName: artist.artist, artistId: artist.id, day: artist.day ?? (artist.festival === "dolab" ? "Do LaB" : ""), type: "popular" }) : undefined}
              isInPlaylist={isSongInPlaylist ? (songName) => isSongInPlaylist(artist.id, songName) : undefined}
            />
          </div>
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

function CoachellaDaySection({ day, artists, selectedArtistId, onSelect, artistLookup, savedArtistIds, onToggleSavedArtist, onAddSong, isSongInPlaylist }) {
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
              onAddSong={onAddSong}
              isSongInPlaylist={isSongInPlaylist}
            />
          ) : null}
        </div>
      ))}
    </section>
  );
}

function CoachellaPoster({ artists, selectedArtistId, onSelect, artistLookup, savedArtistIds = [], onToggleSavedArtist = () => {}, onAddSong, isSongInPlaylist }) {
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
            onAddSong={onAddSong}
            isSongInPlaylist={isSongInPlaylist}
          />
        ) : null,
      )}
    </div>
  );
}

function DoLabPage({ artists, selectedArtistId, onSelect, savedArtistIds, onToggleSavedArtist, onAddSong, isSongInPlaylist }) {
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
                onAddSong={onAddSong}
                isSongInPlaylist={isSongInPlaylist}
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

function QuasarPage({ artists, selectedArtistId, onSelect, activeWeekend, onWeekendChange, savedArtistIds, onToggleSavedArtist, onAddSong, isSongInPlaylist }) {
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
                  onAddSong={onAddSong}
                  isSongInPlaylist={isSongInPlaylist}
                />
              ) : null}
            </div>
          );
        })}
      </section>
    </main>
  );
}

function CoachellaPage({ artists, selectedArtistId, onSelect, savedArtistIds, onToggleSavedArtist, onAddSong, isSongInPlaylist }) {
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
        onAddSong={onAddSong}
        isSongInPlaylist={isSongInPlaylist}
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

function SavedDaySection({ day, artists, selectedArtistId, onSelect, onAddSong, isSongInPlaylist }) {
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
              onAddSong={onAddSong}
              isSongInPlaylist={isSongInPlaylist}
            />
          ) : null}
        </div>
      ))}
    </section>
  );
}

function SavedDoLabSection({ artists, selectedArtistId, onSelect, onAddSong, isSongInPlaylist }) {
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
              onAddSong={onAddSong}
              isSongInPlaylist={isSongInPlaylist}
            />
          ) : null}
        </div>
      ))}
    </section>
  );
}

function MyListPage({ coachellaArtists, dolabArtists, quasarArtists, selectedArtistIds, onToggleArtist, selectedArtistId, onSelect, onAddSong, isSongInPlaylist }) {
  const mainRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
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

  const allArtistsLookup = useMemo(() => {
    const all = [...coachellaArtists, ...dolabArtists, ...quasarArtists];
    const map = new Map();
    all.forEach((a) => map.set(normalizeLookupValue(a.artist), a));
    all.forEach((a) => {
      (a.relatedArtistsList ?? []).forEach((name) => {
        const key = normalizeLookupValue(name);
        if (map.has(key)) return;
        const match = all.find((c) => {
          const cn = normalizeLookupValue(c.artist);
          return cn.startsWith(key) || key.startsWith(cn) || cn.includes(key);
        });
        if (match) map.set(key, match);
      });
    });
    return map;
  }, [coachellaArtists, dolabArtists, quasarArtists]);

  const perDayRankMap = useMemo(() => {
    const m = new Map();
    for (const day of DAY_ORDER) {
      [...coachellaArtists, ...quasarArtists]
        .filter((a) => a.day === day)
        .forEach((a, i) => m.set(a.id, i));
    }
    return m;
  }, [coachellaArtists, quasarArtists]);

  const suggestions = useMemo(() => {
    if (!selectedArtistIds.length) return [];
    const savedSet = new Set(selectedArtistIds);
    const all = [...coachellaArtists, ...dolabArtists, ...quasarArtists];
    const savedArtists = all.filter((a) => savedSet.has(a.id));
    const savedGenres = new Set(
      savedArtists.map((a) => normalizeLookupValue(a.genre ?? "")).filter(Boolean),
    );
    const scores = new Map();

    for (const saved of savedArtists) {
      for (const name of (saved.relatedArtistsList ?? [])) {
        const match = allArtistsLookup.get(normalizeLookupValue(name));
        if (!match || savedSet.has(match.id)) continue;
        const e = scores.get(match.id) ?? { artist: match, related: 0, genre: 0 };
        e.related++;
        scores.set(match.id, e);
      }
    }
    for (const candidate of all) {
      if (savedSet.has(candidate.id)) continue;
      const g = normalizeLookupValue(candidate.genre ?? "");
      if (g && savedGenres.has(g)) {
        const e = scores.get(candidate.id) ?? { artist: candidate, related: 0, genre: 0 };
        e.genre++;
        scores.set(candidate.id, e);
      }
    }

    return [...scores.values()]
      .sort((a, b) => {
        const diff = (b.related * 2 + b.genre) - (a.related * 2 + a.genre);
        if (diff !== 0) return diff;
        return (perDayRankMap.get(a.artist.id) ?? a.artist.lineupRank ?? 999)
             - (perDayRankMap.get(b.artist.id) ?? b.artist.lineupRank ?? 999);
      })
      .slice(0, 8);
  }, [selectedArtistIds, coachellaArtists, dolabArtists, quasarArtists, allArtistsLookup, perDayRankMap]);

  async function handleDownload() {
    if (!mainRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(mainRef.current, {
        filter: (node) => !node.classList?.contains("noCapture"),
        pixelRatio: 2,
        style: {
          background:
            "radial-gradient(circle at 82% 14%, rgba(255,255,255,0.24), transparent 8%), " +
            "linear-gradient(180deg, #0f7085 0%, #135f5f 52%, #291302 100%)",
        },
      });
      const link = document.createElement("a");
      link.download = "my-coachella-lineup.png";
      link.href = dataUrl;
      link.click();
    } finally {
      setDownloading(false);
    }
  }

  return (
    <main className="posterShell myListShell" ref={mainRef}>
      <div className="skyGlow" />
      <div className="horizon" />
      <header className="posterHeader myListHeader">
        <p>GOLDENVOICE PRESENTS IN INDIO</p>
        <h1>MY LINEUP</h1>
        <h2>PERSONAL COACHELLA LINEUP</h2>
        <div className="locationRow">
          <span>INDIO</span>
          <span>CALIFORNIA</span>
          <span>EMPIRE POLO CLUB</span>
        </div>
        <p className="instruction">Artists keep their original lineup priority. Quasar and Do LaB appear after main lineup picks.</p>
        <button
          className="downloadButton noCapture"
          type="button"
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? "Generating…" : "Download Image"}
        </button>
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
                  onAddSong={onAddSong}
                  isSongInPlaylist={isSongInPlaylist}
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
                onAddSong={onAddSong}
                isSongInPlaylist={isSongInPlaylist}
              />
            ) : null}
          </>
        )}
      </section>

      {suggestions.length > 0 && (
        <section className="suggestionsShell noCapture">
          <h2 className="suggestionsTitle">Suggested for You</h2>
          <div className="suggestionsList">
            {suggestions.map(({ artist }) => (
              <div key={artist.id} className="suggestionCard">
                <div className="suggestionInfo">
                  <span className="suggestionName">{artist.artist}</span>
                  {artist.genre ? <span className="suggestionGenre">{artist.genre}</span> : null}
                </div>
                <button
                  className="suggestionAddButton"
                  type="button"
                  onClick={() => onToggleArtist(artist.id)}
                >
                  +
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function splitStageName(name) {
  const words = name.split(" ");
  if (words.length > 1) {
    return { main: words.slice(0, -1).join(" ").toUpperCase(), sub: words[words.length - 1].toLowerCase() };
  }
  return { main: name.toUpperCase(), sub: null };
}

function ScheduleGrid({ sets, activeDay, activeWeekend, normalizedLookup, quasarW2ByDay, selectedArtistId, onSelectArtist, savedArtistIds = [] }) {
  const daySets = sets.filter((s) => s.day === activeDay);
  if (daySets.length === 0) return <p className="scheduleEmpty">No set times available.</p>;

  const dayMin = Math.min(...daySets.map((s) => s.startMinutes));
  const dayMax = Math.max(...daySets.map((s) => s.endMinutes));
  const totalHeight = (dayMax - dayMin) * PX_PER_MIN;

  const byStage = {};
  STAGE_ORDER.forEach((stage) => {
    byStage[stage] = daySets.filter((s) => s.stage === stage).sort((a, b) => a.startMinutes - b.startMinutes);
  });
  const activeStages = STAGE_ORDER.filter((stage) => byStage[stage].length > 0);

  // Hour marks — time runs top=latest, bottom=earliest
  const hourMarks = [];
  const startHour = Math.ceil(dayMin / 60);
  const endHour = Math.floor(dayMax / 60);
  for (let h = endHour; h >= startHour; h--) {
    const topPx = (dayMax - h * 60) * PX_PER_MIN;
    const raw = h >= 24 ? h - 24 : h;
    const display = raw === 0 ? 12 : raw > 12 ? raw - 12 : raw;
    const period = h >= 12 && h < 24 ? "PM" : "AM";
    hourMarks.push({ label: String(display), period, topPx, h });
  }

  const headerMirrorRef = useRef(null);
  const bodyScrollRef = useRef(null);

  function syncHeaderScroll(e) {
    if (headerMirrorRef.current) {
      headerMirrorRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  }

  const stageHeaderCells = (
    <>
      <div className="scheduleTimeCorner" />
      {activeStages.map((stage) => {
        const { main, sub } = splitStageName(stage);
        return (
          <div key={stage} className="scheduleStageHeader">
            <span className="scheduleStageMain">{main}</span>
            {sub ? <span className="scheduleStageSubtitle">{sub}</span> : null}
          </div>
        );
      })}
    </>
  );

  return (
    <div className="scheduleGridOuter">
      {/* Sticky header — outside overflow-x container so sticky works correctly */}
      <div className="scheduleGridHeaderScroll" ref={headerMirrorRef}>
        <div className="scheduleGridHeader">
          {stageHeaderCells}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="scheduleGridWrapper" ref={bodyScrollRef} onScroll={syncHeaderScroll}>
        <div className="scheduleGridContainer">
        {/* Grid body */}
        <div className="scheduleGridBody">
          {/* Time label column */}
          <div className="scheduleTimeCol" style={{ height: totalHeight }}>
            {hourMarks.map(({ label, period, topPx }) => (
              <div key={`${label}${period}`} className="scheduleHourLabel" style={{ top: topPx }}>
                <span className="scheduleHourNum">{label}</span>
                <span className="scheduleHourPeriod">{period}</span>
              </div>
            ))}
          </div>

          {/* Stage columns */}
          {activeStages.map((stage) => (
            <div key={stage} className="scheduleStageCol" style={{ height: totalHeight }}>
              {/* Horizontal hour gridlines */}
              {hourMarks.map(({ topPx, label, period }) => (
                <div key={`${label}${period}`} className="scheduleHourLine" style={{ top: topPx }} />
              ))}

              {/* Artist blocks */}
              {byStage[stage].map((set, i) => {
                // Flipped axis: later = higher up = smaller top
                const topPx = (dayMax - set.endMinutes) * PX_PER_MIN;
                const heightPx = Math.max((set.endMinutes - set.startMinutes) * PX_PER_MIN - 2, 20);

                const isQuasarHeadlinerSlot = stage === "Quasar" && i === byStage[stage].length - 1;
                const effectiveArtist =
                  stage === "Quasar" && activeWeekend === "weekend2"
                    ? (isQuasarHeadlinerSlot ? quasarW2ByDay.get(activeDay) ?? null : null)
                    : normalizedLookup.get(normalizeLookupValue(set.artist)) ?? null;

                const displayName =
                  isQuasarHeadlinerSlot && activeWeekend === "weekend2" && effectiveArtist
                    ? effectiveArtist.artist
                    : set.artist;

                const isSelected = effectiveArtist && selectedArtistId === effectiveArtist.id;
                const isSaved = effectiveArtist && savedArtistIds.includes(effectiveArtist.id);

                if (effectiveArtist) {
                  return (
                    <button
                      key={`${set.artist}-${i}`}
                      id={`sched-${effectiveArtist.id}`}
                      className={`scheduleBlock matched${isSelected ? " active" : ""}${isSaved ? " saved" : ""}`}
                      style={{ top: topPx, height: heightPx }}
                      type="button"
                      onClick={(e) => onSelectArtist(effectiveArtist.id, e.currentTarget.getBoundingClientRect())}
                    >
                      <span className="scheduleBlockName">{displayName}</span>
                      <span className="scheduleBlockTime">{set.startTime}</span>
                    </button>
                  );
                }
                return (
                  <div
                    key={`${set.artist}-${i}`}
                    className="scheduleBlock unmatched"
                    style={{ top: topPx, height: heightPx }}
                  >
                    <span className="scheduleBlockName">{displayName}</span>
                    <span className="scheduleBlockTime">{set.startTime}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        </div>
      </div>
    </div>
  );
}

function SchedulePage({
  sets, activeDay, onDayChange, activeWeekend, onWeekendChange,
  selectedArtistId, onSelectArtist, coachellaArtists, quasarArtists, savedArtistIds, onToggleSave,
  onAddSong, isSongInPlaylist,
}) {
  // Combined lookup: coachella + quasar artists by normalized name
  const normalizedLookup = useMemo(() => {
    const map = new Map();
    coachellaArtists.forEach((a) => map.set(normalizeLookupValue(a.artist), a));
    quasarArtists.forEach((a) => map.set(normalizeLookupValue(a.artist), a));
    return map;
  }, [coachellaArtists, quasarArtists]);

  // Full artist lookup for related-artist links in the panel
  const artistLookup = useMemo(() => {
    const lookup = new Map();
    const normalizedFull = new Map();
    coachellaArtists.forEach((a) => {
      lookup.set(a.artist, a);
      normalizedFull.set(normalizeLookupValue(a.artist), a);
    });
    coachellaArtists.forEach((a) => {
      a.relatedArtistsList.forEach((name) => {
        if (lookup.has(name)) return;
        const match = normalizedFull.get(normalizeLookupValue(name));
        if (match) lookup.set(name, match);
      });
    });
    return lookup;
  }, [coachellaArtists]);

  // W2 Quasar artists keyed by day for the grid substitution
  const quasarW2ByDay = useMemo(() => {
    const map = new Map();
    quasarArtists.filter((a) => a.weekend === "weekend2").forEach((a) => map.set(a.day, a));
    return map;
  }, [quasarArtists]);

  // Find selected artist across both pools
  const selectedArtist = useMemo(
    () => coachellaArtists.find((a) => a.id === selectedArtistId) ?? quasarArtists.find((a) => a.id === selectedArtistId) ?? null,
    [coachellaArtists, quasarArtists, selectedArtistId],
  );

  const days = ["Friday", "Saturday", "Sunday"];
  const dayLabels =
    activeWeekend === "weekend1"
      ? { Friday: "FRI APR 10", Saturday: "SAT APR 11", Sunday: "SUN APR 12" }
      : { Friday: "FRI APR 17", Saturday: "SAT APR 18", Sunday: "SUN APR 19" };

  function clearSelection() {
    onSelectArtist("");
  }

  function handleGridSelect(id) {
    if (selectedArtistId === id) {
      clearSelection();
    } else {
      onSelectArtist(id);
    }
  }

  const artistPanel = selectedArtist ? (
    <>
      <div className="schedulePanelBackdrop" onClick={clearSelection} />
      <div className="schedulePanel">
        <button className="schedulePanelClose" type="button" onClick={clearSelection} aria-label="Close">✕</button>
        {selectedArtist.festival === "quasar" ? (
          <GenericArtistPanel
            artist={selectedArtist}
            eyebrow={activeWeekend === "weekend1" ? "QUASAR WEEKEND 1" : "QUASAR WEEKEND 2"}
            isSaved={savedArtistIds.includes(selectedArtist.id)}
            onToggleSave={() => onToggleSave(selectedArtist.id)}
            onAddSong={onAddSong}
            isSongInPlaylist={isSongInPlaylist}
          />
        ) : (
          <CoachellaArtistPanel
            artist={selectedArtist}
            artistLookup={artistLookup}
            onRelatedArtistSelect={(id) => onSelectArtist(id)}
            isSaved={savedArtistIds.includes(selectedArtist.id)}
            onToggleSave={() => onToggleSave(selectedArtist.id)}
            onAddSong={onAddSong}
            isSongInPlaylist={isSongInPlaylist}
          />
        )}
      </div>
    </>
  ) : null;

  return (
    <main className={`scheduleShell day-${activeDay.toLowerCase()}`}>
      <header className="scheduleHeader">
        <div className="scheduleHeaderMeta">
          <span className="scheduleHeaderLabel">COACHELLA</span>
          <span className="scheduleWeekendTag">{activeWeekend === "weekend1" ? "weekend one" : "weekend two"}</span>
        </div>
        <h1 className="scheduleDayTitle">{activeDay.toLowerCase()}</h1>
      </header>
      <div className="scheduleWeekendNav">
        <button
          className={`scheduleWeekendButton${activeWeekend === "weekend1" ? " active" : ""}`}
          type="button"
          onClick={() => { onWeekendChange("weekend1"); clearSelection(); }}
        >
          Weekend 1
        </button>
        <button
          className={`scheduleWeekendButton${activeWeekend === "weekend2" ? " active" : ""}`}
          type="button"
          onClick={() => { onWeekendChange("weekend2"); clearSelection(); }}
        >
          Weekend 2
        </button>
      </div>
      <nav className="scheduleDayNav">
        {days.map((day) => (
          <button
            key={day}
            className={`scheduleDayButton${activeDay === day ? " active" : ""}`}
            type="button"
            onClick={() => { onDayChange(day); clearSelection(); }}
          >
            {dayLabels[day]}
          </button>
        ))}
      </nav>
      <p className="scheduleDisclaimer">
        Set times have not been officially announced — times shown are estimates. We'll keep updating this page as official information becomes available.
      </p>
      {artistPanel}
      <ScheduleGrid
        sets={sets}
        activeDay={activeDay}
        activeWeekend={activeWeekend}
        normalizedLookup={normalizedLookup}
        quasarW2ByDay={quasarW2ByDay}
        selectedArtistId={selectedArtistId}
        onSelectArtist={handleGridSelect}
        savedArtistIds={savedArtistIds}
      />
      <p className="scheduleGatesLabel">GATES OPEN AT ONE</p>
    </main>
  );
}

function PlaylistPage({ playlistSongs, onToggleSong, guestUserId, authUser }) {
  function handleExport() {
    const base = API_BASE_URL || "";
    const url = authUser
      ? `${base}/api/playlist/export.csv`
      : `${base}/api/playlist/export.csv?userId=${encodeURIComponent(guestUserId)}`;
    window.location.href = url;
  }

  return (
    <main className="playlistShell">
      <div className="skyGlow" />
      <div className="horizon" />
      <header className="posterHeader playlistHeader">
        <p>GOLDENVOICE PRESENTS IN INDIO</p>
        <h1>MY PLAYLIST</h1>
        <h2>COACHELLA 2026</h2>
        <div className="locationRow">
          <span>{playlistSongs.length} {playlistSongs.length === 1 ? "song" : "songs"}</span>
        </div>
      </header>

      <section className="playlistBody">
        {playlistSongs.length === 0 ? (
          <p className="playlistEmpty">No songs added yet — hit + next to any song to start building your playlist.</p>
        ) : (
          <>
            <div className="playlistActions">
              <button className="playlistExportButton" type="button" onClick={handleExport}>
                Export CSV
              </button>
            </div>
            <div className="playlistSongList">
              <div className="playlistTableHeader">
                <span>SONG</span>
                <span>ARTIST</span>
              </div>
              {playlistSongs.map((song) => (
                <div key={`${song.artistId}::${song.songName}`} className="playlistSongRow">
                  <span className="playlistSongName">{song.songName}</span>
                  <span className="playlistArtistCol">{song.artistName}</span>
                  <button
                    className="playlistRemoveButton"
                    type="button"
                    onClick={() => onToggleSong(song)}
                    aria-label={`Remove ${song.songName}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function getInitialPage() {
  const hash = window.location.hash.replace("#", "");
  if (hash === "dolab" || hash === "quasar" || hash === "my-list" || hash === "schedule" || hash === "playlist") {
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

    const array = new Uint32Array(3);
    crypto.getRandomValues(array);
    const nextId = `guest_${Array.from(array).map((n) => n.toString(36)).join("")}`;
    window.localStorage.setItem(USER_ID_STORAGE_KEY, nextId);
    return nextId;
  } catch {
    const array = new Uint32Array(3);
    crypto.getRandomValues(array);
    return `guest_${Array.from(array).map((n) => n.toString(36)).join("")}`;
  }
}

async function requestJson(url, options = {}) {
  const requestUrl = url.startsWith("http://") || url.startsWith("https://") ? url : `${API_BASE_URL}${url}`;
  const response = await fetch(requestUrl, {
    credentials: "include",
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(payload.error || "Request failed.");
    err.status = response.status;
    throw err;
  }

  return payload;
}

export default function App() {
  const [activePage, setActivePage] = useState(getInitialPage);
  const [setTimesData, setSetTimesData] = useState([]);
  const [activeScheduleDay, setActiveScheduleDay] = useState("Friday");
  const [activeScheduleWeekend, setActiveScheduleWeekend] = useState("weekend1");
  const [selectedScheduleArtistId, setSelectedScheduleArtistId] = useState("");
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
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [authPending, setAuthPending] = useState(false);
  const [authMode, setAuthMode] = useState(null);
  const [savedArtistIds, setSavedArtistIds] = useState(() => {
    try {
      const stored = window.localStorage.getItem(MY_LIST_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [playlistSongs, setPlaylistSongs] = useState(() => {
    try {
      const stored = window.localStorage.getItem(PLAYLIST_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingScrollId, setPendingScrollId] = useState(null);
  const searchContainerRef = useRef(null);

  useEffect(() => {
    function syncPageFromHash() {
      setActivePage(getInitialPage());
    }

    window.addEventListener("hashchange", syncPageFromHash);
    return () => window.removeEventListener("hashchange", syncPageFromHash);
  }, []);

  useEffect(() => {
    setSearchQuery("");
  }, [activePage]);

  useEffect(() => {
    window.localStorage.setItem(MY_LIST_STORAGE_KEY, JSON.stringify(savedArtistIds));
  }, [savedArtistIds]);

  useEffect(() => {
    window.localStorage.setItem(PLAYLIST_STORAGE_KEY, JSON.stringify(playlistSongs));
  }, [playlistSongs]);

  const searchResults = useMemo(() => {
    const q = normalizeLookupValue(searchQuery);
    if (!q) return [];

    // lineupRank is a flat CSV index (Friday→Saturday→Sunday), so a small Friday
    // act has a lower rank than the Sunday headliner. Recompute rank within each
    // day so all headliners are rank 0 regardless of day.
    const perDayRank = new Map();
    for (const day of DAY_ORDER) {
      [...coachellaArtists, ...quasarArtists]
        .filter((a) => a.day === day)
        .forEach((a, i) => perDayRank.set(a.id, i));
    }
    function effectiveRank(a) {
      return perDayRank.has(a.id) ? perDayRank.get(a.id) : (a.lineupRank ?? Infinity);
    }

    return [
      ...coachellaArtists,
      ...dolabArtists,
      ...quasarArtists,
    ]
      .filter((a) => normalizeLookupValue(a.artist).includes(q) || normalizeLookupValue(a.genre ?? "").includes(q))
      .sort((a, b) => effectiveRank(a) - effectiveRank(b))
      .slice(0, 10);
  }, [searchQuery, coachellaArtists, dolabArtists, quasarArtists]);

  useEffect(() => {
    if (!pendingScrollId) return;
    document.getElementById(`artist-${pendingScrollId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    setPendingScrollId(null);
  }, [pendingScrollId]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (!searchContainerRef.current?.contains(e.target)) {
        setSearchQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        const [payload, authPayload, setTimesPayload] = await Promise.all([
          requestJson("/api/lineups"),
          requestJson("/api/auth/me"),
          requestJson("/api/set-times"),
        ]);
        const nextCoachellaArtists = Array.isArray(payload.coachella) ? payload.coachella : [];
        const nextDolabArtists = Array.isArray(payload.dolab) ? payload.dolab : [];
        const nextQuasarArtists = Array.isArray(payload.quasar) ? payload.quasar : [];
        const nextAuthUser = authPayload.user ?? null;
        const [myListPayload, playlistPayload] = await Promise.all([
          requestJson(nextAuthUser ? "/api/my-list" : `/api/my-list?userId=${encodeURIComponent(guestUserId)}`),
          requestJson(nextAuthUser ? "/api/playlist" : `/api/playlist?userId=${encodeURIComponent(guestUserId)}`),
        ]);
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
        setPlaylistSongs(Array.isArray(playlistPayload.songs) ? playlistPayload.songs : []);
        setSetTimesData(Array.isArray(setTimesPayload.sets) ? setTimesPayload.sets : []);

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
      // If logged in but the server doesn't recognize the session, clear auth state
      // so the user gets a clear prompt to sign in again instead of a cryptic error.
      if (authUser && saveError instanceof Error && saveError.status === 400) {
        setAuthUser(null);
        setError("Your session has expired. Please sign in again.");
      } else {
        setError(saveError instanceof Error ? saveError.message : "Unable to save your list.");
      }
    }
  }

  function handleSearchSelect(artist) {
    setSearchQuery("");
    if (artist.festival === "coachella") {
      window.location.hash = "coachella";
      setActivePage("coachella");
      setSelectedCoachellaArtistId(artist.id);
    } else if (artist.festival === "dolab") {
      window.location.hash = "dolab";
      setActivePage("dolab");
      setSelectedDolabArtistId(artist.id);
    } else if (artist.festival === "quasar") {
      window.location.hash = "quasar";
      setActivePage("quasar");
      setActiveQuasarWeekend(artist.weekend);
      setSelectedQuasarArtistId(artist.id);
    }
    setPendingScrollId(artist.id);
  }

  function isSongInPlaylist(artistId, songName) {
    const key = `${artistId}::${songName}`;
    return playlistSongs.some((s) => `${s.artistId}::${s.songName}` === key);
  }

  async function handleTogglePlaylistSong(song) {
    const key = `${song.artistId}::${song.songName}`;
    const alreadyIn = playlistSongs.some((s) => `${s.artistId}::${s.songName}` === key);
    const nextSongs = alreadyIn
      ? playlistSongs.filter((s) => `${s.artistId}::${s.songName}` !== key)
      : [...playlistSongs, song];

    setPlaylistSongs(nextSongs);

    try {
      const payload = await requestJson(
        authUser ? "/api/playlist" : `/api/playlist?userId=${encodeURIComponent(guestUserId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ songs: nextSongs }),
        },
      );
      setPlaylistSongs(Array.isArray(payload.songs) ? payload.songs : []);
    } catch {
      setPlaylistSongs(playlistSongs);
    }
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    setAuthPending(true);
    setError("");

    try {
      const payload = await requestJson("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail, password: authPassword, guestUserId }),
      });

      setAuthUser(payload.user ?? null);
      setAuthPassword("");
      setAuthMode(null);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Unable to sign in.");
      setAuthPending(false);
      return;
    }

    try {
      const myListPayload = await requestJson("/api/my-list");
      setSavedArtistIds(Array.isArray(myListPayload.artistIds) ? myListPayload.artistIds : []);
    } catch {
      // Non-critical — user is signed in; list will reload on next page refresh.
    } finally {
      setAuthPending(false);
    }
  }

  async function handleSignupSubmit(event) {
    event.preventDefault();
    if (authPassword !== authConfirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setAuthPending(true);
    setError("");

    try {
      const payload = await requestJson("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail, password: authPassword, guestUserId }),
      });

      setAuthUser(payload.user ?? null);
      setAuthPassword("");
      setAuthConfirmPassword("");
      setAuthMode(null);
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : "Unable to create account.");
      setAuthPending(false);
      return;
    }

    try {
      const myListPayload = await requestJson("/api/my-list");
      setSavedArtistIds(Array.isArray(myListPayload.artistIds) ? myListPayload.artistIds : []);
    } catch {
      // Non-critical
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
      setAuthEmail("");
      setAuthPassword("");
      setAuthConfirmPassword("");
      setAuthMode(null);
      setSavedArtistIds([]);
      setPlaylistSongs([]);
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
          Lineup
        </button>
        <StagesMenu
          activePage={activePage}
          onNavigate={(page) => {
            window.location.hash = page;
            setActivePage(page);
            if (page === "quasar") setActiveQuasarWeekend("weekend1");
          }}
        />
        <button className={`siteNavButton ${activePage === "my-list" ? "active" : ""}`} type="button" onClick={() => {
          window.location.hash = "my-list";
          setActivePage("my-list");
        }}>
          My List
        </button>
        <button className={`siteNavButton ${activePage === "schedule" ? "active" : ""}`} type="button" onClick={() => {
          window.location.hash = "schedule";
          setActivePage("schedule");
        }}>
          Schedule
        </button>
        <button className={`siteNavButton ${activePage === "playlist" ? "active" : ""}`} type="button" onClick={() => {
          window.location.hash = "playlist";
          setActivePage("playlist");
        }}>
          Playlist
        </button>
        <div className="searchBar" ref={searchContainerRef}>
          <input
            className="searchInput"
            type="search"
            placeholder="Search artists..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoComplete="off"
          />
          {searchResults.length > 0 && (
            <ul className="searchDropdown">
              {searchResults.map((artist) => (
                <li key={artist.id}>
                  <button
                    className="searchResultButton"
                    type="button"
                    onClick={() => handleSearchSelect(artist)}
                  >
                    <span className="searchResultName">
                      {artist.artist}
                      {artist.genre ? <span className="searchResultGenre">{artist.genre}</span> : null}
                    </span>
                    <span className="searchResultMeta">
                      {savedArtistIds.includes(artist.id) && (
                        <span className="searchResultSaved">✓</span>
                      )}
                      {artist.festival === "coachella"
                        ? artist.day
                        : artist.festival === "dolab"
                        ? "Do LaB"
                        : "Quasar"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <AuthMenu
          authUser={authUser}
          authEmail={authEmail}
          authPassword={authPassword}
          authConfirmPassword={authConfirmPassword}
          authPending={authPending}
          authMode={authMode}
          onSetMode={setAuthMode}
          onEmailChange={setAuthEmail}
          onPasswordChange={setAuthPassword}
          onConfirmPasswordChange={setAuthConfirmPassword}
          onLoginSubmit={handleLoginSubmit}
          onSignupSubmit={handleSignupSubmit}
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
          onAddSong={handleTogglePlaylistSong}
          isSongInPlaylist={isSongInPlaylist}
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
          onAddSong={handleTogglePlaylistSong}
          isSongInPlaylist={isSongInPlaylist}
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
          onAddSong={handleTogglePlaylistSong}
          isSongInPlaylist={isSongInPlaylist}
        />
      ) : activePage === "schedule" ? (
        <SchedulePage
          sets={setTimesData}
          activeDay={activeScheduleDay}
          onDayChange={setActiveScheduleDay}
          activeWeekend={activeScheduleWeekend}
          onWeekendChange={setActiveScheduleWeekend}
          selectedArtistId={selectedScheduleArtistId}
          onSelectArtist={setSelectedScheduleArtistId}
          coachellaArtists={coachellaArtists}
          quasarArtists={quasarArtists}
          savedArtistIds={savedArtistIds}
          onToggleSave={handleToggleSavedArtist}
          onAddSong={handleTogglePlaylistSong}
          isSongInPlaylist={isSongInPlaylist}
        />
      ) : activePage === "playlist" ? (
        <PlaylistPage
          playlistSongs={playlistSongs}
          onToggleSong={handleTogglePlaylistSong}
          guestUserId={guestUserId}
          authUser={authUser}
        />
      ) : (
        <CoachellaPage
          artists={coachellaArtists}
          selectedArtistId={selectedCoachellaArtistId}
          onSelect={handleSelectArtist(setSelectedCoachellaArtistId)}
          savedArtistIds={savedArtistIds}
          onToggleSavedArtist={handleToggleSavedArtist}
          onAddSong={handleTogglePlaylistSong}
          isSongInPlaylist={isSongInPlaylist}
        />
      )}
    </div>
  );
}
