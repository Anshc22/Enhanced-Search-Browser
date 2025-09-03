chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open-enhanced-search') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      // Check if content script is already loaded by sending a message first
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
        if (response && response.ready) {
          // Content script is already loaded, just send the open command
          chrome.tabs.sendMessage(tab.id, { action: 'open-enhanced-search' });
        }
      } catch (e) {
        // Content script not loaded, inject it
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['src/content.js']
        });
      }
    }
  }
});

// Create a context menu item to search selected text
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'search-selection',
    title: 'Search selection with Enhanced Search',
    contexts: ['selection']
  });
});

// Helper function to safely inject content script if not already loaded
async function ensureContentScriptLoaded(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    return response && response.ready;
  } catch (e) {
    // Content script not loaded, inject it
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['src/content.js']
    });
    return false;
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'search-selection' && tab && tab.id) {
    const isLoaded = await ensureContentScriptLoaded(tab.id);
    if (!isLoaded) {
      // Wait a moment for the content script to initialize
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, { action: 'search-selection', text: info.selectionText });
      }, 100);
    } else {
      chrome.tabs.sendMessage(tab.id, { action: 'search-selection', text: info.selectionText });
    }
  }
});

// Action (toolbar) click fallback
chrome.action.onClicked.addListener(async (tab) => {
  if (tab && tab.id) {
    const isLoaded = await ensureContentScriptLoaded(tab.id);
    if (!isLoaded) {
      // Wait a moment for the content script to initialize
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, { action: 'open-enhanced-search' });
      }, 100);
    } else {
      chrome.tabs.sendMessage(tab.id, { action: 'open-enhanced-search' });
    }
  }
});


