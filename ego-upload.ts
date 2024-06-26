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

const VERSION = "1.2.0";

/** User authentication for EGO. */
interface UserAuthentication {
  readonly username: string;
  readonly password: string;
}

interface APIDetailResponse {
  readonly detail?: string;
}

interface APIToken {
  readonly token: string;
}

interface APITokenResponse extends APIDetailResponse {
  readonly token: APIToken;
}

/**
 * Login with the given authentication data.
 *
 * @param auth The authentication to use
 * @return The authentication token to use for further API requests
 */
const login = async (auth: UserAuthentication): Promise<string> => {
  const response = await fetch(
    "https://extensions.gnome.org/api/v1/accounts/login/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        login: auth.username,
        password: auth.password,
      }),
    },
  );

  const data = await response.json() as APIDetailResponse;
  if (!response.ok) {
    throw new Error(
      `Login failed with status ${response.status}: ${data.detail}`,
    );
  } else {
    return (data as APITokenResponse).token.token;
  }
};

const authorizationHeader = (token: string): Record<string, string> => ({
  "Authorization": `Token ${token}`,
});

const logout = async (token: string) => {
  const response = await fetch(
    "https://extensions.gnome.org/api/v1/accounts/logout/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...authorizationHeader(token),
      },
      body: JSON.stringify({
        revoke_token: true,
      }),
    },
  );
  const data = response.json() as APIDetailResponse;
  if (!response.ok) {
    console.error(
      `Logout failed with status ${response.status}: ${data.detail}`,
    );
  }
};

class InvalidUploadError extends Error {
  constructor(readonly errors: readonly string[]) {
    super(errors[0]);
  }
}

interface UploadedExtension {
  readonly extension: string;
  readonly version: number;
}

const upload = async (
  token: string,
  path: string,
): Promise<UploadedExtension> => {
  const body = new FormData();
  body.append("shell_license_compliant", "true");
  body.append("tos_compliant", "true");
  const dataBlob = new Blob([await Deno.readFile(path)], {
    type: "application/zip",
  });
  body.append("source", dataBlob, basename(path));
  const response = await fetch(
    "https://extensions.gnome.org/api/v1/extensions",
    {
      method: "POST",
      headers: {
        "Accept": "application/json",
        ...authorizationHeader(token),
      },
      body,
    },
  );
  if (response.ok) {
    return (await response.json()) as UploadedExtension;
  } else {
    const body = await response.text() as APIDetailResponse;
    console.error("Upload failed, status", response.status, body);
    throw new Error(`Upload failed with status ${response.status}`);
  }
};

interface ExtensionMetadata {
  readonly id: number;
  readonly uuid: string;
}

const queryExtension = async (
  token: string,
  uuid: string,
): Promise<ExtensionMetadata> => {
  const response = await fetch(
    `https://extensions.gnome.org/api/v1/extensions/${uuid}/`,
    {
      headers: {
        "Accept": "application/json",
        ...authorizationHeader(token),
      },
    },
  );
  if (response.ok) {
    return (await response.json()) as ExtensionMetadata;
  } else {
    const body = await response.text() as APIDetailResponse;
    console.error("Upload failed, status", response.status, body);
    throw new Error(`Upload failed with status ${response.status}`);
  }
};

/**
 * Prompts the user has to confirm in order to upload an extension.
 */
interface ConfirmationPrompts {
  readonly shell_license_compliant: string;
  readonly tos_compliant: string;
}

type ConfirmedPrompt = {
  [P in keyof ConfirmationPrompts]: boolean;
};

/**
 * Fetch confirmation prompts.
 *
 * Fetch prompts the user has to confirm in order to upload an extension.
 *
 * @returns A map of field names to human-readable prompts to confirm.
 */
const fetchConfirmationPrompts = async (): Promise<ConfirmationPrompts> => {
  // We can find the prompt texts as field titles in the API schema definition,
  // so let's fetch the schema.
  const response = await fetch("https://extensions.gnome.org/api/schema/", {
    headers: {
      "Accept": "application/json",
    },
  });
  const data = await response.json();
  const uploadComponent = data.components.schemas.ExtensionUpload;
  const getPrompt = (field: keyof ConfirmationPrompts): string => {
    const prompt = uploadComponent.properties[field].title;
    if (typeof prompt !== "string") {
      throw new Error(`Failed to find confirmation prompt for field ${field}`);
    }
    return prompt;
  };
  return {
    shell_license_compliant: getPrompt("shell_license_compliant"),
    tos_compliant: getPrompt("tos_compliant"),
  };
};

