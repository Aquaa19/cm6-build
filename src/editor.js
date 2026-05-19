import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap } from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
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

// Configuration Compartments for runtime/dynamic editor updates
const languageConf = new Compartment();
const fontSizeConf = new Compartment();
const lineWrappingConf = new Compartment();
const tabSizeConf = new Compartment();

// Language ID Mapping
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

// Initialize Editor Instance
function initEditor(content, language, fontSize) {
  if (view) {
    view.destroy();
  }

  const state = EditorState.create({
    doc: content || "",
    extensions: [
      lineNumbers(),
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
      oneDark, // One Dark dark theme

      // Compartments loaded dynamically
      languageConf.of(getLanguageExtension(language)),
      fontSizeConf.of(EditorView.theme({
        ".cm-content": { fontSize: `${fontSize || 14}px` },
        ".cm-gutters": { fontSize: `${fontSize || 14}px` }
      })),
      lineWrappingConf.of(EditorView.lineWrapping),
      tabSizeConf.of(EditorState.tabSize.of(4)),

      // Core Keybindings
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap
      ]),

      // WebView Bridge Communications
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          sendToRN({
            type: "CONTENT_CHANGED",
            payload: { content: view.state.doc.toString() }
          });
        }
        if (update.selectionSet) {
          const pos = update.state.selection.main.head;
          const line = update.state.doc.lineAt(pos);
          sendToRN({
            type: "CURSOR_CHANGED",
            payload: { line: line.number, col: pos - line.from + 1 }
          });
        }
      })
    ]
  });

  view = new EditorView({
    state,
    parent: document.getElementById("editor")
  });

  // Signal React Native that editor is ready
  sendToRN({ type: "READY" });
}

// Post messages back to WebView Editor Bridge
function sendToRN(message) {
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }
}

// Receive messages from React Native
window.addEventListener("message", (event) => {
  try {
    const message = JSON.parse(event.data);
    
    switch (message.type) {
      case "INIT":
        initEditor(
          message.payload.content,
          message.payload.language,
          message.payload.fontSize
        );
        break;

      case "SET_CONTENT":
        if (view) {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: message.payload.content || "" }
          });
        }
        break;

      case "GET_CONTENT":
        if (view) {
          sendToRN({
            type: "CONTENT",
            payload: view.state.doc.toString()
          });
        }
        break;

      case "SET_FONT_SIZE":
        if (view) {
          const newSize = message.payload.fontSize || 14;
          view.dispatch({
            effects: fontSizeConf.reconfigure(EditorView.theme({
              ".cm-content": { fontSize: `${newSize}px` },
              ".cm-gutters": { fontSize: `${newSize}px` }
            }))
          });
        }
        break;

      case "SET_LANGUAGE":
        if (view) {
          view.dispatch({
            effects: languageConf.reconfigure(getLanguageExtension(message.payload.language))
          });
        }
        break;
    }
  } catch (err) {
    console.error("Error processing bridge message:", err);
  }
});

// Send early ready signal once DOM is constructed
document.addEventListener("DOMContentLoaded", () => {
  sendToRN({ type: "READY" });
});
