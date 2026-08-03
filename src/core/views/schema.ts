import { z } from 'zod'

export const fieldConfigSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  visible: z.boolean().optional(),
  required: z.boolean().optional(),
})

export const viewLayoutSchema = z.object({
  fields: z.array(fieldConfigSchema).min(1),
})

export type ViewLayoutInput = z.input<typeof viewLayoutSchema>
export type ViewLayoutParsed = z.output<typeof viewLayoutSchema>
