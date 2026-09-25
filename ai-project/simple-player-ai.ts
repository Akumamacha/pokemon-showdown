import { RandomPlayerAI } from '../sim/tools/random-player-ai';

export class SimplePlayerAI extends RandomPlayerAI {
	protected override chooseMove(
		active: AnyObject,
		moves: { choice: string, move: AnyObject }[]
	): string {
		return moves[0].choice;
	}

	protected override chooseTeamPreview(team: AnyObject[]): string {
		return 'team 256';
	}
}