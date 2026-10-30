# Native Spellcheck Navigation

Keyboard-first spelling navigation for Obsidian Desktop. The plugin uses Electron's built-in spellchecker, which is backed by the native system spellchecker on macOS.

## Commands

- **Next misspelling and show corrections** — defaults to `Cmd+Shift+T` on macOS.
- **Previous misspelling and show corrections** — unbound by default.

The first correction is selected automatically, so press Return to accept it or use the arrow keys to choose another option. The menu also includes actions to add a word to the system dictionary or ignore it until Obsidian restarts.

## Install manually

Run `npm ci && npm run build`, then copy `manifest.json` and `main.js` into `<vault>/.obsidian/plugins/native-spellcheck-navigation/`. Enable the plugin under **Settings → Community plugins**. This plugin requires Obsidian Desktop and Electron's spellchecker.

## Development

```sh
npm ci
npm test
npm run build
```

## License

MIT. See [LICENSE](LICENSE).
