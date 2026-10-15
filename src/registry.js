import artillery from './games/artillery/index.js';
import connect4 from './games/connect4/index.js';
import chess from './games/chess/index.js';
import checkers from './games/checkers/index.js';

// Adding a game to the platform = import it and add it here.
export const GAMES = [artillery, connect4, chess, checkers];
