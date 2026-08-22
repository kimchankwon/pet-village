import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Authenticated, Unauthenticated, AuthLoading, useConvex, useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '../convex/_generated/api';
import { AuthPanel } from './ui/AuthPanel';
import { startGame } from './game/startGame';
import { State, MULTIPLAYER_PROFILE_CHANGED_EVENT, type SaveData } from './systems/GameState';
import { applyPenguinColor, PENGUIN_COLORS } from './sprites/pixelart';
import { migratePetSpecies } from './systems/pets';
import { blockUi, resetUiBlock, setLeaveHandler, unblockUi } from './systems/nav';
import type Phaser from 'phaser';
import { APP_VERSION } from './appVersion';
import { connectMultiplayer, pushVillageSnapshot, type MultiplayerConnection, type VillageSnapshot } from './systems/multiplayerClient';
import { multiplayerBridge } from './systems/multiplayerBridge';
import { setConvexWorldClient } from './systems/convexWorld';
import { setSledServerSnapshot } from './systems/sledRunClient';
import { validateProfileNames } from './systems/profileNameRules';
import { setLocalDisplayName } from './systems/localProfile';
import { beginTextEntry, endTextEntry, textEntryKeyAction } from './systems/textEntry';

// Game-styled confirmation dialog. ESC cancels via a capture-phase listener
// with stopPropagation so Phaser's own window keydown listener doesn't also
// see it (and e.g. reopen the pause menu underneath).
function ConfirmModal({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onCancel();
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  return (
    <div className="confirm-dim" onClick={onCancel}>
      <div className="confirm-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="confirm-actions">
          <button type="button" className="btn ghost" onClick={onCancel}>
            Back to game
          </button>
          <button type="button" className="btn danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function NamesModal({
  initialPlayerName,
  onSave,
  onBack,
}: {
  initialPlayerName: string;
  onSave: (displayName: string, petName: string) => Promise<void>;
  onBack: () => void;
}) {
  const [displayName, setDisplayName] = useState(initialPlayerName);
  const [petName, setPetName] = useState(State.data.petName);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Phaser captures WASD / Space / I / P on the window, which swallowed most of
  // what you tried to type in here. Release the capture while the form is open.
  useEffect(() => {
    beginTextEntry();
    return () => endTextEntry();
  }, []);

  async function save() {
    setSaving(true);
    setError('');
    try {
      const names = validateProfileNames(displayName, petName);
      await onSave(names.displayName, names.petName);
      onBack();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save names');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="confirm-dim" onClick={onBack}>
      <form
        className="confirm-card"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        onKeyDown={(event) => {
          const action = textEntryKeyAction(event.key);
          // Escape belongs to the panel's own capture-phase handler, which has
          // already run by the time this fires — let it through. Everything else
          // is typing, so keep it from bubbling out to the shell's listeners.
          if (action === 'close') return;
          event.stopPropagation();
          if (action !== 'save') return;
          event.preventDefault();
          if (!saving) void save();
        }}
      >
        <h2>Change names</h2>
        <label className="name-field">
          Your player name
          {/* Focused on open so the first keystroke lands in the field. */}
          <input autoFocus value={displayName} maxLength={20} autoComplete="off" onChange={(event) => setDisplayName(event.target.value)} />
        </label>
        <label className="name-field">
          Your pet&apos;s name
          <input value={petName} maxLength={16} autoComplete="off" onChange={(event) => setPetName(event.target.value)} />
        </label>
        <p className="form-hint">Enter saves · Esc goes back</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="confirm-actions">
          <button type="button" className="btn ghost" onClick={onBack}>Back</button>
          <button type="submit" className="btn" disabled={saving}>{saving ? 'Saving…' : 'Save names'}</button>
        </div>
      </form>
    </div>
  );
}

function PlayChrome({
  userLabel,
  initialPlayerName = '',
  onLeave,
  leaveLabel,
  exitNote,
  onChangePet,
  onPenguinColor,
  onRename,
  children,
}: {
  userLabel: string;
  initialPlayerName?: string;
  onLeave: () => void;
  leaveLabel: string;
  exitNote: string;
  onChangePet?: () => void;
  onPenguinColor?: (id: string) => void;
  onRename?: (displayName: string, petName: string) => Promise<void>;
  children: ReactNode;
}) {
  // The game menu: root panel, colour picker, or change-pet confirm.
  const [panel, setPanel] = useState<'menu' | 'color' | 'pet' | 'names' | null>(null);
  const [menuIndex, setMenuIndex] = useState(0);

  // ESC in-game and the topbar button both open the menu.
  useEffect(() => {
    setLeaveHandler(() => setPanel('menu'));
    return () => setLeaveHandler(null);
  }, []);

  // While any shell panel is open, the Phaser scenes must stop moving the
  // player (keyboard/joystick input still reaches window listeners behind
  // the modal). blockUi() flips nav.isUiBlocked(), which the scenes gate on.
  useEffect(() => {
    if (!panel) return;
    blockUi();
    return () => unblockUi();
  }, [panel]);

  useEffect(() => {
    if (panel === 'menu') setMenuIndex(0);
  }, [panel]);

  const menuActions: { label: string; danger?: boolean; run: () => void }[] = [
    { label: 'Back to game', run: () => setPanel(null) },
  ];
  if (onRename) {
    menuActions.push({ label: 'Change names', run: () => setPanel('names') });
  }
  if (onPenguinColor) {
    menuActions.push({ label: 'Penguin colour', run: () => setPanel('color') });
  }
  if (onChangePet) {
    menuActions.push({ label: 'Change pet', run: () => setPanel('pet') });
  }
  menuActions.push({ label: leaveLabel, danger: true, run: onLeave });

  // ESC closes; arrows/WASD move; Space/Enter/E confirm (root menu).
  useEffect(() => {
    if (!panel) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (panel === 'color' || panel === 'pet' || panel === 'names') setPanel('menu');
        else setPanel(null);
        return;
      }
      if (panel !== 'menu') return;
      const n = menuActions.length;
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        e.stopPropagation();
        setMenuIndex((i) => (i - 1 + n) % n);
      } else if (
        e.key === 'ArrowDown' ||
        e.key === 's' ||
        e.key === 'S' ||
        e.key === 'ArrowRight' ||
        e.key === 'd' ||
        e.key === 'D'
      ) {
        e.preventDefault();
        e.stopPropagation();
        setMenuIndex((i) => (i + 1) % n);
      } else if (e.key === ' ' || e.key === 'Enter' || e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        e.stopPropagation();
        menuActions[menuIndex]?.run();
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // menuActions is rebuilt each render; length + labels are stable enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, menuIndex, leaveLabel, onLeave, onPenguinColor, onChangePet, onRename]);

  const currentColor = State.data.penguinColor ?? 'blue';

  return (
    <div className="play-shell">
      <header className="topbar">
        <button type="button" className="btn tiny back" onClick={() => setPanel('menu')}>
          Menu
        </button>
        <span className="topbar-brand">Pet Village</span>
        <span className="topbar-user">{userLabel}</span>
      </header>
      {children}
      {panel === 'menu' && (
        <div className="confirm-dim" onClick={() => setPanel(null)}>
          <div className="confirm-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Menu</h2>
            <p>
              {State.data.petName || 'Your pet'} keeps living while you&apos;re away. {exitNote}
            </p>
            <div className="menu-list">
              {menuActions.map((action, i) => (
                <button
                  key={action.label}
                  type="button"
                  className={`btn wide${action.danger ? ' danger' : ' ghost'}${i === menuIndex ? ' menu-selected' : ''}`}
                  onMouseEnter={() => setMenuIndex(i)}
                  onClick={action.run}
                >
                  {action.label}
                </button>
              ))}
            </div>
            <p className="menu-hint">↑↓ / WASD · Space / E · ESC</p>
            <p className="menu-version">v{APP_VERSION}</p>
          </div>
        </div>
      )}
      {panel === 'names' && onRename && (
        <NamesModal
          initialPlayerName={initialPlayerName}
          onSave={onRename}
          onBack={() => setPanel('menu')}
        />
      )}
      {panel === 'color' && onPenguinColor && (
        <div className="confirm-dim" onClick={() => setPanel('menu')}>
          <div className="confirm-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Penguin colour</h2>
            <div className="color-grid">
              {Object.entries(PENGUIN_COLORS).map(([id, def]) => (
                <button
                  key={id}
                  type="button"
                  className={`color-swatch${id === currentColor ? ' current' : ''}`}
                  style={{ background: def.v }}
                  title={def.label}
                  aria-label={def.label}
                  onClick={() => {
                    onPenguinColor(id);
                    setPanel(null);
                  }}
                />
              ))}
            </div>
            <div className="menu-list">
              <button type="button" className="btn ghost wide" onClick={() => setPanel('menu')}>
                Back
              </button>
            </div>
          </div>
        </div>
      )}
      {panel === 'pet' && onChangePet && (
        <ConfirmModal
          title="Change pet?"
          body="You’ll pick a new pet and name. Your coins, house, inventory, scores, and clothes stay."
          confirmLabel="Change pet"
          onConfirm={() => {
            setPanel(null);
            onChangePet();
          }}
          onCancel={() => setPanel('menu')}
        />
      )}
    </div>
  );
}

function CloudGame() {
  const cloudSave = useQuery(api.saves.getMine);
  const upsert = useMutation(api.saves.upsertMine);
  const viewer = useQuery(api.users.viewer);
  const updateNames = useMutation(api.profiles.updateMine);
  const convex = useConvex();
  const villageSnap = useQuery(api.world.snapshot);
  const sledSnap = useQuery(api.sled.snapshot);
  const { signOut } = useAuthActions();
  const [hydrated, setHydrated] = useState(false);
  const [gameKey, setGameKey] = useState(0);
  const hydratedRef = useRef(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const wakeMultiplayerRetryRef = useRef<(() => void) | null>(null);

  // The nametag over your own penguin lives in Phaser, which never sees the
  // Convex profile — publish the name here so it (and renames) reach it.
  useEffect(() => {
    setLocalDisplayName(viewer?.name ?? '');
  }, [viewer?.name]);

  // Hydrate exactly once, from the first cloud snapshot. Every save echoes
  // back through this subscription; re-hydrating from an echo would clobber
  // anything the player did since that (already stale) snapshot was taken.
  useEffect(() => {
    if (cloudSave === undefined || hydratedRef.current) return;
    hydratedRef.current = true;

    if (cloudSave) {
      State.hydrate({
        version: cloudSave.version,
        coins: cloudSave.coins,
        petName: cloudSave.petName,
        petSpecies: migratePetSpecies(cloudSave.petSpecies),
        adopted: cloudSave.adopted,
        pet: cloudSave.pet,
        lastSeen: cloudSave.lastSeen,
        inventory: cloudSave.inventory,
        placed: cloudSave.placed,
        bestPaperToss: cloudSave.bestPaperToss,
        biggestCatch: cloudSave.biggestCatch ?? 0,
        // Keep the better personal best if the device scored offline.
        bestSkipRope: Math.max(State.data.bestSkipRope, cloudSave.bestSkipRope ?? 0),
        ownedAccessories: cloudSave.ownedAccessories as SaveData['ownedAccessories'] | undefined,
        equippedAccessories: cloudSave.equippedAccessories as
          | SaveData['equippedAccessories']
          | undefined,
        penguinColor: cloudSave.penguinColor,
        townPosition: cloudSave.townPosition,
      });
      // hydrate() applied offline decay locally; push that (and the fresh
      // lastSeen) to the cloud so an immediate sign-out can't leave the
      // cloud stale. The saver was registered by the effect below on mount.
      State.save();
    } else {
      void upsert(State.snapshot());
    }
    setHydrated(true);
  }, [cloudSave, upsert]);

  useEffect(() => {
    State.setCloudSaver((data) => {
      void upsert(data)
        .then(({ petName }) => State.applyCanonicalPetName(data.petName, petName))
        .catch((error) => console.warn('Could not save game progress', error));
    });
    State.setAdoptionSaver(async (data) => {
      const { petName } = await upsert(data);
      State.applyCanonicalPetName(data.petName, petName);
    });
    return () => {
      // Flush any pending debounced write before dropping the saver —
      // the other order silently discards it.
      State.flushCloud();
      State.setCloudSaver(null);
      State.setAdoptionSaver(null);
    };
  }, [upsert]);

  useEffect(() => {
    setConvexWorldClient({
      join: (penguinColor) => convex.mutation(api.world.join, { penguinColor }),
      leave: (sessionId) => convex.mutation(api.world.leave, { sessionId }),
      move: (args) => convex.mutation(api.world.move, args),
      setActive: (args) => convex.mutation(api.world.setActive, args),
      setActivity: (sessionId, activity) => convex.mutation(api.world.setActivity, { sessionId, activity }),
      refreshProfile: (sessionId, penguinColor) => convex.mutation(api.world.refreshProfile, { sessionId, penguinColor }),
      wave: (sessionId, targetSessionId) => convex.mutation(api.world.wave, { sessionId, targetSessionId }),
      emote: (sessionId, emote) => convex.mutation(api.world.emote, { sessionId, emote }),
      petEmote: (sessionId, expression) => convex.mutation(api.world.petEmote, { sessionId, expression }),
      chat: (sessionId, text) => convex.mutation(api.world.chat, { sessionId, text }),
      sledJoin: (args) => convex.mutation(api.sled.join, args),
      sledLeave: (sessionId) => convex.mutation(api.sled.leave, { sessionId }),
      sledDifficulty: (sessionId, difficulty) => convex.mutation(api.sled.setDifficulty, { sessionId, difficulty }),
      sledStart: (sessionId) => convex.mutation(api.sled.start, { sessionId }),
      sledInput: (sessionId, steering, seq) => convex.mutation(api.sled.input, { sessionId, steering, seq }),
      sledHit: (sessionId, itemId) => convex.mutation(api.sled.hit, { sessionId, itemId }),
    });
    return () => setConvexWorldClient(null);
  }, [convex]);

  useEffect(() => {
    pushVillageSnapshot((villageSnap as VillageSnapshot | null | undefined) ?? null);
  }, [villageSnap]);

  useEffect(() => {
    setSledServerSnapshot(sledSnap ?? null);
  }, [sledSnap]);

  useEffect(() => {
    if (!hydrated) return;

    let cancelled = false;
    let connection: MultiplayerConnection | undefined;
    const isCurrent = () => !cancelled;

    void (async () => {
      let delayMs = 1_000;
      while (!cancelled) {
        try {
          connection = await connectMultiplayer(State.data.penguinColor ?? 'blue', isCurrent);
          delayMs = 1_000;
          await connection.closed;
          connection = undefined;
        } catch (error) {
          if (!cancelled && !(error instanceof Error && error.message === 'Stale multiplayer connection')) {
            console.warn('Multiplayer unavailable; retrying in solo mode', error);
          }
        }
        if (!cancelled) {
          await new Promise<void>((resolve) => {
            let settled = false;
            const finish = () => {
              if (settled) return;
              settled = true;
              window.clearTimeout(timer);
              if (wakeMultiplayerRetryRef.current === finish) wakeMultiplayerRetryRef.current = null;
              resolve();
            };
            const timer = window.setTimeout(finish, delayMs);
            wakeMultiplayerRetryRef.current = finish;
          });
          delayMs = Math.min(delayMs * 2, 10_000);
        }
      }
    })();

    return () => {
      cancelled = true;
      wakeMultiplayerRetryRef.current?.();
      wakeMultiplayerRetryRef.current = null;
      void connection?.disconnect();
    };
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    let publishTimer: number | null = null;
    const publish = () => {
      if (publishTimer !== null) window.clearTimeout(publishTimer);
      publishTimer = window.setTimeout(() => {
        publishTimer = null;
        void (async () => {
          const snapshot = State.snapshot();
          const { petName } = await upsert(snapshot);
          State.applyCanonicalPetName(snapshot.petName, petName);
          multiplayerBridge.updateProfile('convex');
          // If ticket admission was backing off (for example while the player was
          // still on the adoption screen), retry immediately now that the
          // canonical profile exists.
          wakeMultiplayerRetryRef.current?.();
        })().catch((error) => console.warn('Could not publish pet profile update', error));
      }, 250);
    };
    window.addEventListener(MULTIPLAYER_PROFILE_CHANGED_EVENT, publish);
    return () => {
      window.removeEventListener(MULTIPLAYER_PROFILE_CHANGED_EVENT, publish);
      if (publishTimer !== null) window.clearTimeout(publishTimer);
    };
  }, [hydrated, upsert]);

  useEffect(() => {
    if (!hydrated || !hostRef.current) return;
    resetUiBlock();
    // Only a full application launch may restore a durable Town pose. A
    // change-pet remount keeps the existing multiplayer room/sequence and must
    // re-enter at a server-approved spawn instead.
    const game = startGame(hostRef.current, { restoreTownPosition: gameKey === 0 });
    gameRef.current = game;
    return () => {
      game.destroy(true);
      gameRef.current = null;
      resetUiBlock();
    };
  }, [hydrated, gameKey]);

  // Swap the penguin's colourway on the running game; scenes rebind their
  // sprites to the regenerated textures on the next frame.
  function penguinColor(id: string) {
    State.setPenguinColor(id);
    const scene = gameRef.current?.scene.getScenes(true)[0];
    if (scene) applyPenguinColor(scene, id);
    void (async () => {
      await upsert(State.snapshot());
      multiplayerBridge.updateProfile('convex');
    })().catch((error) => console.warn('Could not publish penguin colour update', error));
  }

  async function rename(displayName: string, petName: string) {
    const saved = await updateNames({ displayName, petName });
    State.renamePet(saved.petName);
    await upsert(State.snapshot());
    multiplayerBridge.updateProfile('convex');
  }

  // Return to adopt without wiping the village; push the adopt=false
  // snapshot so cloud matches. Hydration is one-shot, so the echo is fine.
  function changePet() {
    gameRef.current?.destroy(true);
    gameRef.current = null;
    State.resetToPetSelect();
    State.save();
    State.flushCloud();
    setGameKey((k) => k + 1);
  }

  if (cloudSave === undefined || !hydrated) {
    return (
      <div className="boot">
        <div className="boot-stack">
          <p className="boot-title">PET VILLAGE</p>
          <p className="boot-status">Loading your village…</p>
          <div className="boot-bar" aria-hidden>
            <div className="boot-bar-fill" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <PlayChrome
      userLabel={viewer?.name ?? 'Signed in'}
      initialPlayerName={viewer?.name ?? ''}
      leaveLabel="Sign out"
      exitNote="Your village is synced to the cloud."
      onLeave={() => {
        // save() persists locally and arms the cloud debounce; flushCloud()
        // fires it now, so hydrated decay reaches the cloud before sign-out.
        State.save();
        State.flushCloud();
        void signOut();
      }}
      onChangePet={changePet}
      onPenguinColor={penguinColor}
      onRename={rename}
    >
      <div ref={hostRef} id="game" className="game-host" />
    </PlayChrome>
  );
}

function GuestGame({ onBack }: { onBack: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [gameKey, setGameKey] = useState(0);

  useEffect(() => {
    State.setCloudSaver(null);
    State.setAdoptionSaver(null);
    // Guests have no profile name; the nametag falls back to "You".
    setLocalDisplayName('');
    if (!hostRef.current) return;
    resetUiBlock();
    const game = startGame(hostRef.current, { restoreTownPosition: gameKey === 0 });
    gameRef.current = game;
    return () => {
      game.destroy(true);
      gameRef.current = null;
      resetUiBlock();
    };
  }, [gameKey]);

  function penguinColor(id: string) {
    State.setPenguinColor(id);
    const scene = gameRef.current?.scene.getScenes(true)[0];
    if (scene) applyPenguinColor(scene, id);
  }

  // PlayChrome's "Change pet?" modal has already confirmed by the time
  // this runs. Guest saves are local-only, so no cloud write here.
  function changePet() {
    gameRef.current?.destroy(true);
    gameRef.current = null;
    State.resetToPetSelect();
    setGameKey((k) => k + 1);
  }

  return (
    <PlayChrome
      userLabel="Guest · local save"
      leaveLabel="Sign in"
      exitNote="Your progress is saved on this device."
      onLeave={onBack}
      onChangePet={changePet}
      onPenguinColor={penguinColor}
    >
      <div ref={hostRef} id="game" className="game-host" />
    </PlayChrome>
  );
}

export function App() {
  const { isAuthenticated } = useConvexAuth();
  const [guest, setGuest] = useState(false);

  if (guest && !isAuthenticated) {
    return <GuestGame onBack={() => setGuest(false)} />;
  }

  return (
    <>
      <AuthLoading>
        <div className="boot">
          <div className="boot-stack">
            <p className="boot-title">PET VILLAGE</p>
            <p className="boot-status">Checking session…</p>
            <div className="boot-bar" aria-hidden>
              <div className="boot-bar-fill" />
            </div>
          </div>
        </div>
      </AuthLoading>
      <Unauthenticated>
        <AuthPanel onGuest={() => setGuest(true)} />
      </Unauthenticated>
      <Authenticated>
        <CloudGame />
      </Authenticated>
    </>
  );
}
