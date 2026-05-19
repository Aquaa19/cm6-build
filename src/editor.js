// cm6-build/src/editor.js

import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, cursorCharLeft, cursorCharRight, cursorLineUp, cursorLineDown, undo, redo, toggleComment } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap } from "@codemirror/language";
import { search, searchKeymap, highlightSelectionMatches, SearchQuery, setSearchQuery, findNext, findPrevious, replaceNext, replaceAll, SearchCursor, getSearchQuery } from "@codemirror/search";
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { lintKeymap } from "@codemirror/lint";
import { oneDark } from "@codemirror/theme-one-dark";

// Language Imports
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { xml } from "@codemirror/lang-xml";
import { sql } from "@codemirror/lang-sql";
import { rust } from "@codemirror/lang-rust";

// Configuration Compartments
const languageConf = new Compartment();
const fontSizeConf = new Compartment();
const lineWrappingConf = new Compartment();
const tabSizeConf = new Compartment();
const themeConf = new Compartment();
const lineNumbersConf = new Compartment();

const LANGUAGE_MAP = {
  javascript: javascript(),
  typescript: javascript({ typescript: true }),
  jsx: javascript({ jsx: true }),
  tsx: javascript({ typescript: true, jsx: true }),
  python: python(),
  java: java(),
  cpp: cpp(),
  c: cpp(),
  html: html(),
  css: css(),
  json: json(),
  markdown: markdown(),
  xml: xml(),
  sql: sql(),
  rust: rust(),
};

function getLanguageExtension(langName) {
  return LANGUAGE_MAP[langName?.toLowerCase()] || [];
}

let view;

// Helper to broadcast search indices
function reportSearchResults() {
  if (!view) return;
  const query = getSearchQuery(view.state);
  if (!query || !query.valid) {
    sendToRN({ type: "SEARCH_RESULTS", payload: { count: 0, index: 0 } });
    return;
  }
  let count = 0;
  let index = 0;
  const selHead = view.state.selection.main.head;

  const cursor = query.getCursor(view.state);
  for (let match = cursor.next(); !match.done; match = cursor.next()) {
    count++;
    if (match.value.from <= selHead && match.value.to >= selHead) {
      index = count;
    } else if (match.value.from <= selHead) {
      index = count;
    }
  }
  sendToRN({ type: "SEARCH_RESULTS", payload: { count, index } });
}

function initEditor(content, language, fontSize, theme, wordWrap, showLineNumbers, tabSize) {
  if (view) view.destroy();

  const state = EditorState.create({
    doc: content || "",
    extensions: [
      highlightActiveLineGutter(),
      foldGutter(),
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      search({ top: true }), // Enable Search Extension

      // Dynamic Compartments
      themeConf.of(theme === 'light' ? [] : oneDark),
      lineNumbersConf.of(showLineNumbers ? lineNumbers() : []),
      languageConf.of(getLanguageExtension(language)),
      fontSizeConf.of(EditorView.theme({
        ".cm-content": { fontSize: `${fontSize || 14}px` },
        ".cm-gutters": { fontSize: `${fontSize || 14}px` }
      })),
      lineWrappingConf.of(wordWrap ? EditorView.lineWrapping : []),
      tabSizeConf.of(EditorState.tabSize.of(tabSize || 2)),

      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...searchKeymap,
        ...lintKeymap
      ]),

      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          sendToRN({ type: "CONTENT_CHANGED", payload: { content: view.state.doc.toString() } });
        }
        if (update.selectionSet || update.docChanged) {
          if (update.selectionSet) {
            const pos = update.state.selection.main.head;
            const docLine = update.state.doc.lineAt(pos);
            sendToRN({ type: "CURSOR_CHANGED", payload: { line: docLine.number, col: pos - docLine.from + 1 } });
          }
          // Debounce / Check if search query exists to report index changes when cursor moves
          if (getSearchQuery(view.state)?.valid) {
             reportSearchResults();
          }
        }
      })
    ]
  });

  view = new EditorView({ state, parent: document.getElementById("editor") });
}

function sendToRN(message) {
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }
}

