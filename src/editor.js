// cm6-build/src/editor.js

import { EditorState, Compartment, StateEffect, StateField } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor, Decoration } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, cursorCharLeft, cursorCharRight, cursorLineUp, cursorLineDown, undo, redo, toggleComment } from "@codemirror/commands";
import { syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
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
const highlightConf = new Compartment();

// Rich Syntax Highlight Custom Styles (VS Code style colors)
const customDarkHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "#c678dd", fontWeight: "bold" },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: "#abb2bf" },
  { tag: [t.propertyName], color: "#abb2bf" },
  { tag: [t.variableName], color: "#e06c75" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName], color: "#61afef" },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "#d19a66" },
  { tag: [t.definition(t.name), t.separator], color: "#abb2bf" },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: "#e5c07b" },
  { tag: [t.number, t.integer, t.float], color: "#d19a66" },
  { tag: [t.bool, t.null], color: "#d19a66", fontWeight: "bold" },
  { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: "#56b6c2" },
  { tag: [t.meta, t.comment], color: "#7f848e", fontStyle: "italic" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "#61afef", textDecoration: "underline" },
  { tag: t.heading, fontWeight: "bold", color: "#61afef" },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: "#d19a66" },
  { tag: [t.processingInstruction, t.string, t.inserted], color: "#98c379" },
  { tag: [t.tagName], color: "#e06c75" },
  { tag: [t.attributeName], color: "#d19a66" },
  { tag: [t.attributeValue], color: "#98c379" },
  { tag: t.invalid, color: "#ffffff", backgroundColor: "#e06c75" }
]);

const customLightHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "#a626a4", fontWeight: "bold" },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: "#383a42" },
  { tag: [t.propertyName], color: "#383a42" },
  { tag: [t.variableName], color: "#e45649" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName], color: "#4078f2" },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "#986801" },
  { tag: [t.definition(t.name), t.separator], color: "#383a42" },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: "#c18401" },
  { tag: [t.number, t.integer, t.float], color: "#986801" },
  { tag: [t.bool, t.null], color: "#986801", fontWeight: "bold" },
  { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: "#0184bc" },
  { tag: [t.meta, t.comment], color: "#a0a1a7", fontStyle: "italic" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "#4078f2", textDecoration: "underline" },
  { tag: t.heading, fontWeight: "bold", color: "#4078f2" },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: "#986801" },
  { tag: [t.processingInstruction, t.string, t.inserted], color: "#50a14f" },
  { tag: [t.tagName], color: "#e45649" },
  { tag: [t.attributeName], color: "#986801" },
  { tag: [t.attributeValue], color: "#50a14f" },
  { tag: t.invalid, color: "#ffffff", backgroundColor: "#e45649" }
]);

// Error Line State Management
const setErrorLineEffect = StateEffect.define();
const clearErrorLineEffect = StateEffect.define();

const errorLineDecoration = Decoration.line({
  attributes: { class: "cm-error-line" }
});

const errorLineField = StateField.define({
  create() { return Decoration.none; },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (let effect of tr.effects) {
      if (effect.is(setErrorLineEffect)) {
        try {
          const line = tr.state.doc.line(effect.value);
          decorations = Decoration.set([errorLineDecoration.range(line.from)]);
        } catch(e) { console.error("Error setting line decoration:", e); }
      } else if (effect.is(clearErrorLineEffect)) {
        decorations = Decoration.none;
      }
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f)
});

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
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      search({ top: true }),
      errorLineField, // Inject Error Decoration Field

      // Inject Error Class Theme
      EditorView.theme({
        ".cm-error-line": { backgroundColor: "rgba(255, 107, 107, 0.15)" }
      }),

      // Dynamic Compartments
      themeConf.of(theme === 'light' ? [] : oneDark),
      highlightConf.of(theme === 'light' ? syntaxHighlighting(customLightHighlightStyle) : syntaxHighlighting(customDarkHighlightStyle)),
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
        if (view) {
          view.dispatch({
            effects: [
              themeConf.reconfigure(message.payload.theme === 'light' ? [] : oneDark),
              highlightConf.reconfigure(message.payload.theme === 'light' ? syntaxHighlighting(customLightHighlightStyle) : syntaxHighlighting(customDarkHighlightStyle))
            ]
          });
        }
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

      // Error Line Highlights
      case "SET_ERROR_LINE":
        if (view) {
          try {
            const line = message.payload.line;
            view.dispatch({ effects: setErrorLineEffect.of(line) });
            // Optionally, scroll into view
            const docLine = view.state.doc.line(line);
            view.dispatch({ selection: { anchor: docLine.from, head: docLine.from }, scrollIntoView: true });
          } catch (e) {
            console.error("Invalid line for error highlight", e);
          }
        }
        break;
      case "CLEAR_ERROR_LINE":
        if (view) {
          view.dispatch({ effects: clearErrorLineEffect.of(null) });
        }
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