// Simple web worker scaffold for heavy search operations
self.addEventListener('message', (ev) => {
  const { html, query, options } = ev.data;
  const caseSensitive = options && options.caseSensitive;
  const wholeWord = options && options.wholeWord;
  const isRegex = options && options.isRegex;

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  let pattern;
  try {
    if (isRegex) pattern = new RegExp(query, caseSensitive ? 'g' : 'gi');
    else pattern = new RegExp(wholeWord ? `\\b${escapeRegExp(query)}\\b` : escapeRegExp(query), caseSensitive ? 'g' : 'gi');
  } catch (e) {
    postMessage({ error: 'invalid-regex' });
    return;
  }

  // Simple HTML text search: strip tags and scan
  const div = new DOMParser().parseFromString(html, 'text/html');
  const walker = div.createTreeWalker(div.body, NodeFilter.SHOW_TEXT, null, false);
  const matches = [];
  while (walker.nextNode()) {
    const text = walker.currentNode.nodeValue;
    if (!text || text.trim() === '') continue;
    let m;
    while ((m = pattern.exec(text)) !== null) {
      matches.push({
        context: text.substr(Math.max(0, m.index - 30), Math.min(60, text.length)),
        index: m.index,
        match: m[0]
      });
      if (!pattern.global) break;
    }
  }

  postMessage({ results: matches });
});


