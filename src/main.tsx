import { createRoot } from 'react-dom/client';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { ConvexReactClient } from 'convex/react';
import { App } from './App';
import './styles.css';

const url = import.meta.env.VITE_CONVEX_URL;
if (!url) {
  throw new Error('Missing VITE_CONVEX_URL — run `npx convex dev` and check .env.local');
}

const convex = new ConvexReactClient(url);

createRoot(document.getElementById('root')!).render(
  <ConvexAuthProvider client={convex}>
    <App />
  </ConvexAuthProvider>,
);
