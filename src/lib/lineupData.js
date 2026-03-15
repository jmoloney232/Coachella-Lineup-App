export const DAY_ORDER = ["Friday", "Saturday", "Sunday"];
export const QUASAR_DAY_ORDER = ["Friday", "Saturday", "Sunday"];
export const DOLAB_ROW_PATTERNS = [2, 1, 4, 4, 2, 5, 4, 5, 4, 4, 4, 3, 5, 3, 4];
export const MY_LIST_STORAGE_KEY = "coachella-personal-list";
export const USER_ID_STORAGE_KEY = "coachella-user-id";

const EXCLUDED_ARTISTS = new Set(["Anyma", "Josh Baker x Carlita", "DJ Snake"]);
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

function splitSongs(value = "", delimiter = "|") {
  return value
    .split(delimiter)
    .map((song) => song.trim())
    .filter(Boolean);
}

export function normalizeLookupValue(value = "") {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function parseCsv(text) {
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

  const [header = [], ...body] = rows;

  return body.map((cells) =>
    header.reduce((entry, key, index) => {
      entry[key] = cells[index] ?? "";
      return entry;
    }, {}),
  );
}

export function normalizeCoachellaArtist(artist, index) {
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

export function normalizeDolabArtist(artist, index) {
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

export function normalizeQuasarArtist(artist, index) {
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

export function sanitizeCoachellaArtists(artists) {
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

export function buildLineupData({ coachellaCsv, dolabCsv, quasarCsv }) {
  const coachella = sanitizeCoachellaArtists(
    parseCsv(coachellaCsv)
      .filter((entry) => DAY_ORDER.includes(entry.day))
      .map(normalizeCoachellaArtist),
  );
  const dolab = parseCsv(dolabCsv).map(normalizeDolabArtist);
  const quasar = parseCsv(quasarCsv).map(normalizeQuasarArtist);

  return {
    coachella,
    dolab,
    quasar,
    artists: [...coachella, ...dolab, ...quasar],
  };
}