/**
 * Ask the user to confirm all prompts required to upload an extension.
 *
 * @param confirmationPrompts Prompts to confirm.
 * @returns Whether all prompts where confirmed.
 */
const promptForConfirmation = async (
  confirmationPrompts: ConfirmationPrompts,
): Promise<boolean> => {
  const fields: (keyof ConfirmationPrompts)[] = [
    "shell_license_compliant",
    "tos_compliant",
  ];
  for (const field of fields) {
    if (!await Confirm.prompt(confirmationPrompts[field])) {
      return false;
    }
  }
  return true;
};

/**
 * Load confirmed prompts from a file.
 *
 * @param path The path with stored confirmations.
 * @returns A record mapping field names to confirmed prompts
 */
const loadConfirmations = async (
  path: string,
): Promise<Record<string, unknown>> => {
  const permission = await Deno.permissions.request({ name: "read", path });
  if (permission.state !== "granted") {
    throw new Error(`Permission to read confirmations from ${path} denied`);
  }
  const contents = JSON.parse(
    new TextDecoder().decode(await Deno.readFile(path)),
  );
  if (typeof contents === "object" && !Array.isArray(contents)) {
    return contents;
  } else {
    console.warn("Ignoring unexpected confirmations:", contents);
    return {};
  }
};

/**
 * Verify that the user has confirmed all required prompts to upload an extension.
 *
 * @param confirmedPrompts Pre-confirmed prompts if any
 * @returns Whether the user has confirmed all required upload prompts, either directly or ahead of time.
 */
const verifyConfirmedPrompts = async (
  confirmedPrompts: Record<string, unknown> | null,
): Promise<boolean> => {
  const prompts = await fetchConfirmationPrompts();
  if (confirmedPrompts === null) {
    return await promptForConfirmation(prompts);
  } else {
    const fields: (keyof ConfirmationPrompts)[] = [
      "shell_license_compliant",
      "tos_compliant",
    ];
    return fields.every((field) => confirmedPrompts[field] === prompts[field]);
  }
};

/**
 * Prompt for any missing part in the given authentication.
 *
 * @param auth Partial authentication information
 * @returns Full authentication information with values supplied by the user as needed.
 */
const promptForMissingAuth = async (
  auth: Partial<UserAuthentication>,
): Promise<UserAuthentication> => {
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
    .option(
      "-c, --confirmations <file:file>",
      "A file with confirmations to the EGO upload prompts, as generated by 'confirm-upload'",
    )
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
      const preconfirmedPrompts = options.confirmations
        ? await loadConfirmations(options.confirmations)
        : null;
      if (!await verifyConfirmedPrompts(preconfirmedPrompts)) {
        console.error(
          "You must confirm the license terms and terms of service to upload an extension!",
        );
        Deno.exit(1);
      }

      const auth = await promptForMissingAuth({
        username: options.username,
        password: options.password,
      });
      const token = await login(auth);
      try {
        const { version, extension: uuid } = await upload(token, zipPath);
        const { id } = await queryExtension(token, uuid);
        const extensionUrl = `https://extensions.gnome.org/extension/${id}/`;
        console.log(
          `Successfully uploaded extension ${uuid} version ${version}, please find it at ${extensionUrl}`,
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
        await logout(token);
      }
    })
    .command("completions", new CompletionsCommand())
    .command("confirm-upload", "Confirm upload prompts ahead of time")
    .arguments("<target-file:file>")
    .action(async (_, targetFile) => {
      const prompts = await fetchConfirmationPrompts();
      if (await promptForConfirmation(prompts)) {
        Deno.writeTextFile(
          targetFile,
          JSON.stringify(prompts, undefined, 2) + "\n",
        );
      } else {
        console.error(
          "You must accept the license terms and the terms of service",
        );
        Deno.exit(1);
      }
    })
    .parse(Deno.args);

if (import.meta.main) {
  main();
}
