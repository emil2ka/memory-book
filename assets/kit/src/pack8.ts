// Пачка 8: предметы мастера моделей (план 13 ③, eval/make-batch.ts) — места и вещи из словаря дневника,
// которых не хватало для покрытия. Фигуры — из assets/kit/made/<пачка>.json (прошли проверку глазами Haiku
// и глазами на листе assets/_raw/make-batch/<пачка>/sheet.png); здесь только поля библиотеки.
import type { KitModel } from '../../../src/kit/format'
import type { Category } from '../../../src/kit/categories'
import type { Entry } from './pack1'
import places1 from '../made/places1.json'
import things1 from '../made/things1.json'
import round2 from '../made/round2.json'
import round3 from '../made/round3.json'
import round3rej from '../made/round3.rejected.json'
import photoPlaces from '../made/photo_places.json'

interface Meta {
  id: string
  /** название в библиотеке, если слово пачки — описание картинки («многоэтажный дом» → «многоэтажка») */
  ru?: string
  cat: Category
  kk: string
  en: string
  stems: string[]
  tags: string[]
  scene?: 'hand' | 'stand' | 'detail'
  /** перекрасить редкие цвета: в руке не больше 5 семей цветов */
  recolor?: Record<string, string>
}

/** Слово из пачки мастера → поля библиотеки. Слова без записи здесь в библиотеку не идут. */
const META: Record<string, Meta> = {
  // места (stand)
  'спортзал': { id: 'gym', cat: 'play', kk: 'спортзал', en: 'gym', stems: ['спортзал', 'тренажер', 'фитнес', 'качалк', 'штанг', 'gym'], tags: ['sport', 'place', 'energy'], scene: 'stand' },
  'столовая': { id: 'canteen', cat: 'study', kk: 'асхана', en: 'canteen', stems: ['столов', 'асхана', 'canteen'], tags: ['study', 'food', 'place', 'friends'], scene: 'stand' },
  'больница': { id: 'hospital', cat: 'city', kk: 'аурухана', en: 'hospital', stems: ['больниц', 'поликлиник', 'аурухана', 'hospital'], tags: ['city', 'place', 'health'], scene: 'stand' },
  'дача': { id: 'dacha', cat: 'home', kk: 'саяжай', en: 'dacha', stems: ['дача$', 'даче$', 'дачу$', 'дачи$', 'дачн', 'саяжай', 'грядк'], tags: ['home', 'nature', 'place', 'summer'], scene: 'stand' },
  'самокат': { id: 'scooter', cat: 'transport', kk: 'самокат', en: 'scooter', stems: ['самокат', 'электросамокат', 'scooter'], tags: ['transport', 'city', 'place', 'energy'], scene: 'stand' },
  'стиральная машина': { id: 'washing_machine', cat: 'home', kk: 'кір жуғыш машина', en: 'washing machine', stems: ['стирал', 'стирк'], tags: ['home', 'place'], scene: 'stand' },
  // второй круг: слово — то, что видно на картинке
  'многоэтажный дом': { id: 'apartment_block', ru: 'многоэтажка', cat: 'city', kk: 'көпқабатты үй', en: 'apartment block', stems: ['многоэтаж', 'девятиэтаж', 'квартир', 'пәтер', 'apartment'], tags: ['city', 'home', 'place'], scene: 'stand' },
  'общежитие': { id: 'dorm', ru: 'общежитие', cat: 'study', kk: 'жатақхана', en: 'dorm', stems: ['общаг', 'общежит', 'жатақхана', 'dorm'], tags: ['study', 'home', 'friends', 'place'], scene: 'stand' },
  'университет': { id: 'university', cat: 'study', kk: 'университет', en: 'university', stems: ['универ', 'университет', 'вуз$', 'институт', 'academy', 'university'], tags: ['study', 'place', 'city'], scene: 'stand' },
  'мост через реку': { id: 'river_bridge', ru: 'мост через реку', cat: 'nature', kk: 'өзен көпірі', en: 'river bridge', stems: ['река$', 'реки$', 'реке$', 'реку$', 'рекой$', 'речк', 'набережн', 'мост$', 'моста$', 'мосту$', 'мостик', 'өзен', 'көпір', 'river', 'bridge'], tags: ['nature', 'city', 'place', 'walk'], scene: 'stand' },
  'озеро': { id: 'lake', cat: 'nature', kk: 'көл', en: 'lake', stems: ['озер', 'көл$', 'көлге', 'капчагай', 'боровое', 'lake'], tags: ['nature', 'summer', 'place', 'travel'], scene: 'detail' }, // плоское: лежит на странице
  'вход в метро': { id: 'metro', ru: 'метро', cat: 'transport', kk: 'метро', en: 'metro', stems: ['метро', 'подземк', 'metro', 'subway'], tags: ['transport', 'city', 'place'], scene: 'stand' },
  'бассейн': { id: 'pool', cat: 'play', kk: 'бассейн', en: 'pool', stems: ['бассейн', 'плавал', 'pool'], tags: ['sport', 'summer', 'place'], scene: 'detail' }, // плоский: лежит на странице
  'колбаса казы': { id: 'kazy', ru: 'казы', cat: 'kz', kk: 'қазы', en: 'kazy', stems: ['казы$', 'қазы', 'колбас'], tags: ['kz', 'food', 'holiday', 'guests'] },
  'картонная коробка': { id: 'carton_box', ru: 'коробка', cat: 'home', kk: 'қорап', en: 'box', stems: ['коробк', 'қорап', 'переезд', 'переехал'], tags: ['home', 'move'] },
  // места с фото (диорама, 22.11 14:15)
  'песочница': { id: 'sandbox', cat: 'play', kk: 'құм салғыш', en: 'sandbox', stems: ['песочниц', 'двор$', 'двора$', 'дворе$', 'двору$', 'дворик', 'детск площадк', 'ауласы', 'sandbox', 'yard'], tags: ['play', 'city', 'childhood', 'friends', 'place'], scene: 'stand' },
  'пешеходный переход': { id: 'crosswalk', ru: 'переход', cat: 'city', kk: 'жаяу жүргінші өткелі', en: 'crosswalk', stems: ['переход$', 'перехода$', 'переходе$', 'зебр', 'перекрест', 'перекрёст', 'crosswalk'], tags: ['city', 'street', 'place', 'walk'], scene: 'stand' },
  'магазин': { id: 'shop', cat: 'city', kk: 'дүкен', en: 'shop', stems: ['магазин',  'супермаркет',  'дүкен',  'лавк$',  'покупк',  'купил',  'купила',  'shop',  'store'], tags: ['city', 'shop', 'place'], scene: 'stand' },
  'тарелка': { id: 'plate', cat: 'home', kk: 'тәрелке', en: 'plate', stems: ['тарелк', 'тәрелке', 'блюдо$', 'блюде$', 'plate'], tags: ['home', 'food', 'guests'], recolor: { teal: 'navy', greyLight: 'white', brown: 'ochre' } },
  // еда и вещи (hand)
  'казы': { id: 'kazy', cat: 'kz', kk: 'қазы', en: 'kazy', stems: ['казы$', 'қазы', 'конской колбас'], tags: ['kz', 'food', 'holiday', 'guests'] },
  'дыня': { id: 'melon', cat: 'food', kk: 'қауын', en: 'melon', stems: ['дыня$', 'дыни$', 'дыню$', 'дыней$', 'дынь', 'қауын', 'melon'], tags: ['food', 'fruit', 'summer'] },
  'шаурма': { id: 'shawarma', cat: 'food', kk: 'шаурма', en: 'shawarma', stems: ['шаурм', 'шаверм', 'донер'], tags: ['food', 'street', 'friends'] },
  'манты': { id: 'manty', cat: 'kz', kk: 'манты', en: 'manty', stems: ['мант$', 'манты$', 'мантов', 'мантами', 'manty'], tags: ['kz', 'food', 'home', 'guests'] },
  'пельмени': { id: 'dumplings', cat: 'food', kk: 'тұшпара', en: 'dumplings', stems: ['пельмен', 'тұшпара', 'dumpling'], tags: ['food', 'home', 'warm'] },
  'каша': { id: 'porridge', cat: 'food', kk: 'ботқа', en: 'porridge', stems: ['каша$', 'каши$', 'кашу$', 'кашей$', 'овсянк', 'гречк', 'ботқа', 'porridge'], tags: ['food', 'morning', 'home'] },
  'салат': { id: 'salad', cat: 'food', kk: 'салат', en: 'salad', stems: ['салат', 'оливье', 'salad'], tags: ['food', 'holiday', 'home'] },
  'чак-чак': { id: 'chak_chak', cat: 'food', kk: 'шәкшәк', en: 'chak-chak', stems: ['чак-чак', 'чакчак', 'шәкшәк'], tags: ['food', 'sweet', 'holiday', 'guests'] },
  'попкорн': { id: 'popcorn', cat: 'food', kk: 'попкорн', en: 'popcorn', stems: ['попкорн', 'popcorn'], tags: ['food', 'cinema', 'friends'] },
  'бабл-ти': { id: 'bubble_tea', cat: 'drinks', kk: 'бабл-ти', en: 'bubble tea', stems: ['бабл', 'тапиок', 'bubble tea'], tags: ['drink', 'city', 'friends', 'sweet'] },
  'энергетик': { id: 'energy_drink', cat: 'drinks', kk: 'энергетик', en: 'energy drink', stems: ['энергетик', 'ред булл', 'energy drink'], tags: ['drink', 'study', 'night'] },
  'айран': { id: 'ayran', cat: 'kz', kk: 'айран', en: 'ayran', stems: ['айран', 'ayran'], tags: ['kz', 'drink', 'cold', 'home'] },
  'коробка': { id: 'carton_box', cat: 'home', kk: 'қорап', en: 'box', stems: ['коробк', 'қорап', 'переезд', 'переехал'], tags: ['home', 'move'] },
  'деньги': { id: 'money', cat: 'study', kk: 'ақша', en: 'money', stems: ['деньг', 'денег', 'стипенди', 'зарплат', 'ақша', 'money'], tags: ['work', 'study', 'joy'] },
  'хомяк': { id: 'hamster', cat: 'animals', kk: 'атжалман', en: 'hamster', stems: ['хомяк', 'хомячк', 'атжалман', 'hamster'], tags: ['animal', 'home', 'pet'], recolor: { plum: 'coral', skinShade: 'coral' } },
  'скейтборд': { id: 'skateboard', cat: 'play', kk: 'скейтборд', en: 'skateboard', stems: ['скейт', 'skate'], tags: ['sport', 'city', 'summer'] },
  'калькулятор': { id: 'calculator', cat: 'study', kk: 'калькулятор', en: 'calculator', stems: ['калькулятор', 'calculator'], tags: ['study', 'work'] },
  'лыжи': { id: 'skis', cat: 'play', kk: 'шаңғы', en: 'skis', stems: ['лыж', 'шаңғы', 'ski'], tags: ['sport', 'winter', 'cold'] },
  'геймпад': { id: 'gamepad', cat: 'play', kk: 'джойстик', en: 'gamepad', stems: ['геймпад', 'джойстик', 'приставк', 'плейстейшн', 'катку$', 'доту$', 'gamepad'], tags: ['play', 'friends', 'home', 'night'] },
  'швабра': { id: 'mop', cat: 'home', kk: 'швабра', en: 'mop', stems: ['швабр', 'уборк', 'убирал', 'пылесос', 'mop'], tags: ['home', 'work'] },
}

