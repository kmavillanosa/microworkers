export const SETTINGS_SECTIONS = [
//   { id: 'accounts', label: 'Social Accounts' },
//   { id: 'niches', label: 'Content Niches' },
//   { id: 'pipelines', label: 'Auto Pipelines' },
  { id: 'fonts', label: 'Fonts' },
  { id: 'clips', label: 'Clips' },
  { id: 'payment', label: 'Payment methods' },
  { id: 'pricing', label: 'Order pricing' },
  { id: 'voices', label: 'Order voices' },
  { id: 'danger', label: 'Danger zone' },
] as const

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id']

export function isSettingsSectionId(value: string | undefined): value is SettingsSectionId {
  return SETTINGS_SECTIONS.some((section) => section.id === value)
}
