// Эмоции и действия человечка (план 15): что он умеет сыграть сам, без слова-предмета.
// Контракт для режиссёра (mb-logic): Haiku выбирает id по полю `when`; сцена играет его через Hero3D.play(id).
import type { DoAction, EmotionAction } from './Hero3D'

export interface HeroActionInfo {
  id: EmotionAction | DoAction
  kind: 'emotion' | 'action'
  /** Как это выглядит — для людей и для промпта. */
  ru: string
  /** Когда играть: одна строка, по ней Haiku выбирает. */
  when: string
  /** Повторяется, пока длится бит; false — один раз и замирает в конце. */
  loop: boolean
  /** Сколько секунд нужно, чтобы движение прочиталось. */
  dur: number
}

export const HERO_ACTIONS: readonly HeroActionInfo[] = [
  // эмоции
  { id: 'bored', kind: 'emotion', ru: 'сник, качается, вздыхает и зевает', when: 'скучно, нечего делать, тоска, однообразно, лень', loop: true, dur: 3.2 },
  { id: 'sad', kind: 'emotion', ru: 'голова вниз, руки висят, слеза', when: 'грустно, обидно, расстроился, жаль, разочарован', loop: true, dur: 2.5 },
  { id: 'joy', kind: 'emotion', ru: 'подпрыгивает, улыбается', when: 'радостно, хорошо, весело, приятно, повезло', loop: true, dur: 2 },
  { id: 'excited', kind: 'emotion', ru: 'прыгает с руками вверх, «!»', when: 'восторг, ура, не верится, сбылось, победа, сдал', loop: true, dur: 2 },
  { id: 'tired', kind: 'emotion', ru: 'обмяк, колени согнуты, капля пота', when: 'устал, вымотался, тяжёлый день, много работы', loop: true, dur: 2.5 },
  { id: 'sleepy', kind: 'emotion', ru: 'клюёт носом, «z»', when: 'хочу спать, не выспался, проспал, рано встал, вечер', loop: true, dur: 2.6 },
  { id: 'angry', kind: 'emotion', ru: 'топает, кулаки, красная метка', when: 'злюсь, бесит, раздражает, поругались, несправедливо', loop: true, dur: 2.4 },
  { id: 'scared', kind: 'emotion', ru: 'присел, закрылся руками, дрожит', when: 'страшно, испугался, волнуюсь перед экзаменом, темно', loop: true, dur: 2 },
  { id: 'surprised', kind: 'emotion', ru: 'отпрыгнул назад, рот «о», «!»', when: 'удивился, неожиданно, вдруг, сюрприз, не ожидал', loop: false, dur: 1.6 },
  { id: 'love', kind: 'emotion', ru: 'ладони у груди, качается, сердечки', when: 'люблю, нравится, нежность, свидание, скучаю по кому-то', loop: true, dur: 2.6 },
  { id: 'laugh', kind: 'emotion', ru: 'хохочет, руки на животе', when: 'смешно, смеялись, шутки, угар', loop: true, dur: 2 },
  { id: 'cry', kind: 'emotion', ru: 'трёт глаза кулаками, плачет', when: 'плакал, слёзы, очень больно, потеря', loop: true, dur: 2.4 },
  { id: 'calm', kind: 'emotion', ru: 'потягивается и спокойно дышит', when: 'спокойно, отдохнул, тишина, уютно, выдохнул', loop: false, dur: 3 },
  { id: 'proud', kind: 'emotion', ru: 'руки в боки, грудь вперёд', when: 'горжусь, получилось, справился, похвалили', loop: true, dur: 2.4 },
  { id: 'think', kind: 'emotion', ru: 'рука у подбородка, «?»', when: 'думал, решал, не знаю, сомневаюсь, учил', loop: true, dur: 2.6 },
  { id: 'nervous', kind: 'emotion', ru: 'переминается, теребит руки, оглядывается', when: 'нервничал, тревожно, опаздывал, ждал результата', loop: true, dur: 2.4 },
  { id: 'lonely', kind: 'emotion', ru: 'сидит, обняв колени', when: 'одиноко, никого рядом, один дома, скучаю', loop: false, dur: 3 },
  // действия
  { id: 'run', kind: 'action', ru: 'бежит, руки работают', when: 'бежал, спешил, опаздывал, пробежка', loop: true, dur: 2 },
  { id: 'dance', kind: 'action', ru: 'танцует, нота над головой', when: 'танцевали, вечеринка, концерт, дискотека', loop: true, dur: 2.6 },
  { id: 'hug', kind: 'action', ru: 'раскрывает руки и обнимает', when: 'обнялись, встретились, соскучились, мама, друзья', loop: false, dur: 2 },
  { id: 'read', kind: 'action', ru: 'читает книгу, листает', when: 'читал, книга, библиотека', loop: true, dur: 2.5 },
  { id: 'write', kind: 'action', ru: 'пишет, склонившись', when: 'писал, конспект, домашка, экзамен, письмо', loop: true, dur: 2.4 },
  { id: 'phone', kind: 'action', ru: 'смотрит в телефон, листает', when: 'телефон, переписывались, соцсети, позвонили', loop: true, dur: 2.4 },
  { id: 'eat', kind: 'action', ru: 'ест ложкой, жуёт', when: 'ели, обед, ужин, вкусно, бабушкины блюда', loop: true, dur: 2.2 },
  { id: 'cook', kind: 'action', ru: 'мешает в кастрюле', when: 'готовил, пекли, варили, кухня', loop: true, dur: 2.4 },
  { id: 'sleep', kind: 'action', ru: 'лёг на бок и спит, «z»', when: 'спал, лёг, ночь, отсыпался', loop: false, dur: 3 },
  { id: 'guitar', kind: 'action', ru: 'играет на гитаре или домбре', when: 'играл, музыка, гитара, домбра, пели', loop: true, dur: 2.6 },
  { id: 'photo', kind: 'action', ru: 'фотографирует, щелчок', when: 'фотографировал, снимал, селфи, красивый вид', loop: true, dur: 1.6 },
  { id: 'clap', kind: 'action', ru: 'хлопает в ладоши', when: 'аплодисменты, концерт, праздник, поздравляли', loop: true, dur: 1.6 },
  { id: 'point', kind: 'action', ru: 'показывает рукой вдаль', when: 'смотри, увидел, показал, там было', loop: false, dur: 1.8 },
  { id: 'look', kind: 'action', ru: 'ладонь козырьком, оглядывается', when: 'искал, гулял, новое место, путешествие, город', loop: true, dur: 3 },
  { id: 'throw', kind: 'action', ru: 'замахивается и бросает', when: 'кидались снежками, бросил, игра в мяч', loop: true, dur: 1.4 },
  { id: 'kick', kind: 'action', ru: 'пинает ногой', when: 'футбол, пинал мяч, тренировка', loop: true, dur: 1.2 },
]

export const HERO_ACTION_IDS = HERO_ACTIONS.map((a) => a.id)
export const isHeroAction = (id: string): id is HeroActionInfo['id'] => (HERO_ACTION_IDS as readonly string[]).includes(id)
