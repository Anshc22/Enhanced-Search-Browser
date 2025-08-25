chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open-enhanced-search') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/content.js']
      });
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

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'search-selection' && tab && tab.id) {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/content.js'] });
    chrome.tabs.sendMessage(tab.id, { action: 'search-selection', text: info.selectionText });
  }
});

// Action (toolbar) click fallback
chrome.action.onClicked.addListener(async (tab) => {
  if (tab && tab.id) {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/content.js'] });
    chrome.tabs.sendMessage(tab.id, { action: 'open-enhanced-search' });
  }
});


