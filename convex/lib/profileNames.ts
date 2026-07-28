export type ProfileNames = { displayName: string; petName: string };

const SAFE_NAME = /^[\p{L}\p{N}][\p{L}\p{N} _'-]*$/u;

export function profileNameKey(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function clean(value: string, kind: 'player' | 'pet') {
  const name = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  const min = kind === 'player' ? 2 : 1;
  const max = kind === 'player' ? 20 : 16;
  if (name.length < min || name.length > max || !SAFE_NAME.test(name)) {
    throw new Error(
      kind === 'player'
        ? 'Player name must be 2–20 letters, numbers, spaces, apostrophes, hyphens, or underscores'
        : 'Pet name must be 1–16 letters, numbers, spaces, apostrophes, hyphens, or underscores',
    );
  }
  return name;
}

export function validateDisplayName(value: string) {
  return clean(value, 'player');
}

export function validatePetName(value: string) {
  return clean(value, 'pet');
}

export function validateProfileNames(displayName: string, petName: string): ProfileNames {
  return { displayName: validateDisplayName(displayName), petName: validatePetName(petName) };
}

export function assertProfileNamesAvailable(
  currentUserId: string,
  playerOwnerId?: string,
  petOwnerId?: string,
) {
  if (playerOwnerId && playerOwnerId !== currentUserId) {
    throw new Error('That player name is already taken');
  }
  if (petOwnerId && petOwnerId !== currentUserId) {
    throw new Error('That pet name is already taken');
  }
}
