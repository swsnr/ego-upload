#!/usr/bin/env -S deno run --ext ts --allow-env=EGO_USERNAME,EGO_PASSWORD --allow-net=extensions.gnome.org

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import { basename, extname } from "https://deno.land/std@0.206.0/path/mod.ts";

import {
  Confirm,
  Input,
  Secret,
} from "https://deno.land/x/cliffy@v1.0.0-rc.3/prompt/mod.ts";
import {
  Command,
  CompletionsCommand,
} from "https://deno.land/x/cliffy@v1.0.0-rc.3/command/mod.ts";
import {
  DOMParser,
  Element,
} from "https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts";
import { wrapFetch } from "https://deno.land/x/another_cookiejar@v5.0.3/mod.ts";

const VERSION = "1.0.0";

// Wrap fetch with a global cookie JAR, for dead simple authentication.
const fetch = wrapFetch();

/** User authentication for EGO. */
interface Auth {
  readonly username: string;
  readonly password: string;
}

/**
 * Parse a form from HTML.
 *
 * @param html The HTML containing the form.
 * @param action The form action to identify the form by
 * @returns The form element.
 */
const getFormFromHtml = (html: string, action?: string): Element => {
  const document = new DOMParser().parseFromString(html, "text/html");
  const forms = Array.from(document?.getElementsByTagName("form") ?? []);
  const form = forms.find((n) => {
    const formAction = n.attributes.getNamedItem("action")?.value ?? "";
    return formAction === (action ?? "");
  });
  if (typeof form === "undefined") {
    throw new Error(`Required form with action ${action} not found!`);
  }
  return form;
};

/**
 * Retrieve a form from an URL.
 *
 * @param url The URL to get the form from.
 * @param action The form action to identify the form by
 * @returns The form element.
 */
