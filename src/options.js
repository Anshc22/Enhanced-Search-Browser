// options helper (not heavily used yet)
document.addEventListener('DOMContentLoaded', () => {
  const ids = ['case','whole','regex','html','worker'];
  const more = ['filterHeadings','filterLinks','filterParagraphs'];
  chrome.storage.local.get([...ids,'theme',...more], (res) => {
    ids.forEach(id => { const el = document.getElementById('opt-'+id); if (el) el.checked = !!res[id]; });
    const theme = document.getElementById('opt-theme'); if (theme) theme.value = res.theme || 'dark';
    // element filters
    const fh = document.getElementById('opt-filter-headings'); if (fh) fh.checked = !!res.filterHeadings;
    const fl = document.getElementById('opt-filter-links'); if (fl) fl.checked = !!res.filterLinks;
    const fp = document.getElementById('opt-filter-paragraphs'); if (fp) fp.checked = !!res.filterParagraphs;
  });
});

