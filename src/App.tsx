import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Authenticated, Unauthenticated, AuthLoading, useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '../convex/_generated/api';
import { AuthPanel } from './ui/AuthPanel';
import { startGame } from './game/startGame';
import { State, type SaveData } from './systems/GameState';
import { applyPenguinColor, PENGUIN_COLORS } from './sprites/pixelart';
import { blockUi, resetUiBlock, setLeaveHandler, unblockUi } from './systems/nav';
import type Phaser from 'phaser';

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

function PlayChrome({
  userLabel,
  onLeave,
  leaveLabel,
  exitNote,
  onChangePet,
  onPenguinColor,
  children,
}: {
  userLabel: string;
  onLeave: () => void;
  leaveLabel: string;
  exitNote: string;
  onChangePet?: () => void;
  onPenguinColor?: (id: string) => void;
  children: ReactNode;
}) {
  // The game menu: root panel, colour picker, or change-pet confirm.
  const [panel, setPanel] = useState<'menu' | 'color' | 'pet' | null>(null);
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
        if (panel === 'color' || panel === 'pet') setPanel('menu');
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
  }, [panel, menuIndex, leaveLabel, onLeave, onPenguinColor, onChangePet]);

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
          </div>
        </div>
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
  const { signOut } = useAuthActions();
  const [hydrated, setHydrated] = useState(false);
  const [gameKey, setGameKey] = useState(0);
  const hydratedRef = useRef(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

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
        petSpecies: cloudSave.petSpecies,
        adopted: cloudSave.adopted,
        pet: cloudSave.pet,
        lastSeen: cloudSave.lastSeen,
        inventory: cloudSave.inventory,
        placed: cloudSave.placed,
        bestPaperToss: cloudSave.bestPaperToss,
        biggestCatch: cloudSave.biggestCatch ?? 0,
        ownedAccessories: cloudSave.ownedAccessories as SaveData['ownedAccessories'] | undefined,
        equippedAccessories: cloudSave.equippedAccessories as
          | SaveData['equippedAccessories']
          | undefined,
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
      void upsert(data);
    });
    return () => {
      // Flush any pending debounced write before dropping the saver —
      // the other order silently discards it.
      State.flushCloud();
      State.setCloudSaver(null);
    };
  }, [upsert]);

  useEffect(() => {
    if (!hydrated || !hostRef.current) return;
    resetUiBlock();
    const game = startGame(hostRef.current);
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
    return <div className="boot">Loading your village…</div>;
  }

  return (
    <PlayChrome
      userLabel={viewer?.email ?? 'Signed in'}
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
    if (!hostRef.current) return;
    resetUiBlock();
    const game = startGame(hostRef.current);
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
        <div className="boot">Checking session…</div>
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
