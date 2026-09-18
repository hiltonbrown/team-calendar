import { z } from "zod";

const paginationSchema = z
  .object({
    first: z.string().url().optional(),
    last: z.string().url().optional(),
    next: z.string().url().nullable().optional(),
    prev: z.string().url().nullable().optional(),
  })
  .optional();
const affectedResourceSchema = z.object({
  status: z.string(),
  status_page_resource_id: z.union([z.string(), z.number()]).transform(String),
});

export const statusPageResponseSchema = z.object({
  data: z.object({
    attributes: z.object({ published: z.boolean(), subscribable: z.boolean() }),
    id: z.string(),
    type: z.literal("status_page"),
  }),
});
export const statusPageResourcesResponseSchema = z.object({
  data: z.array(
    z.object({
      attributes: z.object({
        position: z.number().optional(),
        public_name: z.string(),
        status: z.string(),
      }),
      id: z.string(),
      type: z.literal("status_page_resource"),
    })
  ),
  pagination: paginationSchema,
});
export const statusReportsResponseSchema = z.object({
  data: z.array(
    z.object({
      attributes: z.object({
        affected_resources: z.array(affectedResourceSchema),
        aggregate_state: z.string(),
        ends_at: z.string().datetime().nullable(),
        report_type: z.enum(["manual", "maintenance"]),
        starts_at: z.string().datetime(),
        title: z.string().min(1),
      }),
      id: z.string(),
      type: z.literal("status_report"),
    })
  ),
  pagination: paginationSchema,
});
export const statusUpdatesResponseSchema = z.object({
  data: z.array(
    z.object({
      attributes: z.object({
        affected_resources: z.array(affectedResourceSchema),
        message: z.string(),
        published_at: z.string().datetime(),
      }),
      id: z.string(),
      type: z.literal("status_update"),
    })
  ),
  pagination: paginationSchema,
});

export type StatusPageResourceResponse = z.infer<
  typeof statusPageResourcesResponseSchema
>["data"][number];
export type StatusReportResponse = z.infer<
  typeof statusReportsResponseSchema
>["data"][number];
export type StatusUpdateResponse = z.infer<
  typeof statusUpdatesResponseSchema
>["data"][number];
