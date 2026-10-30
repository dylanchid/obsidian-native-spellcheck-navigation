import { Editor, Menu, Notice, Plugin } from "obsidian";
import {
  Direction,
  findMarkdownExclusionRanges,
  findWordRanges,
  isRangeExcluded,
  orderWordRanges,
  TextRange,
  WordRange
} from "./scanner";

interface NativeSpellchecker {
  isWordMisspelled(word: string): boolean;
  getWordSuggestions(word: string): string[];
}

interface SpellcheckerSession {
  addWordToSpellCheckerDictionary(word: string): boolean;
}

interface ElectronBridge {
  webFrame?: NativeSpellchecker;
  remote?: {
    webFrame?: NativeSpellchecker;
    getCurrentWebContents?: () => { session?: SpellcheckerSession };
  };
}

interface AppWithCommands {
  commands?: {
    executeCommandById(commandId: string): boolean;
  };
}

interface EditorWithCodeMirror extends Editor {
  cm?: {
    coordsAtPos(position: number): { left: number; bottom: number } | null;
  };
}

interface KeyboardSelectableMenu extends Menu {
  select(index: number): void;
}

class AutoSelectingMenu extends Menu {
  constructor(private readonly selectFirstItem: boolean) {
    super();
  }

  onload(): void {
    super.onload();

    if (this.selectFirstItem) {
      // Menu.load() calls this only after the DOM menu and keyboard scope exist.
      // Selecting here keeps the visible highlight and Enter target in sync.
      (this as unknown as KeyboardSelectableMenu).select(0);
    }
  }
}

const COMMAND_NEXT = "next-misspelling";
const COMMAND_PREVIOUS = "previous-misspelling";
const CHECK_BATCH_SIZE = 150;

export default class NativeSpellcheckNavigationPlugin extends Plugin {
  private ignoredWords = new Set<string>();
  private running = false;

  async onload(): Promise<void> {
    this.addCommand({
      id: COMMAND_NEXT,
      name: "Next misspelling and show corrections",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "T" }],
      editorCallback: editor => void this.navigate(editor, "next")
    });

    this.addCommand({
      id: COMMAND_PREVIOUS,
      name: "Previous misspelling and show corrections",
      editorCallback: editor => void this.navigate(editor, "previous")
    });
  }

  private getSpellchecker(): NativeSpellchecker | null {
    try {
      const electron = window.require?.("electron") as ElectronBridge | undefined;
      const spellchecker = electron?.webFrame ?? electron?.remote?.webFrame;
      if (
        spellchecker &&
        typeof spellchecker.isWordMisspelled === "function" &&
        typeof spellchecker.getWordSuggestions === "function"
      ) {
        return spellchecker;
      }
    } catch (error) {
      console.error("Native Spellcheck Navigation: Electron spellchecker unavailable", error);
    }

    return null;
  }

  private getSession(): SpellcheckerSession | null {
    try {
      const electron = window.require?.("electron") as ElectronBridge | undefined;
      return electron?.remote?.getCurrentWebContents?.().session ?? null;
    } catch {
      return null;
    }
  }

  private async navigate(editor: Editor, direction: Direction): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const spellchecker = this.getSpellchecker();
      if (!spellchecker) {
        new Notice("Native spellchecker is unavailable. This plugin only works in Obsidian Desktop.");
        return;
      }

      const text = editor.getValue();
      const selectionFrom = editor.posToOffset(editor.getCursor("from"));
      const selectionTo = editor.posToOffset(editor.getCursor("to"));
      const cursorOffset = direction === "next" ? selectionTo : selectionFrom;
      const candidates = orderWordRanges(findWordRanges(text), cursorOffset, direction);
      const excluded = findMarkdownExclusionRanges(text);
      const seen = new Map<string, boolean>();

      for (let index = 0; index < candidates.length; index++) {
        const candidate = candidates[index];
        if (this.shouldSkipCandidate(candidate, excluded)) continue;

        let misspelled = seen.get(candidate.word);
        if (misspelled === undefined) {
          misspelled = spellchecker.isWordMisspelled(candidate.word);
          seen.set(candidate.word, misspelled);
        }

        if (misspelled) {
          this.selectAndShowMenu(editor, candidate, spellchecker);
          return;
        }

        if (index > 0 && index % CHECK_BATCH_SIZE === 0) {
          await new Promise<void>(resolve => window.setTimeout(resolve, 0));
        }
      }

      new Notice("No spelling mistakes found.");
    } catch (error) {
      console.error("Native Spellcheck Navigation failed", error);
      new Notice("Could not navigate spelling mistakes. Check the developer console for details.");
    } finally {
      this.running = false;
    }
  }

  private shouldSkipCandidate(candidate: WordRange, excluded: readonly TextRange[]): boolean {
    if (candidate.word.length < 2) return true;
    if (this.ignoredWords.has(candidate.word.toLocaleLowerCase())) return true;
    if (isRangeExcluded(candidate, excluded)) return true;
    return false;
  }

  private selectAndShowMenu(
    editor: Editor,
    candidate: WordRange,
    spellchecker: NativeSpellchecker
  ): void {
    const from = editor.offsetToPos(candidate.from);
    const to = editor.offsetToPos(candidate.to);
    editor.setSelection(from, to);
    editor.scrollIntoView({ from, to }, true);

    window.requestAnimationFrame(() => {
      const coordinates = (editor as EditorWithCodeMirror).cm?.coordsAtPos(candidate.from) ?? null;
      const suggestions = spellchecker.getWordSuggestions(candidate.word).slice(0, 8);
      const menu = new AutoSelectingMenu(suggestions.length > 0).setUseNativeMenu(false);

      if (suggestions.length === 0) {
        menu.addItem(item => item.setTitle("No suggestions").setDisabled(true));
      } else {
        for (const suggestion of suggestions) {
          menu.addItem(item =>
            item
              .setTitle(suggestion)
              .onClick(() => editor.replaceRange(suggestion, from, to))
          );
        }
      }

      menu.addSeparator();
      menu.addItem(item =>
        item
          .setTitle("Add to dictionary")
          .onClick(() => this.addToDictionary(candidate.word))
      );
      menu.addItem(item =>
        item
          .setTitle("Ignore for this session")
          .onClick(() => this.ignoreForSession(candidate.word, editor))
      );

      if (coordinates) {
        menu.showAtPosition({ x: coordinates.left, y: coordinates.bottom });
      } else {
        (this.app as AppWithCommands).commands?.executeCommandById("editor:context-menu");
      }
    });
  }

  private addToDictionary(word: string): void {
    const session = this.getSession();
    if (!session) {
      new Notice("Could not access Obsidian's spelling dictionary.");
      return;
    }

    session.addWordToSpellCheckerDictionary(word);
    new Notice(`Added “${word}” to the spelling dictionary.`);
  }

  private ignoreForSession(word: string, editor: Editor): void {
    this.ignoredWords.add(word.toLocaleLowerCase());
    void this.navigate(editor, "next");
  }
}
