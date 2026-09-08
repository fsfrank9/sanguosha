import assert from 'node:assert/strict';

// A tiny lexical reader for structural audit assertions. Comments disappear,
// strings remain one token, and braces inside either never delimit a function.
// This is deliberately not a JavaScript parser or a production dependency.
export function codeTokens(source) {
  return source.match(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|===|!==|=>|==|!=|<=|>=|&&|\|\||\+\+|--|\+=|-=|\?\.|\S/g)
    ?.filter(token => !token.startsWith('//') && !token.startsWith('/*')) || [];
}

function indexOfTokens(tokens, wanted, start = 0) {
  for (let index = start; index <= tokens.length - wanted.length; index++) {
    if (wanted.every((token, offset) => tokens[index + offset] === token)) return index;
  }
  return -1;
}

export function hasCode(source, fragment) {
  return indexOfTokens(codeTokens(source), codeTokens(fragment)) >= 0;
}

export function sourceBlock(source, anchor) {
  const tokens = codeTokens(source);
  const prefix = codeTokens(anchor);
  const start = indexOfTokens(tokens, prefix);
  assert.ok(start >= 0, `missing executable anchor: ${anchor}`);
  assert.equal(indexOfTokens(tokens, prefix, start + prefix.length), -1, `ambiguous executable anchor: ${anchor}`);
  const opening = tokens.indexOf('{', start + prefix.length - 1);
  assert.ok(opening >= 0, `missing block: ${anchor}`);
  let depth = 0;
  for (let index = opening; index < tokens.length; index++) {
    if (tokens[index] === '{') depth++;
    if (tokens[index] === '}' && --depth === 0) return tokens.slice(opening, index + 1).join(' ');
  }
  assert.fail(`unclosed block: ${anchor}`);
}

export const functionBody = (source, name) => sourceBlock(source, `function ${name}(`);

export function assertCode(source, fragments, label) {
  for (const fragment of fragments) assert.ok(hasCode(source, fragment), `${label}: missing executable effect/edge ${fragment}`);
}

export function assertPathEvidence(read, evidence, label) {
  assert.ok(evidence.length > 0, `${label}: no path evidence`);
  for (const step of evidence) {
    const source = read(step.file);
    const body = step.anchor ? sourceBlock(source, step.anchor) : source;
    assertCode(body, step.code, `${label} / ${step.file} / ${step.anchor}`);
  }
}