const getFormFromUrl = async (
  url: string,
  action?: string,
): Promise<Element> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Request to  ${url} failed with status code ${response.status}`,
    );
  }
  return getFormFromHtml(await response.text(), action);
};

/**
 * Abstract representation of a form input.
 */
interface FormInput {
  readonly name: string;
  readonly id?: string;
  readonly label?: string;
  readonly value?: string;
}

/**
 * Extract all input fields from a given form.
 *
 * @param form The form to look in
 * @returns An abstract representation of all input fields
 */
const getInputFields = (form: Element): FormInput[] =>
  Array.from(form?.getElementsByTagName("input") ?? [])
    .map((input): Partial<FormInput> => {
      const name = input.attributes.getNamedItem("name")?.value;
      const id = input.attributes.getNamedItem("id")?.value;
      const value = input.attributes.getNamedItem("value")?.value;
      return { name, id, value };
    })
    .filter((input): input is FormInput => typeof input.name === "string")
    .map((input): FormInput => {
      if (input.id) {
        const label = form.querySelector(`label[for="${input.id}"]`);
        if (label) {
          return { label: label.innerText.trim(), ...input };
        }
      }
      return input;
    });

/**
 * Convert input fields with value to form data.
 */
const toFormData = (inputFields: readonly FormInput[]): FormData => {
  const formData = new FormData();
  for (const inputField of inputFields) {
    if (inputField.value) {
      formData.append(inputField.name, inputField.value);
    }
  }
  return formData;
};

/**
 * Find all input fields from a form.
 *
 * Retrieve the body from `url`, and look for a form with the given `action`.
 * Then collect a form data object with all `input`s within this form which have
 * a name _and_ a value.
 *
 * Use this to extract CSRF tokens from forms.
 *
 * @param url The URL to retrieve the form from
 * @param action The `action` to look for to identify the form.
 * @returns Form data extracted from `url`
 */
const extractFormData = async (
  url: string,
  action?: string,
): Promise<FormData> =>
  toFormData(getInputFields(await getFormFromUrl(url, action)));

/**
 * Login with the given authentication data.
 *
 * This does not return anything; instead it updates the global cookie JAR with
 * the authenticated session cookie.
 *
 * @param auth The authentication to use
 */
const login = async (auth: Auth) => {
  const formData = await extractFormData(
    "https://extensions.gnome.org/",
    "/accounts/login/",
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
    },
  );

  if (!loginResponse.ok) {
    console.error(await loginResponse.text());
    throw new Error(`Login failed with status ${loginResponse.status}`);
  }
};

const logout = async () => {
  const logoutResponse = await fetch(
    "https://extensions.gnome.org/accounts/logout/",
  );
  if (!logoutResponse.ok) {
    console.error(
      `Logout failed ${logoutResponse.status}`,
      await logoutResponse.text(),
    );
  }
};

const confirmedUploadForm = async (uploadForm: Element): Promise<FormData> => {
  const fields = getInputFields(uploadForm);
  const formData = toFormData(fields);
  const confirmations = ["shell_license_compliant", "tos_compliant"];
  for (const field of fields) {
    if (confirmations.includes(field.name)) {
      const prompt = field.label ?? `Confirm form field ${field.name}?`;
      if (await Confirm.prompt(prompt)) {
        formData.append(field.name, "on");
      }
    }
  }
  return formData;
};

class InvalidUploadError extends Error {
  constructor(readonly errors: readonly string[]) {
    super(errors[0]);
  }
}

const upload = async (path: string): Promise<string> => {
  const uploadUrl = "https://extensions.gnome.org/upload/";
  const uploadForm = await getFormFromUrl(uploadUrl);
  const confirmedForm = await confirmedUploadForm(uploadForm);
  const dataBlob = new Blob([await Deno.readFile(path)], {
    type: "application/zip",
  });
  confirmedForm.append("source", dataBlob, basename(path));
  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    body: confirmedForm,
    headers: {
      // CRSF validation by EGO requires that we set the referrer to this value.
      Referer: "https://extensions.gnome.org/",
    },
  });

  if (uploadResponse.url === uploadUrl) {
    const body = await uploadResponse.text();
    // We're back at the upload form, so something didn't go right.  Let's
    // extract what went front.
    const form = getFormFromHtml(body);
    const helpTexts = form
      .getElementsByClassName("help-block")
      .map((element) => element.innerText.trim());
    throw new InvalidUploadError(helpTexts);
  } else {
    return uploadResponse.url;
  }
};

/**
 * Prompt for any missing part in the given authentication.
 *
 * @param auth Partial authentication information
 * @returns Full authentication information with values supplied by the user as needed.
 */
const promptForMissingAuth = async (auth: Partial<Auth>): Promise<Auth> => {
  const username = auth.username ?? (await Input.prompt("Your e.g.o username"));
  const password = auth.password ??
    (await Secret.prompt(`e.g.o password for ${username}`));
  return { username, password };
};

/**
 * Main entry point
 */
const main = async () =>
  await new Command()
    .name("ego-upload")
    .version(VERSION)
    .description("Upload GNOME extensions to extensions.gnome.org")
    .arguments("<zip-file:file>")
    .env("EGO_USERNAME=<username:string>", "Your e.g.o username", {
      prefix: "EGO_",
    })
    .env("EGO_PASSWORD=<password:string>", "Your e.g.o password", {
      prefix: "EGO_",
    })
    .option("-u, --username <username:string>", "Your e.g.o username")
    .action(async (options, zipPath) => {
      if (extname(zipPath) !== ".zip") {
        throw new Error(`${zipPath} does not appear to be a zip file`);
      }
      const readZipPermission = await Deno.permissions.request({
        name: "read",
        path: zipPath,
      });
      if (readZipPermission.state !== "granted") {
        throw new Error(`Read permission to ${zipPath} denied`);
      }
      const auth = await promptForMissingAuth({
        username: options.username,
        password: options.password,
      });
      try {
        await login(auth);
        const reviewUrl = await upload(zipPath);
        console.log(
          `Successfully uploaded, please find the review at ${reviewUrl}`,
        );
      } catch (error) {
        if (error instanceof InvalidUploadError) {
          console.error("Upload failed; reasons:");
          for (const msg of error.errors) {
            console.error(`  - ${msg}`);
          }
        } else {
          throw error;
        }
      } finally {
        await logout();
      }
    })
    .command("completions", new CompletionsCommand())
    .parse(Deno.args);

if (import.meta.main) {
  main();
}
