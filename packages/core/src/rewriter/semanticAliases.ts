import { NamedToken, TokensLockFile } from '../types';

const TOKEN_NAME_RE = /^[a-z][a-z0-9-_]*$/i;

export function applySemanticAlias(
  lock: TokensLockFile,
  primitiveName: string,
  semanticName: string
): TokensLockFile {
  const name = semanticName.replace(/^--+/, '').trim();
  if (!TOKEN_NAME_RE.test(name)) {
    throw new Error(`Invalid semantic name "${semanticName}". Use letters, numbers, dashes, or underscores.`);
  }
  return {
    ...lock,
    semanticAliases: {
      ...(lock.semanticAliases ?? {}),
      [primitiveName]: name,
    },
  };
}

export function applySemanticAliasesToTokens(
  tokens: NamedToken[],
  aliases: Record<string, string> | undefined
): NamedToken[] {
  if (!aliases) return tokens;
  return tokens.map((token) => (
    aliases[token.name] ? { ...token, semanticName: aliases[token.name] } : token
  ));
}
