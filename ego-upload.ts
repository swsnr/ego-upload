#!/usr/bin/env -S deno run --allow-env=EGO_USERNAME,EGO_PASSWORD --allow-net=extensions.gnome.org --allow-read

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import {
  Secret,
  Input,
} from "https://deno.land/x/cliffy@v1.0.0-rc.3/prompt/mod.ts";
import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.3/command/mod.ts";
import {
  DOMParser,
  Element,
} from "https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts";
import { wrapFetch } from "https://deno.land/x/another_cookiejar@v5.0.3/mod.ts";

// Wrap fetch with a global cookie JAR, for dead simple authentication.
const fetch = wrapFetch();

interface Auth {
  readonly username: string;
  readonly password: string;
}

const extractFormData = async (
  url: string,
  action: string
): Promise<FormData> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Request to  ${url} failed with status code ${response.status}`
    );
  }
  const document = new DOMParser().parseFromString(
    await response.text(),
    "text/html"
  );
  const forms = Array.from(document?.querySelectorAll("form") ?? []);
  const loginForm = forms
    .filter((n): n is Element => n instanceof Element)
    .find((n) => n.attributes.getNamedItem("action")?.value === action);
  if (typeof loginForm === "undefined") {
    throw new Error(`Required form with action ${action} not found!`);
  }

  const formData = new FormData();
  Array.from(loginForm?.querySelectorAll("input") ?? [])
    .filter((n): n is Element => n instanceof Element)
    .forEach((input) => {
      const name = input.attributes.getNamedItem("name")?.value;
      const value = input.attributes.getNamedItem("value")?.value;
      if (name && value) {
        formData.append(name, value);
      }
    });
  return formData;
};

/**
 * Login with the given authentication data.
 *
 * This does not return anything; instead it updates the global cookie JAR with
 * the authenticated session cookie.
 *
 * @param auth The authentication
 */
const login = async (auth: Auth) => {
  const formData = await extractFormData(
    "https://extensions.gnome.org/",
    "/accounts/login/"
  );
  formData.append("username", auth.username);
  formData.append("password", auth.password);
  const loginResponse = await fetch(
    "https://extensions.gnome.org/accounts/login/",
    {
      method: "POST",
      body: formData,
      headers: {
        // CRSF validation by EGO requires that we set the referrer to this value.
        Referer: "https://extensions.gnome.org/",
      },
    }
  );

  if (!loginResponse.ok) {
    console.error(await loginResponse.text());
    throw new Error(`Login failed with status ${loginResponse.status}`);
  } else {
    console.log(await loginResponse.text());
  }
};

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
  //   console.info("Logging in as", auth.username);
  await login(auth);
};

if (import.meta.main) {
  main();
}
