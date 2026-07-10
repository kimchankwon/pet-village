export type PetSpecies = 'mametchi' | 'kuchipatchi';

export const PET_SPECIES: Record<
  PetSpecies,
  { id: PetSpecies; label: string; defaultName: string; blurb: string }
> = {
  mametchi: {
    id: 'mametchi',
    label: 'Mametchi',
    defaultName: 'Mochi',
    blurb: 'Curious inventor · loves gadgets',
  },
  kuchipatchi: {
    id: 'kuchipatchi',
    label: 'Kuchipatchi',
    defaultName: 'Patchi',
    blurb: 'Hungry goofball · loves snacks',
  },
};

export const PET_SPECIES_LIST = Object.values(PET_SPECIES);

/** File stem under public/assets/pet/<species>/ */
export const PET_ASSET_FILES = [
  'neutral1',
  'neutral2',
  'walk1',
  'walk2',
  'sad',
  'happy',
  'sleep',
  'jump',
] as const;

export type PetPose = 'idle1' | 'idle2' | 'walk1' | 'walk2' | 'sad' | 'happy' | 'sleep' | 'jump';

const FILE_TO_POSE: Record<(typeof PET_ASSET_FILES)[number], PetPose> = {
  neutral1: 'idle1',
  neutral2: 'idle2',
  walk1: 'walk1',
  walk2: 'walk2',
  sad: 'sad',
  happy: 'happy',
  sleep: 'sleep',
  jump: 'jump',
};

export function petTextureKey(species: PetSpecies, pose: PetPose): string {
  return `${species}-${pose}`;
}

export function petAnimKey(species: PetSpecies, kind: 'bounce' | 'walk'): string {
  return `${species}-${kind}`;
}

export function petAssetPath(species: PetSpecies, file: (typeof PET_ASSET_FILES)[number]): string {
  return `assets/pet/${species}/${file}.png`;
}

export function poseFromAssetFile(file: (typeof PET_ASSET_FILES)[number]): PetPose {
  return FILE_TO_POSE[file];
}

export function isPetSpecies(value: unknown): value is PetSpecies {
  return value === 'mametchi' || value === 'kuchipatchi';
}
