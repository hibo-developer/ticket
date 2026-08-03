export type FieldConfig = {
  key: string
  label: string
  visible?: boolean
  required?: boolean
}

export type ViewLayout = {
  fields: FieldConfig[]
}

