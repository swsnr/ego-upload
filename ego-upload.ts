#!/usr/bin/env -S deno run

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import { parse } from "https://deno.land/std@0.206.0/flags/mod.ts";

const parseArgs = () => {
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
};

const main = () => {
  parseArgs();
};

main();
