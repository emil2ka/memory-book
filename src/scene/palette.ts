/** Мастер-палитра, 32 цвета. Всё, что рисуется в сцене, берёт цвета отсюда. */
export const PALETTE = {
  ink: 0x1b1410,
  brownDark: 0x3a2618,
  brown: 0x5c3b22,
  wood: 0x8a5a33,
  woodLight: 0xb07a45,
  ochre: 0xc9953d,
  amber: 0xe8b04a,
  yellow: 0xf4d675,
  cream: 0xf3e6c8,
  paper: 0xe9d9b4,
  paperShade: 0xcbb78d,
  white: 0xfbf6ea,
  brickDark: 0x7a2e24,
  brick: 0xb5432f,
  coral: 0xe0745a,
  peach: 0xf2a983,
  greenDark: 0x2f4a36,
  green: 0x55784a,
  greenSoft: 0x8fa868,
  mint: 0xc3d39a,
  tealDark: 0x1f4a50,
  teal: 0x3b8483,
  navy: 0x18223a,
  slateDark: 0x2c3b58,
  slate: 0x4a6285,
  greyBlue: 0x7f97b3,
  ice: 0xbcd3e3,
  frost: 0xe3f0f5,
  plum: 0x4a2a45,
  mauve: 0x8a5a7c,
  grey: 0x8c8478,
  greyLight: 0xbfb7a6,
} as const

export type PaletteName = keyof typeof PALETTE

export const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`
