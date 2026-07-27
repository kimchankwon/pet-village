type TicketIssuer = () => Promise<string>;
let issuer: TicketIssuer | null = null;

export function setMultiplayerTicketIssuer(next: TicketIssuer | null) {
  issuer = next;
}

export async function requestMultiplayerTicket() {
  if (!issuer) throw new Error('Multiplayer ticket issuer is unavailable');
  return issuer();
}

export function hasMultiplayerTicketIssuer() {
  return issuer !== null;
}
