import test from 'node:test';
import assert from 'node:assert/strict';
import { interpolatePresence, shouldSendPresence } from '../../src/systems/multiplayerPolicy.ts';
const base={x:100,y:100,facing:'down',moving:false,sentAt:1000};
test('client publishes movement at 10Hz and unchanged heartbeat at two seconds',()=>{assert.equal(shouldSendPresence(base,{...base,x:110},1099,1000),false);assert.equal(shouldSendPresence(base,{...base,x:110},1100,1000),true);assert.equal(shouldSendPresence(base,base,3000,1000),true);});
test('interpolation clamps and never extrapolates',()=>{assert.deepEqual(interpolatePresence({x:0,y:10},{x:100,y:30},.25),{x:25,y:15});assert.deepEqual(interpolatePresence({x:0,y:10},{x:100,y:30},2),{x:100,y:30});});
