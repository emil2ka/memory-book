// Предзагрузка всего, из чего собирается бумажный интерфейс (Эмиль, 22.11: «UI нормально не собирается»):
// картинки-фактуры (сургуч, кассета, бирки, скотч, бумага) и иконки подключены CSS-фонами — браузер качает их,
// только когда элемент появился, и интерфейс собирается кусками. Здесь они грузятся и декодируются заранее.

const IMAGES = Object.values(
  import.meta.glob('../../assets/ui/**/*.webp', { query: '?url', import: 'default', eager: true }) as Record<string, string>,
)

const FONTS = ['700 20px Caveat', '500 20px Caveat', '400 14px Inter', '500 14px Inter', '600 14px Inter']

/** Держим ссылки на картинки, чтобы браузер не выкинул их из памяти до первого показа. */
const keep: HTMLImageElement[] = []

function loadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      keep.push(img)
      img.decode().then(resolve, () => resolve())
    }
    img.onerror = () => resolve()
    img.src = url
  })
}

/** Картинки и шрифты интерфейса. onStep(готово, всего) — для полоски загрузки. */
export async function preloadUi(onStep: (done: number, total: number) => void): Promise<void> {
  const total = IMAGES.length + 1
  let done = 0
  const tick = () => onStep(++done, total)
  const fonts = (async () => {
    try {
      await Promise.all(FONTS.map((f) => document.fonts.load(f, 'Дневник-книга әғқ')))
      await document.fonts.ready
    } catch {
      /* без шрифтов — запасные */
    }
    tick()
  })()
  await Promise.all([fonts, ...IMAGES.map((u) => loadImage(u).then(tick))])
}
