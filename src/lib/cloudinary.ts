import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';

const CLOUD_NAME =
  process.env.CLOUDINARY_CLOUD_NAME ?? import.meta.env.CLOUDINARY_CLOUD_NAME;
const API_KEY =
  process.env.CLOUDINARY_API_KEY ?? import.meta.env.CLOUDINARY_API_KEY;
const API_SECRET =
  process.env.CLOUDINARY_API_SECRET ?? import.meta.env.CLOUDINARY_API_SECRET;

cloudinary.config({
  cloud_name: CLOUD_NAME,
  api_key: API_KEY,
  api_secret: API_SECRET,
  secure: true,
});

export type CldImage = {
  public_id: string;
  width: number;
  height: number;
  format: string;
  uploaded_at?: string; // ISO datetime from Cloudinary
  tags?: string[];
  context?: Record<string, string>;
  // Manual sort weight from the image's `order` context field in
  // Cloudinary (lower = earlier). Undefined when the field is absent
  // or non-numeric — those images fall to the back, newest-first.
  order?: number;
};

export type Album = {
  slug: string;
  // Plain display name (parentheses removed) — for headings, page
  // titles, alt text.
  title: string;
  // The lowercased folder name with any (parentheses) kept, which mark
  // the part of the name the cover shows bigger (see projects.astro).
  coverTitle: string;
  cover: CldImage;
  images: CldImage[];
  // ISO datetime of the most recently uploaded image in this album.
  // Used to sort albums newest-first on the listing page.
  newestUploadedAt: string;
  // True if any image in the folder carries the `hidden` tag. Hidden
  // albums are excluded from /projects and the home grid, but still
  // build a single-series page so the URL works for direct visits.
  // The series page also emits noindex so Google doesn't pick it up
  // even if the URL is discovered.
  hidden: boolean;
};

// This is the curated professional site — it deliberately reads from
// its own folder ("Portfolio Projects"), separate from the personal
// site's "Albums" / "Projects" folders in the same Cloudinary account.
// Nothing shows up here unless it's explicitly uploaded/organized into
// this folder. Single category, single folder — the site only has one
// kind of series ("projects"), unlike the personal site's album/project
// split.
const PARENT_FOLDER = 'Portfolio Projects';

