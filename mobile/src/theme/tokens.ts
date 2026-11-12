export const colors = {
  blue: "#2457C5",
  green: "#48A878",
  background: "#F8F9FC",
  red: "#DC3545",
  ink: "#172B4D",
  muted: "#53627A",
  pale: "#EAF0FF",
  line: "#DFE5EF",
  white: "#FFFFFF",
  mint: "#E9F5EE",
  rose: "#FDECEF",
} as const;

export const typography = {
  family: "Inter",
  weights: { regular: "400", medium: "500", semibold: "600", bold: "700" },
  sizes: [14, 16, 18, 20, 24, 28, 36] as const,
  seniorBody: 20,
} as const;

export const spacing = { unit: 8, grid: [8, 16, 24] as const } as const;
export const radii = { cardMin: 16, cardMax: 24, control: 16 } as const;
export const touchTargets = { primaryHeight: 64 } as const;

