#!/usr/bin/env -S deno run --allow-env

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import {
  Secret,
  Input,
} from "https://deno.land/x/cliffy@v1.0.0-rc.3/prompt/mod.ts";
import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.3/command/mod.ts";

interface Auth {
  readonly username: string;
  readonly password: string;
}

const login = async (auth: Auth) => {};

const promptForMissingAuth = async (auth: Partial<Auth>): Promise<Auth> => {
  const username = auth.username ?? (await Input.prompt("Your e.g.o username"));
  const password =
    auth.password ?? (await Secret.prompt(`e.g.o password for ${username}`));
  return { username, password };
};

const main = async () => {
  const args = await new Command()
    .name("ego-upload")
    .version("1")
    .description("Upload GNOME extensions to extensions.gnome.org")
    .arguments("<zip-file:file>")
    .env("EGO_USERNAME=<username:string>", "Your e.g.o username", {
      prefix: "EGO_",
    })
    .env("EGO_PASSWORD=<password:string>", "Your e.g.o password", {
      prefix: "EGO_",
    })
    .option("-u, --username <username:string>", "Your e.g.o username")
    .parse(Deno.args);
  const auth = await promptForMissingAuth({
    username: args.options.username,
    password: args.options.password,
  });
  console.dir(auth);
};

if (import.meta.main) {
  main();
}