// Album titles are the raw folder name, lowercased, with spaces and
// dashes/underscores all rendered as a single space. Folder "New York"
// → "new york"; folder "street-life" → "street life". Parentheses are
// kept here — on the cover, the part in (parentheses) is set bigger —
// and stripped by displayTitle for everywhere else.
function titleFromFolder(folder: string) {
  return folder.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function displayTitle(coverTitle: string) {
  return coverTitle.replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
}

// URL slugs can't contain spaces or parentheses, so drop the
// parentheses, collapse any whitespace run to a single hyphen and
// lowercase the rest. Folder "New York" → "new-york"; folder
// "(ironman) hamburg" → "ironman-hamburg" (so adding parentheses to a
// folder name doesn't change its URL or its text file's name).
function slugFromFolder(folder: string) {
  return folder
    .trim()
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function listSubFolders(parent: string): Promise<string[]> {
  try {
    const res: any = await cloudinary.api.sub_folders(parent);
    return (res.folders ?? []).map((f: any) => f.name);
  } catch (err: any) {
    // If a parent folder doesn't exist yet (e.g. the site has albums
    // but no projects yet) Cloudinary returns 404 — treat as empty so
    // the build doesn't fail.
    if (err?.error?.http_code === 404 || err?.http_code === 404) return [];
    throw err;
  }
}

async function listImagesInFolder(folderPath: string): Promise<CldImage[]> {
  // Quote the folder path so any spaces in folder names are parsed as
  // part of the path segment instead of splitting the search expression.
  // Sort oldest-first by upload time: within a series, that reads as
  // the shoot unfolding in the order it happened. This only matters
  // for images that DON'T carry a manual `order` context field — those
  // are explicitly pinned below and this base order is just their
  // (stable) fallback relative position.
  const res: any = await cloudinary.search
    .expression(`folder:"${folderPath}/*"`)
    .with_field('tags')
    .with_field('context')
    .sort_by('uploaded_at', 'asc')
    .max_results(500)
    .execute();

  const images: CldImage[] = (res.resources ?? []).map((r: any) => {
    // The Search API returns context as a flat object ({ order: "80" }),
    // while the Admin API nests it under `.custom`. Handle both so the
    // `order` field resolves regardless of which shape Cloudinary sends.
    const context = r.context?.custom ?? r.context ?? {};
    // Manual sort weight: set an `order` context field (a number) on an
    // image in Cloudinary to pin it to a position. Parsed leniently —
    // any non-numeric or absent value becomes undefined and the image
    // falls to the unordered tail.
    const rawOrder = context.order;
    const parsedOrder =
      rawOrder !== undefined && rawOrder !== '' && !isNaN(Number(rawOrder))
        ? Number(rawOrder)
        : undefined;
    return {
      public_id: r.public_id,
      width: r.width,
      height: r.height,
      format: r.format,
      uploaded_at: r.uploaded_at,
      tags: r.tags ?? [],
      context,
      order: parsedOrder,
    };
  });

  // Stable sort: images with an `order` value come first in ascending
  // order; images without one keep their current relative position,
  // which is uploaded_at asc (oldest-first) from the Cloudinary query.
  // Array.prototype.sort is stable in modern V8, so equal-key items
  // (both unordered, or same order value) preserve the query order.
  images.sort((a, b) => {
    const ao = a.order;
    const bo = b.order;
    if (ao !== undefined && bo !== undefined) return ao - bo;
    if (ao !== undefined) return -1; // a is pinned, b isn't → a first
    if (bo !== undefined) return 1; // b is pinned, a isn't → b first
    return 0; // neither pinned → keep query order (oldest-first)
  });

  return images;
}

let albumsPromise: Promise<Album[]> | null = null;

async function fetchAlbums(): Promise<Album[]> {
  const out: Album[] = [];
  const subs = await listSubFolders(PARENT_FOLDER);

  for (const sub of subs) {
    const folderPath = `${PARENT_FOLDER}/${sub}`;
    const images = await listImagesInFolder(folderPath);
    if (images.length === 0) continue;

    // Cover + album-sort are intentionally independent of the manual
    // `order` field (which only reorders images WITHIN a series page).
    // Compute both from upload date so pinning an old image to the top
    // of a series doesn't also make it the cover or bump the album's
    // position in the listing.
    const newestByUpload = images.reduce((newest, img) =>
      (img.uploaded_at ?? '') > (newest.uploaded_at ?? '') ? img : newest
    );
    const cover =
      images.find((i) => i.tags?.includes('cover')) ?? newestByUpload;
    const newestUploadedAt = newestByUpload.uploaded_at ?? '';
    // Hidden flag: tag any image in the folder with `hidden` to
    // exclude the whole album from the listing + home grid + Google
    // indexing (the page still works at its URL).
    const hidden = images.some((i) => i.tags?.includes('hidden'));

    out.push({
      slug: slugFromFolder(sub),
      title: displayTitle(titleFromFolder(sub)),
      coverTitle: titleFromFolder(sub),
      cover,
      images,
      newestUploadedAt,
      hidden,
    });
  }

  // Sort albums newest-first by their most recent image upload, so
  // the listing page surfaces fresh work at the top. ISO 8601 strings
  // sort lexicographically by year → month → …, so a plain
  // localeCompare gives chronological order.
  out.sort((a, b) => b.newestUploadedAt.localeCompare(a.newestUploadedAt));

  return out;
}

export async function getAlbums(): Promise<Album[]> {
  if (!albumsPromise) {
    albumsPromise = fetchAlbums().catch((err) => {
      albumsPromise = null; // allow retry on failure
      throw err;
    });
  }
  return albumsPromise;
}

export function albumHref(album: Album): string {
  return `/projects/${album.slug}`;
}

export function cldUrl(
  publicId: string,
  opts: { w?: number; h?: number; crop?: string; q?: string } = {}
) {
  const { w, h, crop = 'fill', q = 'auto' } = opts;
  const parts: string[] = [`f_auto`, `q_${q}`];
  if (w) parts.push(`w_${w}`);
  if (h) parts.push(`h_${h}`);
  if (w || h) parts.push(`c_${crop}`);
  const transform = parts.join(',');
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${transform}/${publicId}`;
}
