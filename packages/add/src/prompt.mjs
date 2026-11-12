/**
 * Questions on the terminal, through `node:readline`. A run without a
 * terminal cannot answer one, so asking there is an error naming what to
 * pass instead.
 */
import { createInterface } from 'node:readline/promises';

/** Whether a question can be asked. */
export function canAsk() {
  return Boolean(process.stdin.isTTY);
}

/**
 * Asks a question and returns the answer, or the default for an empty one.
 *
 * @param {string} question
 * @param {object} [options]
 * @param {string} [options.defaultAnswer]
 * @param {string} [options.missing] - What to pass instead, for the error
 *   a run without a terminal gets.
 * @returns {Promise<string>}
 */
export async function ask(question, { defaultAnswer, missing } = {}) {
  if (!canAsk()) {
    throw new Error(
      `Non-interactive run with missing choices. ${missing ?? 'Pass the component names and --target.'}`
    );
  }
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const suffix =
      defaultAnswer === undefined || defaultAnswer === ''
        ? ''
        : ` [${defaultAnswer}]`;
    const answer = (await readline.question(`${question}${suffix} `)).trim();
    return answer === '' ? (defaultAnswer ?? '') : answer;
  } finally {
    readline.close();
  }
}

/**
 * Asks for one of several choices, by number or by name.
 *
 * @param {string} message
 * @param {string[]} choices
 * @param {object} [options]
 * @param {string} [options.defaultChoice]
 * @param {string} [options.missing]
 * @returns {Promise<string>}
 */
export async function chooseFrom(
  message,
  choices,
  { defaultChoice, missing } = {}
) {
  const answer = await ask(
    `${message}\n${choices.map((choice, i) => `  ${i + 1}. ${choice}`).join('\n')}\n>`,
    { defaultAnswer: defaultChoice, missing }
  );
  const index = Number.parseInt(answer, 10);
  if (String(index) === answer && index >= 1 && index <= choices.length) {
    return choices[index - 1];
  }
  if (choices.includes(answer)) return answer;
  throw new Error(`Invalid choice '${answer}'`);
}

/** Asks a yes-or-no question; no, without a terminal. */
export async function confirm(question) {
  if (!canAsk()) return false;
  return (await ask(`${question} [y/N]`)).toLowerCase() === 'y';
}
