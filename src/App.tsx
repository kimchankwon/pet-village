import { useEffect, useRef, useState } from 'react';
import { Authenticated, Unauthenticated, AuthLoading, useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '../convex/_generated/api';
import { AuthPanel } from './ui/AuthPanel';
import { startGame } from './game/startGame';
import { State } from './systems/GameState';
import type Phaser from 'phaser';

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
    const game = startGame(hostRef.current);
    gameRef.current = game;
    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [hydrated]);

  if (cloudSave === undefined || !hydrated) {
    return <div className="boot">Loading your village…</div>;
  }

  return (
    <div className="play-shell">
      <header className="topbar">
        <span className="topbar-brand">Pet Village</span>
        <span className="topbar-user">{viewer?.email ?? 'Signed in'}</span>
        <button type="button" className="btn tiny" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>
      <div ref={hostRef} id="game" className="game-host" />
    </div>
  );
}

function GuestGame({ onBack }: { onBack: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    State.setCloudSaver(null);
    if (!hostRef.current) return;
    const game = startGame(hostRef.current);
    gameRef.current = game;
    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div className="play-shell">
      <header className="topbar">
        <span className="topbar-brand">Pet Village</span>
        <span className="topbar-user">Guest · local save</span>
        <button type="button" className="btn tiny" onClick={onBack}>
          Sign in
        </button>
      </header>
      <div ref={hostRef} id="game" className="game-host" />
    </div>
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
