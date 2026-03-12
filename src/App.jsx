import { useEffect, useMemo, useState } from "react";

const DAY_ORDER = ["Friday", "Saturday", "Sunday"];
const QUASAR_DAY_ORDER = ["Friday", "Saturday", "Sunday"];
const DOLAB_ROW_PATTERNS = [2, 1, 4, 4, 2, 5, 4, 5, 4, 4, 4, 3, 5, 3, 4];
const EXCLUDED_ARTISTS = new Set(["Anyma", "Josh Baker x Carlita", "DJ Snake"]);
const MY_LIST_STORAGE_KEY = "coachella-personal-list";
const DOLAB_WEEKEND_ONE_ARTISTS = new Set([
  "1TBSP",
  "ANDHIM",
  "ANDY C",
  "ANFISA LETYAGO",
  "BAALTI",
  "BABY J",
  "BRUNELLO",
  "BULLET TOOTH",
  "CINCITY",
  "DEER JADE",
  "EFFIN",
  "FIFI",
  "JACKIE HOLLANDER",
  "JIGITZ",
  "LUMIA",
  "MCR-T",
  "OMAR+",
  "OMNOM",
  "POOLSIDE'S DAYTIME DISCO",
  "RODDY LIMA",
  "SORAYA",
  "SOUL PURPOSE",
  "STARJUNK 95",
  "TINASHE (DJ SET)",
  "WHETHAN",
]);
const DOLAB_WEEKEND_TWO_ARTISTS = new Set([
  "ÆON:MODE B2B BLOSSOM",
  "AFTER MIDNIGHT (MATRODA x SAN PACHO)",
  "ALEX CHAPMAN B2B ZOE GITTER",
  "ALISHA",
  "APE DRUMS B2B BONTAN",
  "ARTHI",
  "THE BROTHERS MACKLOVITCH (A-TRAK & DAVE 1)",
  "CHAMPION",
  "CQUESTT",
  "DJ HABIBEATS B2B ZEEMUFFIN",
  "DRAMA DJ SET",
  "ELIZA ROSE",
  "GUDFELLA",
  "JAZZY",
  "LEVEL UP B2B MARY DROPPINZ",
  "LYNY",
  "MAXI MERAKI",
  "NATASCHA POLKÉ",
  "NEUMONIC",
  "PATRICIO",
  "SAM ALFRED",
  "SAM BINGA B2B JIALING",
  "SARZ",
  "SBTRKT",
  "SETH TROXLER",
  "SILVA BUMPA",
  "STRAWBRY",
  "TOURIST",
  "X CLUB.",
]);

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

function normalizeLookupValue(value = "") {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }

      row.push(current);
      current = "";

      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  const [header, ...body] = rows;

  return body.map((cells) =>
    header.reduce((entry, key, index) => {
      entry[key] = cells[index] ?? "";
      return entry;
    }, {}),
  );
}

function splitSongs(value = "", delimiter = "|") {
  return value
    .split(delimiter)
    .map((song) => song.trim())
    .filter(Boolean);
}

function normalizeCoachellaArtist(artist, index) {
  return {
    id: `${artist.day}-${artist.artist}-${index}`.toLowerCase(),
    festival: "coachella",
    lineupRank: index,
    ...artist,
    songsList: splitSongs(artist.songs),
    relatedArtistsList: splitSongs(artist.related_artists ?? "", ";"),
    popularSongsList: splitSongs(artist.spotify_top5_tracks ?? ""),
    imageUrl: artist.spotify_image_url ?? artist.image_url ?? "",
  };
}

function normalizeDolabArtist(artist, index) {
  const weekend = DOLAB_WEEKEND_ONE_ARTISTS.has(artist.artist)
    ? "weekend1"
    : DOLAB_WEEKEND_TWO_ARTISTS.has(artist.artist)
      ? "weekend2"
      : "";

  return {
    id: `dolab-${artist.artist}-${index}`.toLowerCase(),
    festival: "dolab",
    lineupRank: index,
    weekend,
    artist: artist.artist,
    genre: artist.genre,
    spotify_url: artist.spotify_url,
    note: artist.artist_description,
    popularSongsList: splitSongs(artist.spotify_top5_tracks ?? ""),
  };
}

function normalizeQuasarArtist(artist, index) {
  const weekend = artist.note.includes("Weekend 2") ? "weekend2" : "weekend1";

  return {
    id: `quasar-${weekend}-${artist.day}-${artist.artist}-${index}`.toLowerCase(),
    festival: "quasar",
    lineupRank: index,
    artist: artist.artist,
    day: artist.day,
    weekend,
    genre: artist.genre,
    spotify_url: artist.spotify_url,
    note: artist.artist_description || artist.note,
    imageUrl: artist.spotify_image_url ?? "",
    popularSongsList: splitSongs(artist.spotify_top5_tracks ?? ""),
  };
}

function sanitizeCoachellaArtists(artists) {
  const seenArtists = new Set();

  return artists.filter((artist) => {
    if (EXCLUDED_ARTISTS.has(artist.artist)) {
      return false;
    }

    const normalizedArtist = normalizeLookupValue(artist.artist);
    if (seenArtists.has(normalizedArtist)) {
      return false;
    }

    seenArtists.add(normalizedArtist);
    return true;
  });
}

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
        const [coachellaResponse, dolabResponse, quasarResponse] = await Promise.all([
          fetch("/coachella-2026-data.csv"),
          fetch("/dolab-2026-data.csv"),
          fetch("/quasar-2026-data.csv"),
        ]);

        if (!coachellaResponse.ok || !dolabResponse.ok || !quasarResponse.ok) {
          throw new Error("Failed to load lineup data.");
        }

        const [coachellaText, dolabText, quasarText] = await Promise.all([
          coachellaResponse.text(),
          dolabResponse.text(),
          quasarResponse.text(),
        ]);

        const nextCoachellaArtists = sanitizeCoachellaArtists(
          parseCsv(coachellaText)
            .filter((entry) => DAY_ORDER.includes(entry.day))
            .map(normalizeCoachellaArtist),
        );
        const nextDolabArtists = parseCsv(dolabText).map(normalizeDolabArtist);
        const nextQuasarArtists = parseCsv(quasarText).map(normalizeQuasarArtist);

        if (!active) return;

        setCoachellaArtists(nextCoachellaArtists);
        setDolabArtists(nextDolabArtists);
        setQuasarArtists(nextQuasarArtists);
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
  }, []);

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

  function handleToggleSavedArtist(artistId) {
    setSavedArtistIds((current) => (current.includes(artistId) ? current.filter((id) => id !== artistId) : [...current, artistId]));
  }

  if (loading) {
    return <div className="statusScreen">Loading lineup poster…</div>;
  }

  if (error) {
    return <div className="statusScreen">Error: {error}</div>;
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
      </nav>

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