const fromMade = (models: unknown[]): Entry[] =>
  (models as (KitModel & { checked?: unknown })[]).flatMap((m) => {
    const meta = META[m.ru]
    if (!meta) return []
    const { id, ru, cat, kk, en, stems, tags, scene, recolor } = meta
    const { checked: _c, ...rest } = m
    // не больше 40 фигур (правило библиотеки): лишние — самые мелкие
    if (rest.parts.length > 40) {
      const vol = (q: (typeof rest.parts)[number]) => q.d[0] * q.d[1] * q.d[2]
      const keep = new Set([...rest.parts].sort((a, b) => vol(b) - vol(a)).slice(0, 40))
      rest.parts = rest.parts.filter((q) => keep.has(q))
    }
    if (recolor) rest.parts = rest.parts.map((q) => (recolor[q.c] ? { ...q, c: recolor[q.c] as typeof q.c } : q))
    const model: KitModel = { ...rest, id, ru: ru ?? m.ru, kk, en, stems, tags, by: 'library', ...(scene ? { scene } : { scene: 'hand' as const }) }
    return [{ cat, model }]
  })

/**
 * Отклонённые проверкой Haiku, но принятые глазами на листе (rejected.json хранит фигуры последнего захода).
 * Слово → да. Только то, что на листе читается без подписи.
 */
const BY_EYE = (rejected: unknown[], words: string[]): unknown[] =>
  (rejected as { word: string; model?: KitModel }[]).filter((r) => r.model && words.includes(r.word)).map((r) => ({ ...r.model!, ru: r.word }))

export const pack8: Entry[] = fromMade([...places1, ...things1, ...round2, ...round3, ...BY_EYE(round3rej, ['манты']), ...photoPlaces])
