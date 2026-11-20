// Папка дня → ZIP: days/{дата}-{slug}/entry.json, script.json, photos/, song.*, cover.png
import { strToU8, zipSync, type Zippable } from 'fflate'
import type { StoredDay } from './days'

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  ә: 'a', ғ: 'g', қ: 'q', ң: 'n', ө: 'o', ұ: 'u', ү: 'u', һ: 'h', і: 'i',
}

export function slugify(title: string): string {
  const s = [...title.toLowerCase()].map((ch) => TRANSLIT[ch] ?? ch).join('')
  return s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'den'
}

export function dayFolderName(day: Pick<StoredDay, 'date' | 'script'>): string {
  return `${day.date}-${slugify(day.script.title)}`
}

const extOf = (b: Blob, dflt: string) => {
  const t = b.type
  if (t.includes('jpeg')) return 'jpg'
  if (t.includes('png')) return 'png'
  if (t.includes('webp')) return 'webp'
  if (t.includes('mpeg')) return 'mp3'
  if (t.includes('wav')) return 'wav'
  if (t.includes('ogg')) return 'ogg'
  if (t.includes('mp4') || t.includes('aac') || t.includes('m4a')) return 'm4a'
  if (t.includes('flac')) return 'flac'
  return dflt
}

const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer())

/** Собрать ZIP папки дня. cover — PNG обложки, если сцена его дала. */
export async function exportDayZip(day: StoredDay, cover?: Blob | null): Promise<Blob> {
  const folder = `days/${dayFolderName(day)}`
  const files: Zippable = {}
  const entry = {
    id: day.id,
    date: day.date,
    text: day.text,
    source: day.source,
    seed: day.seed,
    createdAt: new Date(day.createdAt).toISOString(),
    photoPalette: day.photoPalette ?? [],
    photos: day.photos.map((p, i) => `photos/${i + 1}.${extOf(p, 'jpg')}`),
    song: day.song
      ? {
          kind: day.song.kind,
          url: day.song.url,
          title: day.song.title,
          artist: day.song.artist,
          bpm: day.song.bpm,
          tempo: day.song.tempo,
          energy: day.song.energy,
          file: day.song.blob ? `song.${extOf(day.song.blob, 'audio')}` : undefined,
        }
      : null,
  }
  files[`${folder}/entry.json`] = strToU8(JSON.stringify(entry, null, 2))
  files[`${folder}/script.json`] = strToU8(JSON.stringify(day.script, null, 2))
  for (let i = 0; i < day.photos.length; i++) {
    files[`${folder}/photos/${i + 1}.${extOf(day.photos[i], 'jpg')}`] = [await bytes(day.photos[i]), { level: 0 }]
  }
  if (day.song?.blob) files[`${folder}/song.${extOf(day.song.blob, 'audio')}`] = [await bytes(day.song.blob), { level: 0 }]
  if (cover) files[`${folder}/cover.png`] = [await bytes(cover), { level: 0 }]
  const zipped = zipSync(files, { level: 6 })
  return new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/zip' })
}

/** Скачать Blob файлом (только браузер). */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
