export const PRESENCE_SEND_MS=100;export const PRESENCE_HEARTBEAT_MS=2_000;
export type PresencePose={x:number;y:number;facing:'up'|'down'|'side';moving:boolean;sentAt:number};
export function shouldSendPresence(previous:PresencePose,next:PresencePose,now:number,lastSentAt:number){if(now-lastSentAt>=PRESENCE_HEARTBEAT_MS)return true;if(now-lastSentAt<PRESENCE_SEND_MS)return false;return previous.x!==next.x||previous.y!==next.y||previous.facing!==next.facing||previous.moving!==next.moving;}
export function interpolatePresence(from:{x:number;y:number},to:{x:number;y:number},alpha:number){const t=Math.max(0,Math.min(1,alpha));return{x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t};}
