import { execSync } from 'child_process';
import { createWriteStream } from 'fs';
import path from 'path';

import { conditionalString, Optional } from '@silverhand/essentials';
import chalk from 'chalk';
import got, { Progress } from 'got';
import { HttpsProxyAgent } from 'hpagent';
import inquirer from 'inquirer';
import ora from 'ora';

export const safeExecSync = (command: string) => {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'pipe' });
  } catch {}
};

type Log = Readonly<{
  info: typeof console.log;
  succeed: typeof console.log;
  warn: typeof console.log;
  error: (...args: Parameters<typeof console.log>) => never;
}>;

export const log: Log = Object.freeze({
  info: (...args) => {
    console.log(chalk.blue('[info]'), ...args);
  },
  succeed: (...args) => {
    log.info(chalk.green('✔'), ...args);
  },
  warn: (...args) => {
    console.warn(chalk.yellow('[warn]'), ...args);
  },
  error: (...args) => {
    console.error(chalk.red('[error]'), ...args);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  },
});

export const downloadFile = async (url: string, destination: string) => {
  const { HTTPS_PROXY, HTTP_PROXY, https_proxy, http_proxy } = process.env;
  const file = createWriteStream(destination);
  const proxy = HTTPS_PROXY ?? https_proxy ?? HTTP_PROXY ?? http_proxy;
  const stream = got.stream(url, {
    ...(proxy && { agent: { https: new HttpsProxyAgent({ proxy }) } }),
  });
  const spinner = ora({
    text: 'Connecting',
    prefixText: chalk.blue('[info]'),
  }).start();

  stream.pipe(file);

  return new Promise((resolve, reject) => {
    stream.on('downloadProgress', ({ total, percent }: Progress) => {
      if (!total) {
        return;
      }

      // eslint-disable-next-line @silverhand/fp/no-mutation
      spinner.text = `${(percent * 100).toFixed(1)}%`;
    });

    file.on('error', (error) => {
      spinner.fail();
      reject(error.message);
    });

    file.on('finish', () => {
      file.close();
      spinner.succeed();
      resolve(file);
    });
  });
};

export const getPathInModule = (moduleName: string, relativePath = '/') =>
  // https://stackoverflow.com/a/49455609/12514940
  path.join(
    // Until we migrate to ESM
    // eslint-disable-next-line unicorn/prefer-module
    path.dirname(require.resolve(`${moduleName}/package.json`)),
    relativePath
  );

export const oraPromise = async <T>(
  promise: PromiseLike<T>,
  options?: ora.Options,
  exitOnError = false
) => {
  const spinner = ora(options).start();

  try {
    const result = await promise;
    spinner.succeed();

    return result;
  } catch (error: unknown) {
    spinner.fail();

    if (exitOnError) {
      log.error(error);
    }

    throw error;
  }
};

export const isTty = () => process.stdin.isTTY;

export enum ConfigKey {
  DatabaseUrl = 'DB_URL',
}

export const cliConfig = new Map<ConfigKey, Optional<string>>();

export type GetCliConfigWithPrompt = {
  key: ConfigKey;
  readableKey: string;
  comments?: string;
  defaultValue?: string;
};

export const getCliConfigWithPrompt = async ({
  key,
  readableKey,
  comments,
  defaultValue,
}: GetCliConfigWithPrompt) => {
  if (cliConfig.has(key) || !isTty()) {
    return cliConfig.get(key);
  }

  const { input } = await inquirer.prompt<{ input?: string }>({
    type: 'input',
    name: 'input',
    message: `Enter your ${readableKey}${conditionalString(comments && ' ' + comments)}`,
    default: defaultValue,
  });

  cliConfig.set(key, input);

  return input;
};

// https://stackoverflow.com/a/53187807/12514940
/**
 * Returns the index of the last element in the array where predicate is true, and -1
 * otherwise.
 * @param array The source array to search in
 * @param predicate find calls predicate once for each element of the array, in descending
 * order, until it finds one where predicate returns true. If such an element is found,
 * findLastIndex immediately returns that element index. Otherwise, findLastIndex returns -1.
 */
export function findLastIndex<T>(
  array: readonly T[],
  predicate: (value: T, index: number, object: readonly T[]) => boolean
): number {
  // eslint-disable-next-line @silverhand/fp/no-let
  let { length } = array;

  // eslint-disable-next-line @silverhand/fp/no-mutation
  while (length--) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (predicate(array[length]!, length, array)) {
      return length;
    }
  }

  return -1;
}
