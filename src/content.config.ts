import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { SITE } from "@/config";

export const BLOG_PATH = "src/data/blog";
export const HAIKU_PATH = "src/data/haiku";

export const HAIKU_CATEGORIES = [
  "software",
  "computing",
  "cloud",
  "networking",
] as const;

export type HaikuCategory = (typeof HAIKU_CATEGORIES)[number];

const blog = defineCollection({
  loader: glob({ pattern: "**/[^_]*.md", base: `./${BLOG_PATH}` }),
  schema: ({ image }) =>
    z.object({
      author: z.string().default(SITE.author),
      pubDatetime: z.date(),
      modDatetime: z.date().optional().nullable(),
      title: z.string(),
      featured: z.boolean().optional(),
      draft: z.boolean().optional(),
      tags: z.array(z.string()).default(["others"]),
      ogImage: image().or(z.string()).optional(),
      description: z.string(),
      canonicalURL: z.string().optional(),
      hideEditPost: z.boolean().optional(),
      timezone: z.string().optional(),
    }),
});

const haiku = defineCollection({
  loader: glob({ pattern: "**/[^_]*.md", base: `./${HAIKU_PATH}` }),
  schema: z.object({
    title: z.string(),
    pubDatetime: z.date(),
    category: z.enum(HAIKU_CATEGORIES),
    note: z.string().optional(),
    draft: z.boolean().optional(),
  }),
});

export const collections = { blog, haiku };
