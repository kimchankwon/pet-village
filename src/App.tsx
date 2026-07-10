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
  children,
}: {
  userLabel: string;
  onLeave: () => void;
  leaveLabel: string;
  children: ReactNode;
}) {
  useEffect(() => {
    setLeaveHandler(onLeave);
    return () => setLeaveHandler(null);
  }, [onLeave]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      // Phaser scenes handle Escape for menus / nested rooms; this is a fallback
      // when focus is outside the canvas (e.g. topbar).
      if (e.target instanceof HTMLElement && e.target.closest('.game-host')) return;
      onLeave();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onLeave]);

  return (
    <div className="play-shell">
      <header className="topbar">
        <button type="button" className="btn tiny back" onClick={onLeave}>
          ← Back
        </button>
        <span className="topbar-brand">Pet Village</span>
        <span className="topbar-user">{userLabel}</span>
        <button type="button" className="btn tiny" onClick={onLeave}>
          {leaveLabel}
        </button>
      </header>
      {children}
    </div>
  );
}

function CloudGame() {
  const cloudSave = useQuery(api.saves.getMine);
  const upsert = useMutation(api.saves.upsertMine);
  const viewer = useQuery(api.users.viewer);
  const { signOut } = useAuthActions();
  const [hydrated, setHydrated] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (cloudSave === undefined) return;

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
    } else {
      void upsert(State.snapshot());
    }

    State.setCloudSaver((data) => {
      void upsert(data);
    });
    setHydrated(true);

    return () => {
      State.setCloudSaver(null);
      State.flushCloud();
    };
  }, [cloudSave, upsert]);

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
      onLeave={() => {
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
  }, []);

  return (
    <PlayChrome userLabel="Guest · local save" leaveLabel="Sign in" onLeave={onBack}>
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
