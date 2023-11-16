# ego-upload

Upload GNOME extensions to <https://extensions.gnome.org> from the command line.

## Usage

```
ego-upload /path/to/my-extension@example.com.shell-extension.zip
```

ego-upload will prompt for your username and password, and then also ask you to
confirm the license and ToS, just like on the upload form at
<https://extensions.gnome.org/upload/>.

You can use `$EGO_USERNAME` and `$EGO_PASSWORD` to provide the username and
password respectively in the environment, to avoid the authentication prompt.
Note that these environment variables will only work if you granted the relevant
permissions (see below).

## Installation

Install [Deno] and run the following, where `ZIP_FILE` is the path to the ZIP
file containing your extension:

```console
$ deno run \
    --allow-env=EGO_USERNAME,EGO_PASSWORD --allow-net=extensions.gnome.org \
    https://raw.githubusercontent.com/swsnr/ego-upload/main/ego-upload.ts \
    ZIP_FILE
```

Alternatively you can just download `ego-upload.ts` to e.g.
`~/.local/bin/ego-upload`, make it executable and run it directly.

## Security

Deno sandboxes all code and requires explicit permissions for every action. The
above instructions grant the following permissions:

- Access to `$EGO_USERNAME` and `$EGO_PASSWORD` to provide the username and
  password in the environment.
- Network access to `extensions.gnome.org` to upload the extension.

These permissions are also embedded in the binary on Github Releases here, and
encoded into the script shebang.

Additionally, the script will prompt for read access to the selected extension
ZIP file at runtime.

[deno]: https://docs.deno.com/runtime/manual/getting_started/installation

## License

This program is subject to the terms of the Mozilla Public License, v. 2.0. If a
copy of the MPL was not distributed with this file, You can obtain one at
<https://mozilla.org/MPL/2.0/>.
