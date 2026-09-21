import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {it,expect,vi} from 'vitest';
type BridgeWindow = { nexdoAnalytics?: { logEvent(name:string, parameters?:Record<string,unknown>):boolean }; webkit?: {messageHandlers:{firebase:{postMessage(value:unknown):void}}} };
const script=readFileSync('public/firebase-bridge.js','utf8');
it('does nothing in an ordinary browser',()=>{
 const window:BridgeWindow={};runInNewContext(script,{window});
 expect(window.nexdoAnalytics!.logEvent('screen_open')).toBe(false);
});
it('forwards the supplied logEvent contract to the native handler',()=>{
 const postMessage=vi.fn();const window:BridgeWindow={webkit:{messageHandlers:{firebase:{postMessage}}}};
 runInNewContext(script,{window});expect(window.nexdoAnalytics!.logEvent('shopping_open',{item_count:2})).toBe(true);
 expect(postMessage).toHaveBeenCalledWith({command:'logEvent',name:'shopping_open',parameters:{item_count:2}});
});
it('does not break a page when the native handler is unavailable',()=>{
 const window:BridgeWindow={webkit:{messageHandlers:{firebase:{postMessage(){throw Error('closed')}}}}};
 runInNewContext(script,{window});expect(window.nexdoAnalytics!.logEvent('event')).toBe(false);
});
