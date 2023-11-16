#!/usr/bin/env -S deno run

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import {
  Secret,
  Input,
  prompt,
} from "https://deno.land/x/cliffy@v1.0.0-rc.3/prompt/mod.ts";
import { parse, Args } from "https://deno.land/std@0.206.0/flags/mod.ts";

// TODO: Replace with cliffy
const parseArgs = (): Args => {
  const flags = parse(Deno.args);
  const usage = "Usage: ego-upload ZIP-FILE";
  const help = `Upload GNOME extensions to extensions.gnome.org

${usage}

Arguments:
    [ZIP-FILE]      The ZIP file to upload

Options:
    --help          Show this help and exit.`;

  if (flags.help) {
    console.log(help);
    Deno.exit(0);
  }

  const knownFlags = ["help"];
  for (const prop of Object.getOwnPropertyNames(flags)) {
    if (prop === "_") {
      continue;
    }

    if (!knownFlags.includes(prop)) {
      console.error(`error: unexpected argument '--${prop}'

${usage}

For more inforation, try '--help'.`);
      Deno.exit(1);
    }
  }

  if (!(flags["_"] instanceof Array && 0 < flags["_"].length)) {
    console.error(`error: missing ZIP-FILE argument

${usage}

For more inforation, try '--help'.`);
    Deno.exit(1);
  }
  return flags;
};

interface Auth {
  readonly username: string;
  readonly password: string;
}

const login = async (auth: Auth) => {};

const askAuth = async (): Promise<Auth> => {
  return await prompt([
    {
      name: "username",
      message: "Your e.g.o username",
      type: Input,
    },
    {
      name: "password",
      message: "Your e.g.o password",
      type: Secret,
    },
  ]);
};

const main = async () => {
  const args = parseArgs();
  const [file] = args._;
  const auth = await askAuth();
  console.dir(file);
  console.dir(auth);
};

if (import.meta.main) {
  main();
}
