# Enhanced Search Chrome Extension

A powerful Chrome extension that replaces the browser's default find (Ctrl+F) with an advanced search overlay featuring live search, regex support, multi-term queries, and smart filtering.

<img width="356" height="385" alt="Sample" src="https://github.com/user-attachments/assets/aec4266a-4ebe-4310-b17d-82b877e05fbe" />

<img width="957" height="439" alt="Both Perpspectives" src="https://github.com/user-attachments/assets/572ade8a-1fc6-44eb-b3f6-29dd19dd7eda" />


## Features

- **Live Search**: Results appear as you type with debounced input
- **Advanced Search Modes**: Case-sensitive, whole word, and regex pattern matching
- **Multi-term Search**: Search for multiple terms with distinct highlight colors
- **Smart Filtering**: Filter by HTML elements (headings, links, paragraphs) and exclude code blocks
- **Draggable Overlay**: Move and position the search interface anywhere on the page
- **Export Results**: Save search results as TXT, CSV, or JSON files
- **Accessibility**: Full keyboard navigation, ARIA labels, and focus management
- **Dark Theme**: Beautiful dark interface with smooth animations
- **Performance Optimized**: Chunked scanning for responsive performance on large pages

## Installation

### From Chrome Web Store
*(Coming Soon)*

### Manual Installation
1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the project folder
5. The extension will be installed and ready to use

## Usage

- **Activate**: Press `Ctrl+F` (or `Cmd+F` on Mac) to open Enhanced Search
- **Search**: Type your query to see live results
- **Navigate**: Use arrow keys or click results to jump between matches
- **Settings**: Click the "Settings" button to access advanced options
- **Close**: Press `Escape` or click the X button

### Advanced Features

- **Regex Search**: Enable regex mode for pattern matching
- **Multi-term**: Separate terms with commas for multiple highlights
- **Element Filtering**: Toggle specific HTML elements in/out of results
- **Compact Mode**: Reduce overlay size for smaller screens
- **Export**: Save current search results for later analysis

## Privacy

Enhanced Search operates entirely locally in your browser:
- No data is transmitted to external servers
- Search queries and results stay on your device
- Optional settings are stored locally using Chrome's storage API
- See [privacy.html](privacy.html) for full privacy policy

## Development

### Requirements
- Node.js and npm (for testing)
- Playwright (for automated testing)

### Setup
```bash
npm install
npx playwright install
```

### Testing
```bash
npx playwright test tests/extension.spec.ts
```

### Project Structure
```
├── manifest.json          # Extension manifest
├── background.js           # Service worker
├── src/
│   ├── content.js         # Main content script
│   ├── overlay.css        # Overlay styling
│   ├── options.html       # Options page
│   └── options.js         # Options page script
├── privacy.html           # Privacy policy
└── README.md             # This file
```


## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have suggestions, please [open an issue](https://github.com/Anshc22/Enhanced-Search-Browser/issues) on GitHub.
