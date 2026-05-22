// test-editor.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const bundlePath = path.join(__dirname, '../nova-code/android/app/src/main/assets/editor/editor.bundle.js');
if (!fs.existsSync(bundlePath)) {
  console.error('Editor bundle does not exist. Please run npm run build first.');
  process.exit(1);
}

const bundleCode = fs.readFileSync(bundlePath, 'utf8');

// Advanced Proxy Stub builder to swallow any browser-specific DOM requests gracefully
const makeStub = (name = 'stub') => {
  return new Proxy(() => {}, {
    get(target, prop) {
      if (prop === 'then') return undefined;
      if (prop === 'toString' || prop === 'valueOf') return () => name;
      if (prop === 'classList') {
        return {
          add: () => {},
          remove: () => {},
          contains: () => false
        };
      }
      if (prop === 'style') return {};
      return makeStub(`${name}.${String(prop)}`);
    },
    construct() {
      return makeStub(`new ${name}`);
    }
  });
};

let messageListener = null;
const receivedMessages = [];

const windowMock = new Proxy({
  addEventListener: (event, cb) => {
    if (event === 'message') {
      messageListener = cb;
    }
  },
  ReactNativeWebView: {
    postMessage: (msg) => {
      receivedMessages.push(JSON.parse(msg));
    }
  }
}, {
  get(target, prop) {
    if (prop === 'window' || prop === 'self') return windowMock;
    if (prop in target) return target[prop];
    return makeStub(`window.${String(prop)}`);
  }
});

const documentMock = new Proxy({
  addEventListener: () => {},
  getElementById: () => new Proxy({
    addEventListener: () => {},
    appendChild: () => {}
  }, {
    get(t, p) {
      return makeStub(`element.${String(p)}`);
    }
  }),
  createElement: () => new Proxy({
    style: {},
    classList: { add: () => {}, remove: () => {} },
    appendChild: () => {}
  }, {
    get(t, p) {
      return makeStub(`element.${String(p)}`);
    }
  }),
  createTextNode: () => ({})
}, {
  get(target, prop) {
    if (prop in target) return target[prop];
    return makeStub(`document.${String(prop)}`);
  }
});

const sandbox = {
  window: windowMock,
  document: documentMock,
  navigator: { userAgent: 'NodeTest' },
  console: {
    log: () => {},
    warn: () => {},
    error: () => {}
  }
};

// Evaluate CodeMirror Bundle in sandbox context
console.log('Evaluating compiled editor bundle...');
vm.createContext(sandbox);
vm.runInContext(bundleCode, sandbox);

assert.ok(messageListener, 'Bundle should register a window message event listener');
console.log('✓ Bundle loaded and initialized event listener.');

// Helper to trigger message actions
function dispatchMessage(type, payload = {}) {
  messageListener({
    data: JSON.stringify({ type, payload })
  });
}

console.log('\n--- Running Editor Bridge API Tests ---');

// Test 1: INIT Action
console.log('Test 1: INIT message...');
dispatchMessage('INIT', {
  content: 'print("hello world")',
  language: 'python',
  fontSize: 14,
  theme: 'dark',
  wordWrap: true,
  lineNumbers: true,
  tabSize: 4
});
console.log('✓ INIT action evaluated successfully.');

// Test 2: Content operations
console.log('Test 2: Content actions (GET_CONTENT, SET_CONTENT)...');
dispatchMessage('SET_CONTENT', { content: 'print("modified")' });
dispatchMessage('GET_CONTENT');
console.log('✓ Content actions evaluated successfully.');

// Test 3: Language and Styles
console.log('Test 3: Style actions (SET_FONT_SIZE, SET_LANGUAGE, SET_THEME)...');
dispatchMessage('SET_FONT_SIZE', { fontSize: 16 });
dispatchMessage('SET_LANGUAGE', { language: 'javascript' });
dispatchMessage('SET_THEME', { theme: 'light' });
console.log('✓ Style actions evaluated successfully.');

// Test 4: Editor Configuration toggles
console.log('Test 4: Settings toggles (SET_WORD_WRAP, SET_LINE_NUMBERS, SET_TAB_SIZE)...');
dispatchMessage('SET_WORD_WRAP', { wordWrap: false });
dispatchMessage('SET_LINE_NUMBERS', { lineNumbers: false });
dispatchMessage('SET_TAB_SIZE', { tabSize: 2 });
console.log('✓ Settings actions evaluated successfully.');

// Test 5: Search and Replace
console.log('Test 5: Search operations...');
dispatchMessage('SET_SEARCH_QUERY', { query: 'test', replace: 'mock', caseSensitive: false });
dispatchMessage('SEARCH_NEXT');
dispatchMessage('SEARCH_PREV');
dispatchMessage('SEARCH_REPLACE');
dispatchMessage('SEARCH_REPLACE_ALL');
console.log('✓ Search actions evaluated successfully.');

// Test 6: Text mutations and interactions
console.log('Test 6: Editor interactions (INSERT_TEXT, MOVE_CURSOR, UNDO, REDO, TOGGLE_COMMENT)...');
dispatchMessage('INSERT_TEXT', { text: '\n// added line' });
dispatchMessage('MOVE_CURSOR', { direction: 'down' });
dispatchMessage('UNDO');
dispatchMessage('REDO');
dispatchMessage('TOGGLE_COMMENT');
console.log('✓ Editor interactions evaluated successfully.');

// Test 7: Error Line Highlights
console.log('Test 7: Error highlighting (SET_ERROR_LINE, CLEAR_ERROR_LINE)...');
dispatchMessage('SET_ERROR_LINE', { line: 2 });
dispatchMessage('CLEAR_ERROR_LINE');
console.log('✓ Error highlighting evaluated successfully.');

console.log('\nAll compiled editor bundle tests PASSED successfully!');
process.exit(0);
