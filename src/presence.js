import { on } from './platform/net.js';

let state = { total: 0, games: {} };

on('presence', (m) => { state = { total: m.total || 0, games: m.games || {} }; });
on('connection', (c) => { if (!c.online) state = { total: 0, games: {} }; });

export const getOnline = (id) => state.games[id] || 0;
export const getTotal = () => state.total;
