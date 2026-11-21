// Категории библиотеки кита: по файлу assets/kit/<категория>.json на каждую.
export const CATEGORIES = [
  'drinks',
  'food',
  'weather',
  'nature',
  'city',
  'home',
  'study',
  'transport',
  'play',
  'music',
  'animals',
  'holiday',
  'feelings',
  'kz',
] as const

export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_RU: Record<Category, string> = {
  drinks: 'напитки',
  food: 'еда',
  weather: 'погода и небо',
  nature: 'природа',
  city: 'город',
  home: 'дом',
  study: 'учёба и работа',
  transport: 'транспорт',
  play: 'спорт и игры',
  music: 'музыка',
  animals: 'животные',
  holiday: 'праздники',
  feelings: 'чувства',
  kz: 'Казахстан',
}