window.addEventListener("message", (event) => {
  try {
    const message = JSON.parse(event.data);
    switch (message.type) {
      case "INIT":
        initEditor(
          message.payload.content,
          message.payload.language,
          message.payload.fontSize,
          message.payload.theme,
          message.payload.wordWrap,
          message.payload.lineNumbers,
          message.payload.tabSize
        );
        break;
      case "SET_CONTENT":
        if (view) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: message.payload.content || "" } });
        break;
      case "GET_CONTENT":
        if (view) sendToRN({ type: "CONTENT", payload: view.state.doc.toString() });
        break;
      case "SET_FONT_SIZE":
        if (view) {
          view.dispatch({ effects: fontSizeConf.reconfigure(EditorView.theme({
            ".cm-content": { fontSize: `${message.payload.fontSize}px` },
            ".cm-gutters": { fontSize: `${message.payload.fontSize}px` }
          }))});
        }
        break;
      case "SET_LANGUAGE":
        if (view) view.dispatch({ effects: languageConf.reconfigure(getLanguageExtension(message.payload.language)) });
        break;
      case "SET_CURSOR":
        if (view) {
          try {
            const docLine = view.state.doc.line(message.payload.line || 1);
            const pos = Math.min(docLine.from + (message.payload.col || 1) - 1, docLine.to);
            view.dispatch({ selection: { anchor: pos, head: pos }, scrollIntoView: true });
          } catch (e) { console.error(e); }
        }
        break;

      // Settings Adjustments
      case "SET_WORD_WRAP":
        if (view) view.dispatch({ effects: lineWrappingConf.reconfigure(message.payload.wordWrap ? EditorView.lineWrapping : []) });
        break;
      case "SET_LINE_NUMBERS":
        if (view) view.dispatch({ effects: lineNumbersConf.reconfigure(message.payload.lineNumbers ? lineNumbers() : []) });
        break;
      case "SET_TAB_SIZE":
        if (view) view.dispatch({ effects: tabSizeConf.reconfigure(EditorState.tabSize.of(message.payload.tabSize)) });
        break;
      case "SET_THEME":
        if (view) view.dispatch({ effects: themeConf.reconfigure(message.payload.theme === 'light' ? [] : oneDark) });
        break;

      // Search and Replace
      case "SET_SEARCH_QUERY":
        if (view) {
          view.dispatch({
            effects: setSearchQuery.of(new SearchQuery({
              search: message.payload.query,
              replace: message.payload.replace,
              caseSensitive: message.payload.caseSensitive
            }))
          });
          reportSearchResults();
        }
        break;
      case "SEARCH_NEXT":
        if (view) { findNext(view); reportSearchResults(); }
        break;
      case "SEARCH_PREV":
        if (view) { findPrevious(view); reportSearchResults(); }
        break;
      case "SEARCH_REPLACE":
        if (view) { replaceNext(view); reportSearchResults(); }
        break;
      case "SEARCH_REPLACE_ALL":
        if (view) { replaceAll(view); reportSearchResults(); }
        break;

      // Editor Actions
      case "INSERT_TEXT":
        if (view) {
          const sel = view.state.selection.main;
          view.dispatch({
            changes: { from: sel.from, to: sel.to, insert: message.payload.text },
            selection: { anchor: sel.from + message.payload.text.length },
            scrollIntoView: true
          });
        }
        break;
      case "MOVE_CURSOR":
        if (view) {
          switch (message.payload.direction) {
            case 'left': cursorCharLeft(view); break;
            case 'right': cursorCharRight(view); break;
            case 'up': cursorLineUp(view); break;
            case 'down': cursorLineDown(view); break;
          }
        }
        break;
      case "UNDO":
        if (view) undo(view);
        break;
      case "REDO":
        if (view) redo(view);
        break;
      case "TOGGLE_COMMENT":
        if (view) toggleComment(view);
        break;
    }
  } catch (err) {
    console.error("Error processing bridge message:", err);
  }
});

document.addEventListener("DOMContentLoaded", () => {
  sendToRN({ type: "READY" });
});
document.getElementById("editor").addEventListener("click", () => {
  if (view && !view.hasFocus) view.focus();
});