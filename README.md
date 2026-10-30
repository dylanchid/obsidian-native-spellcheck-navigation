# Native Spellcheck Navigation

Keyboard-first spelling navigation for Obsidian Desktop. The plugin uses Electron's built-in spellchecker, which is backed by the native system spellchecker on macOS.

## Commands

- **Next misspelling and show corrections** — defaults to `Cmd+Shift+T` on macOS.
- **Previous misspelling and show corrections** — unbound by default.

The first correction is selected automatically, so press Return to accept it or use the arrow keys to choose another option. The menu also includes actions to add a word to the system dictionary or ignore it until Obsidian restarts.

## Development

```sh
npm install
npm test
npm run build
```
