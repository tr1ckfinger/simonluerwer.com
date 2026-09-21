import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Optional descriptive text for albums/projects, kept in git rather
// than Cloudinary metadata — real prose (multi-paragraph, markdown)
// doesn't fit well in Cloudinary's single-line context fields, and
// this keeps copy diffable/reviewable like the rest of the site.
//
// One file per series, named to match its Cloudinary-derived slug
// exactly (see slugFromFolder in src/lib/cloudinary.ts): the folder
// "Skateboarding" under Portfolio Projects becomes the slug
// "skateboarding", so the matching file is
// src/content/albums/skateboarding.md. A series without a file here
// just renders with no info/description block — this collection is
// entirely optional per album.
const albums = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/albums' }),
  schema: z.object({
    // Both optional, both free-text (date is deliberately a string,
    // not a real Date — "Summer 2026" or "12.06.2026" are both valid
    // and there's no need for real date math anywhere on the site).
    location: z.string().optional(),
    date: z.string().optional(),
  }),
});
// The markdown body itself is the Description field — rendered via
// render(entry) in the page template, no separate frontmatter key
// needed for it.

// The About-me page copy: a single Markdown file,
// src/content/about/about.md. Body only — paragraphs separated by a
// blank line. The email / instagram / location rows stay in
// contact.astro since they're structured, not prose.
const about = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/about' }),
  schema: z.object({}),
});

export const collections = { albums, about };
