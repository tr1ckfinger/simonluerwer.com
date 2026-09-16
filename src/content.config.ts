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
    // Short one-line meta info shown above the description — e.g.
    // location + date, or a client/publication credit. Optional.
    info: z.string().optional(),
  }),
});

export const collections = { albums };
