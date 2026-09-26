import { RandomPlayerAI } from '../sim/tools/random-player-ai';

export class SimplePlayerAI extends RandomPlayerAI {
	// Showdown側がdisabled等を除いた合法候補を渡す。PP・相性を独自判定せず、
	// 先頭候補を選ぶ既存の最小方針を維持する（Struggleも候補として渡される）。
	// 通常/強制交代と乱数管理は親クラスを再利用する。
	protected override chooseMove(
		active: AnyObject,
		moves: { choice: string, move: AnyObject }[]
	): string {
		return moves[0].choice;
	}

	protected override chooseTeamPreview(team: AnyObject[]): string {
		// legacy互換専用。first-legal/defaultはcreatePlayerOptions側で独立に指定する。
		return 'team 256';
	}
}
