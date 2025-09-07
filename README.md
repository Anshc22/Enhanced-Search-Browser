Find this plugin at 

https://chromewebstore.google.com/detail/enhanced-search/nfclmaieaddedjognjmckbmfdnobmbmo?authuser=0&hl=en-GB


Project reorganization note

This workspace contains the Chrome extension "Enhanced Search".

Changes made by assistant:
- Removed export menu UI; kept quick JSON export button
- Moved main search toggles into Advanced Settings and removed duplicate 'W' checkbox
- Improved highlight styling and context extraction
- Reordered result group header layout

Files of interest:
- `src/content.js` - content script
- `src/overlay.css` - overlay styles
- `src/options.html` / `src/options.js` - options page

# Enhanced Search Chrome Extension

Initial scaffolding for the Enhanced Search extension. This project replaces the browser's Ctrl+F with a richer, dark-mode search overlay.

Files added:
- `manifest.json` - extension manifest v3
- `background.js` - command listener
- `src/content.js` - content script scaffold and overlay injection
- `src/overlay.css` - dark-mode UI styles
- `src/worker.js` - web worker scaffold

Next steps:
- Implement search algorithms and highlighting
- Add tests and Playwright UI checks
- Finalize options page and persistence

Playwright test
----------------

Run the integration test that launches Chromium with the unpacked extension (requires Playwright):

```bash
npx playwright test tests/extension.spec.ts
```

Note: This test launches a persistent Chromium context and loads the extension from the project root. Ensure Playwright is installed and run from the project root.

Development notes
-----------------

- Use `npm install` then `npx playwright install` to set up Playwright.
- To run the extension locally: open `chrome://extensions`, enable Developer mode, click "Load unpacked" and select this project folder.
- To run the Playwright integration test use the command above; the test will create `tmp-user-data` and remove it on success/failure.

CI / Continuous Integration notes
-------------------------------

- Recommended: run Playwright tests in a CI job that has a headless Chromium and Xvfb (for Linux). Use the `npx playwright test` command.
- Before running tests, ensure `npx playwright install` has been executed in the environment.
- Cache `node_modules` between runs to speed up CI.

Packaging notes
---------------

- The extension currently has no build step; packaging for release can be done by zipping the project folder excluding dev files. Keep web worker disabled by default to avoid CSP issues on some hosts.


