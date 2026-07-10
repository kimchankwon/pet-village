import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Authenticated, Unauthenticated, AuthLoading, useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '../convex/_generated/api';
import { AuthPanel } from './ui/AuthPanel';
import { startGame } from './game/startGame';
import { State } from './systems/GameState';
import { resetUiBlock, setLeaveHandler } from './systems/nav';
import type Phaser from 'phaser';

function PlayChrome({
  userLabel,
  onLeave,
  leaveLabel,
  exitNote,
  onChangePet,
  children,
}: {
  userLabel: string;
  onLeave: () => void;
  leaveLabel: string;
  exitNote: string;
  onChangePet?: () => void;
  children: ReactNode;
}) {
  const [confirmExit, setConfirmExit] = useState(false);

  // Every exit path (topbar buttons, pause-menu "Exit game") goes through a
  // game-styled confirmation modal before actually leaving.
  useEffect(() => {
    setLeaveHandler(() => setConfirmExit(true));
    return () => setLeaveHandler(null);
  }, []);

  // ESC closes the modal. Capture phase + stopPropagation so Phaser's own
  // window keydown listener doesn't also see it and reopen the pause menu.
  useEffect(() => {
    if (!confirmExit) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setConfirmExit(false);
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [confirmExit]);

  // No window-level ESC fallback here: the canvas is never the focus target,
  // so a keydown fallback would fire on every ESC and exit the game outright.
  // ESC is owned by the Phaser scenes (menus, house, and the pause menu).

  return (
    <div className="play-shell">
      <header className="topbar">
        <button type="button" className="btn tiny back" onClick={() => setConfirmExit(true)}>
          ← Back
        </button>
        <span className="topbar-brand">Pet Village</span>
        <span className="topbar-user">{userLabel}</span>
        {onChangePet && (
          <button type="button" className="btn tiny" onClick={onChangePet}>
            Change pet
          </button>
        )}
        <button type="button" className="btn tiny" onClick={() => setConfirmExit(true)}>
          {leaveLabel}
        </button>
      </header>
      {children}
      {confirmExit && (
        <div className="confirm-dim" onClick={() => setConfirmExit(false)}>
          <div
            className="confirm-card"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Exit game?</h2>
            <p>
              {State.data.petName || 'Your pet'} keeps living while you&apos;re away. {exitNote}
            </p>
            <div className="confirm-actions">
              <button type="button" className="btn ghost" onClick={() => setConfirmExit(false)}>
                Back to game
              </button>
              <button type="button" className="btn danger" onClick={onLeave}>
                {leaveLabel}
              </button>
            </div>
          </div>
        </div>
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
  }, [hydrated]);

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

  function changePet() {
    if (!window.confirm('Reset your guest save and choose a new pet?')) return;
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
