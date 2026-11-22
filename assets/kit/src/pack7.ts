// Пачка 7: дастархан с едой (stand) и детали сценок (detail, 6–20): урна, кот спит, лужа, сугроб,
// листья кучкой, стопка книг, связка шариков. Мяч, рюкзак и кружка уже есть (ball, backpack, tea / cocoa).
import type { Part } from '../../../src/kit/format'
import { box, cone, cyl, item, onXZ, ring, ry, sph, sym, torus } from './dsl'

/** «Z» сна: три бруска. */
const zz = (x: number, y: number, s: number): Part[] => [
  box([x, y + s, 2], [s * 1.8, s * 0.45, 0.4], 'navy'),
  box([x, y, 2], [s * 0.45, s * 2.5, 0.4], 'navy', { r: [0, 0, -50] }),
  box([x, y - s, 2], [s * 1.8, s * 0.45, 0.4], 'navy'),
]
import type { Entry } from './pack1'

const e = (cat: string, model: Entry['model']): Entry => ({ cat, model })

export const pack7: Entry[] = [
  // ракета (была только картинкой): белый корпус, красный нос и стабилизаторы, иллюминатор, пламя снизу
  e('transport', item(
    { id: 'rocket', ru: 'ракета', kk: 'зымыран', en: 'rocket', stems: ['ракет', 'космос', 'космонавт', 'ғарыш', 'зымыран', 'rocket', 'space'], tags: ['transport', 'dream', 'sky', 'energy', 'joy'], hold: 'hand', grip: [0, 5.5, 0], scene: 'hand', fx: [{ kind: 'flame', at: [0, 1, 0] }] },
    cyl([0, 6.2, 0], [4.6, 6.4, 4.6], 'white', { k: 14, n: 'body' }),
    cone([0, 10.6, 0], [4.6, 2.8, 4.6], 'brick', { k: 14, n: 'nose' }),
    cyl([0, 4.3, 0], [4.8, 0.8, 4.8], 'brick', { k: 14 }),
    cyl([0, 7.4, 2.25], [2.6, 0.5, 2.6], 'navy', { r: [90, 0, 0], k: 12, n: 'window' }),
    cyl([0, 7.4, 2.45], [1.8, 0.4, 1.8], 'ice', { r: [90, 0, 0], k: 12 }),
    ...sym(box([3, 3.6, 0], [2.4, 4, 0.9], 'brick', { r: [0, 0, -22], n: 'fin' })),
    box([0, 3.4, 2.6], [0.9, 3.6, 2.2], 'brick'),
    cyl([0, 2.6, 0], [3, 1, 3], 'slate', { k: 12, n: 'nozzle' }),
    cone([0, 1.2, 0], [3, 2.4, 3], 'amber', { r: [180, 0, 0], k: 10, glow: true, n: 'flame' }),
    cone([0, 1.4, 0], [1.6, 1.8, 1.6], 'yellow', { r: [180, 0, 0], k: 10, glow: true }),
  )),
  e('kz', item(
    { id: 'dastarkhan_feast', ru: 'дастархан с угощением', kk: 'дастарқан', en: 'dastarkhan feast', stems: ['застоль', 'угощени', 'той$', 'feast'], tags: ['kz', 'food', 'family', 'guests', 'holiday', 'warm', 'place'], hold: 'ground', scene: 'stand', fx: [{ kind: 'steam', at: [-6, 27, -3] }] },
    // низкий круглый стол на корпе
    ...([[-15, 'brick'], [15, 'teal']] as const).map(([x, c]) => box([x, 1, 8], [10, 2, 7], c, { r: [0, x > 0 ? -20 : 20, 0], n: 'korpe' })),
    box([0, 1, -14], [14, 2, 6], 'amber', { n: 'korpe' }),
    ...ring(4, (a) => box(onXZ(9, a + 45, 2.5), [2, 5, 2], 'brown')),
    cyl([0, 5.5, 0], [28, 1.5, 22], 'woodLight', { k: 18, n: 'table' }),
    cyl([0, 6.4, 0], [26, 0.5, 20], 'white', { k: 18 }),
    torus([0, 6.6, 0], [25, 19, 0.6], 'brick', { r: [90, 0, 0] }),
    // самовар
    cyl([-6, 7.5, -3], [5, 1.5, 5], 'amber'),
    cyl([-6, 12, -3], [6.5, 8, 6.5], 'amber', { k: 12, n: 'samovar' }),
    cyl([-6, 12, -3], [6.8, 1, 6.8], 'ochre', { k: 12 }),
    cone([-6, 17.5, -3], [6.5, 3, 6.5], 'amber', { k: 12 }),
    cyl([-6, 20, -3], [2, 3, 2], 'ochre'),
    sph([-6, 23, -3], [5, 4, 5], 'white', { n: 'teapot' }),
    cyl([-2.8, 23, -3], [1, 3, 1], 'white', { r: [0, 0, -50] }),
    sph([-6, 25.25, -3], [1.5, 1, 1.5], 'teal'),
    box([-6, 10, 0.5], [1, 1, 2], 'ochre', { n: 'tap' }),
    torus([-2.5, 13, -3], [2, 2.5, 0.6], 'ochre'),
    torus([-9.5, 13, -3], [2, 2.5, 0.6], 'ochre'),
    // кесе, баурсаки, нан, яблоки
    ...[[5, 4], [-1, 6], [9, -3]].map(([x, z]) => cyl([x, 7.75, z], [3, 2, 3], 'white')),
    ...[[5, 4], [-1, 6], [9, -3]].map(([x, z]) => cyl([x, 8, z], [3.2, 0.5, 3.2], 'teal')),
    cyl([3, 6.9, -6], [8, 0.5, 8], 'white', { n: 'plate' }),
    ...[[1.5, -6], [4.5, -6], [3, -4], [3, -8], [3, -6]].map(([x, z], i) => sph([x, i === 4 ? 9 : 8, z], [2.5, 2, 2.5], 'ochre')),
    cyl([-8, 7, 5], [7, 1, 7], 'ochre', { n: 'nan' }),
    cyl([-8, 7.75, 5], [3, 0.5, 3], 'wood'),
    ...[[10, 3], [11, 5.5]].map(([x, z]) => sph([x, 8, z], [2.5, 2.5, 2.5], 'brick')),
  )),

  // ---------- детали ----------
  e('city', item(
    { id: 'trash_bin', ru: 'урна', kk: 'қоқыс жәшігі', en: 'trash bin', stems: ['урна', 'урну', 'мусор', 'trash'], tags: ['city', 'park', 'street', 'detail'], hold: 'ground', scene: 'detail' },
    cyl([0, 6, 0], [7, 12, 7], 'green', { k: 12, n: 'bin' }),
    ...[3.5, 8.5].map((y) => cyl([0, y, 0], [7.3, 1, 7.3], 'greenSoft', { k: 12 })),
    cyl([0, 12.25, 0], [7.8, 0.5, 7.8], 'greenDark', { k: 12 }),
    sph([0, 12.5, 0], [7.5, 3, 7.5], 'greenDark', { n: 'lid' }),
    box([0, 11, 3.5], [3, 2, 0.5], 'ink'),
    sph([1, 12, 3], [2, 2, 2], 'white', { n: 'paper' }),
    box([-1.5, 0.5, 4.5], [3, 0.5, 2], 'yellow', { r: [0, 30, 0] }),
    cyl([0, 0.25, 0], [9, 0.5, 9], 'grey', { k: 12 }),
  )),
  e('animals', item(
    { id: 'cat_sleeping', ru: 'кот спит', kk: 'ұйықтап жатқан мысық', en: 'sleeping cat', stems: ['дремал', 'мурлык', 'мурчал', 'клубочк', 'sleeping cat'], tags: ['animal', 'home', 'calm', 'sleep', 'cat', 'detail'], hold: 'ground', scene: 'detail', fx: [{ kind: 'bob' }] },
    cyl([0, 0.75, 0], [15, 1.5, 11], 'teal', { k: 16, n: 'pillow' }),
    torus([0, 1.5, 0], [15, 11, 0.8], 'tealDark', { r: [90, 0, 0] }),
    sph([0, 4, 0], [11, 5.5, 8], 'amber', { n: 'body' }),
    ...[-2.5, 0, 2.5].map((x) => box([x, 6.4, -1], [1.2, 1, 5], 'brick', { r: [0, 0, x * 6] })),
    sph([4.5, 4.8, 2.5], [5.4, 4.8, 4.6], 'amber', { n: 'head' }),
    cone([6.3, 7.8, 2.5], [2.8, 3.4, 2], 'amber', { r: [0, 0, -20] }),
    cone([2.7, 7.8, 2.5], [2.8, 3.4, 2], 'amber', { r: [0, 0, 20] }),
    cone([6.2, 7.6, 3.2], [1.4, 2, 0.6], 'coral', { r: [0, 0, -20] }),
    cone([2.8, 7.6, 3.2], [1.4, 2, 0.6], 'coral', { r: [0, 0, 20] }),
    box([5.8, 5, 4.9], [1.4, 0.5, 0.5], 'ink'),
    box([3.2, 5, 4.9], [1.4, 0.5, 0.5], 'ink'),
    box([4.5, 4, 4.9], [0.8, 0.6, 0.5], 'coral'),
    sph([2, 2.5, 4], [3, 2, 2.5], 'cream', { n: 'paw' }),
    cyl([-2, 2.5, 3.8], [2, 9, 2], 'amber', { r: [0, 20, 90], n: 'tail' }),
    sph([-6, 2.5, 2.5], [2.2, 2.2, 2.2], 'brick'),
    ...zz(8.5, 12, 1.2),
    ...zz(11, 15.5, 0.8),
  )),
  e('weather', item(
    { id: 'puddle', ru: 'лужа', kk: 'шалшық', en: 'puddle', stems: ['луж', 'шалшық', 'puddle'], tags: ['weather', 'rain', 'autumn', 'street', 'detail'], hold: 'ground', scene: 'detail', fx: [{ kind: 'drip', at: [2, 7, 1] }] },
    cyl([0, 0.25, 0], [17, 0.5, 11], 'greyBlue', { k: 14, n: 'puddle' }),
    cyl([0.5, 0.5, 0.5], [14, 0.5, 8.5], 'ice', { k: 14 }),
    torus([2, 0.75, 1], [6, 4, 0.5], 'white', { r: [90, 0, 0], n: 'ripple' }),
    torus([2, 0.75, 1], [3, 2, 0.5], 'frost', { r: [90, 0, 0] }),
    ...ring(6, (a) => {
      const q = onXZ(1.8, a, 1.75)
      return cone([q[0] + 2, q[1], q[2] + 1], [0.8, 2.5, 0.8], 'ice', { r: ry(a, 25), n: 'splash' })
    }),
    sph([2, 5, 1], [1.2, 1.8, 1.2], 'ice', { n: 'drop' }),
    sph([-3, 6.5, -1], [1, 1.5, 1], 'ice'),
    sph([-5, 0.5, 3], [2.5, 1, 1.5], 'brown'),
    box([-4.5, 1, -3], [3, 0.5, 1.5], 'amber', { r: [0, 30, 10], n: 'leaf' }),
  )),
  e('weather', item(
    { id: 'snowdrift', ru: 'сугроб', kk: 'көрт', en: 'snowdrift', stems: ['сугроб', 'көрт', 'snowdrift'], tags: ['weather', 'winter', 'cold', 'snow', 'detail'], hold: 'ground', scene: 'detail' },
    // снежная горка: голубая тень, блёстки, цепочка следов по склону, снежок рядом
    sph([0, 1, 0], [20, 2, 13], 'ice'),
    sph([0, 4, 0], [18, 8, 11], 'white', { n: 'snow' }),
    sph([4.5, 6, -1], [10, 9, 8], 'white'),
    sph([-5.5, 4.5, 1], [9, 6.5, 8], 'frost'),
    sph([-1.5, 3, 4.2], [10, 3, 3], 'frost'),
    ...[[-7, 1.4, 5], [-5, 2.6, 4.5], [-3, 3.8, 4.2], [-1, 4.8, 3.8]].map(([x, y, z]) => sph([x, y, z], [1.4, 0.5, 2], 'greyBlue', { r: [20, 30, 0] })),
    ...[[2, 9.6, 2], [-4, 7.4, 3], [6.5, 10.2, 1], [0, 7.8, 4]].map(([x, y, z]) => cone([x, y, z], [1, 1.6, 1], 'ice', { k: 4 })),
    sph([8, 1.6, 4], [3, 3, 3], 'white'),
  )),
  e('nature', item(
    { id: 'leaf_pile', ru: 'листья кучкой', kk: 'жапырақ үйіндісі', en: 'leaf pile', stems: ['листопад', 'куча листьев', 'листву', 'листва', 'leaf pile'], tags: ['nature', 'autumn', 'park', 'detail'], hold: 'ground', scene: 'detail' },
    sph([0, 3, 0], [16, 7, 11], 'ochre', { n: 'pile' }),
    ...([[-5, 4.6, 3, 'brick', 20], [-1, 6, 3.4, 'yellow', -30], [3, 5.4, 3.6, 'brick', 60], [6, 3.6, 3, 'coral', -10], [-3, 6.2, -1, 'brick', 45],
      [2, 6.4, 0, 'yellow', 10], [5, 4.6, -2.5, 'coral', -50], [-6, 3, -2, 'yellow', 80], [0, 4, 5, 'coral', 30], [-8.5, 0.6, 5, 'brick', 15],
      [9, 0.6, 3, 'yellow', -40], [-2, 1, 6.5, 'brick', 70], [4, 1, 5.5, 'yellow', -20]] as const).flatMap(([x, y, z, c, a]) => [
      sph([x, y, z], [4, 0.6, 2.6], c, { r: [15, a, 10] }),
      box([x, y + 0.2, z], [3.6, 0.3, 0.3], 'brownDark', { r: [15, a, 10] }),
    ]),
    ...([[-3, 11, 1, 'brick', 40], [3.5, 13.5, 0, 'yellow', -30], [0.5, 16, -1, 'coral', 60]] as const).map(([x, y, z, c, a]) => sph([x, y, z], [3.6, 0.6, 2.4], c, { r: [70, a, 30] })),
  )),
  e('study', item(
    { id: 'book_stack', ru: 'стопка книг', kk: 'кітаптар', en: 'book stack', stems: ['стопк', 'учебник', 'конспект', 'book stack'], tags: ['study', 'school', 'home', 'calm', 'detail'], hold: 'ground', scene: 'detail' },
    box([0, 1, 0], [12, 2, 8.5], 'brick', { n: 'book' }),
    box([0.5, 1, 0.2], [11, 1.4, 8.5], 'cream'),
    box([0.5, 3, 0], [11, 2, 8], 'navy', { r: [0, 8, 0] }),
    box([1, 3, 0.2], [10, 1.4, 8], 'cream', { r: [0, 8, 0] }),
    box([-0.3, 4.75, 0], [11, 1.5, 7.5], 'green', { r: [0, -6, 0] }),
    box([0.2, 4.75, 0.2], [10, 1, 7.5], 'cream', { r: [0, -6, 0] }),
    box([0.2, 6.5, 0], [9.5, 2, 7], 'amber', { r: [0, 12, 0] }),
    box([0.7, 6.5, 0.2], [8.5, 1.4, 7], 'cream', { r: [0, 12, 0] }),
    box([-5.4, 3, 3.5], [0.5, 2, 1], 'yellow', { r: [0, 8, 0] }),
    cyl([2, 9, 1], [3.5, 3, 3.5], 'white', { n: 'mug' }),
    cyl([2, 10.25, 1], [3, 0.5, 3], 'brown'),
    torus([4, 9, 1], [2, 2.2, 0.6], 'white'),
    box([-2.5, 8, 2], [4, 0.5, 0.6], 'ink', { r: [0, 20, 0] }),
  )),
  e('holiday', item(
    { id: 'balloon_bunch', ru: 'связка шариков', kk: 'шарлар', en: 'balloons', stems: ['шарики', 'связк', 'balloons'], tags: ['holiday', 'birthday', 'joy', 'kids', 'detail'], hold: 'ground', scene: 'detail', fx: [{ kind: 'bob' }] },
    box([0, 1.5, 0], [3.5, 3, 3.5], 'teal', { n: 'weight' }),
    box([0, 1.5, 0], [3.7, 0.6, 3.7], 'yellow'),
    ...([[-3.5, 'brick'], [-1.2, 'yellow'], [1.2, 'mint'], [3.5, 'peach']] as const).map(([x], i) => box([x / 2, 8.5 - (i % 2), 0], [0.4, 10, 0.4], 'cream', { r: [0, 0, -x * 3] })),
    ...([[-4, 15.5, 0, 'brick'], [-1.5, 17.5, -1, 'yellow'], [1.5, 15, 1, 'mint'], [4, 17, -0.5, 'peach'], [0, 19.5, 0, 'coral']] as const).map(([x, y, z, c]) =>
      sph([x, y, z], [4.5, 5, 4.5], c, { n: 'balloon' })),
    ...([[-5, 16.5], [-2.5, 18.7], [0.5, 16.2], [3, 18.2], [-1, 20.8]] as const).map(([x, y]) => sph([x, y, 2.2], [0.8, 1.2, 0.5], 'white')),
  )),
]
