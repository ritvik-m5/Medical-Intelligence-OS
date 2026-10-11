import { readFileSync } from 'node:fs';

const app = readFileSync('src/App.tsx', 'utf8');
const sidebar = readFileSync('src/components/Sidebar.tsx', 'utf8');
const store = readFileSync('src/state/store.tsx', 'utf8');

const routes = [...app.matchAll(/case '([a-z]+)':/g)].map((m) => m[1]);
const nav = [...sidebar.matchAll(/id: '([a-z]+)'/g)].map((m) => m[1]);
const idsBlock = store.slice(store.indexOf('export type ViewId'), store.indexOf('export interface EvidenceRequest'));
const ids = [...idsBlock.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);

console.log('ViewId   :', ids.length, ids.join(' '));
console.log('nav      :', nav.length, nav.join(' '));
console.log('routes   :', routes.length, routes.join(' '));

const missingNav = ids.filter((id) => !nav.includes(id));
const missingRoute = ids.filter((id) => !routes.includes(id) && id !== 'builder');
const navNotId = nav.filter((id) => !ids.includes(id));

console.log('\nin ViewId but not in the sidebar :', missingNav.length ? missingNav.join(' ') : '(none)');
console.log('in ViewId with no route          :', missingRoute.length ? missingRoute.join(' ') : '(none)');
console.log('in the sidebar but not a ViewId  :', navNotId.length ? navNotId.join(' ') : '(none)');
