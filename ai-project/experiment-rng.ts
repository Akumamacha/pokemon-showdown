import { createHash } from 'node:crypto';
import { PRNG, type PRNGSeed } from '../sim/prng';

export const SEED_SCHEME = 'wp01-sha256-gen5-v1';

/**
 * Experiment Seedと用途をJSON配列で区切り、SHA-256の先頭64bitを既存Gen5 PRNGへ渡す。
 * 用途・世代・試合を分離するため、別世代の乱数消費量が変わってもseedはずれない。
 * ハッシュはseed導出だけに使用し、独自の乱数器は実装しない。
 */
export function deriveSeed(experimentSeed: string, ...path: (string | number)[]): PRNGSeed {
	if (typeof experimentSeed !== 'string' || !experimentSeed.trim()) {
		throw new Error('Experiment Seedを空でない文字列で指定してください');
	}
	const hex = createHash('sha256').update(JSON.stringify([SEED_SCHEME, experimentSeed, ...path])).digest('hex');
	return `gen5,${hex.slice(0, 16)}`;
}

export function experimentRNG(experimentSeed: string, ...path: (string | number)[]): PRNG {
	return new PRNG(deriveSeed(experimentSeed, ...path));
}
