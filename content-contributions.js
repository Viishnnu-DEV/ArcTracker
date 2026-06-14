// content-contributions.js
console.log("Arc House Task Tracker: Contributions scraper loaded.");

function normalizeTitle(title) {
  if (!title) return "";
  let t = title.trim();
  t = t.replace(/\s+/g, ' '); // collapse whitespace
  t = t.toLowerCase();
  t = t.replace(/[.?!,;:\-]+$/, ''); // strip trailing punctuation
  t = t.replace(/[^\w\s.,?!'-]/g, ''); // strip emoji and weird characters, keep basic punctuation
  return t.trim();
}

function extractContributions() {
  const newItems = [];
  const processedTitles = new Set();
  
  // Find all text nodes that match an action type
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let n;
  
  while ((n = walk.nextNode())) {
    const text = n.textContent.trim();
    let actionType = null;
    
    if (/Watch a Video/i.test(text) || /Play/i.test(text) || /View/i.test(text)) {
      actionType = 'video';
    } else if (/Read Content/i.test(text)) {
      actionType = 'article';
    }
    
    if (actionType) {
      // We found an action type! Let's walk up 3-5 levels to get the row container
      let rowContainer = n.parentElement;
      for (let i = 0; i < 4; i++) {
        if (rowContainer && rowContainer.parentElement) {
          rowContainer = rowContainer.parentElement;
        }
      }
      
      if (!rowContainer) continue;
      
      let fullText = rowContainer.textContent.replace(/\s+/g, ' ').trim();
      
      // The full text will have the action, date, and title.
      // Strip out known boilerplate
      let rawTitle = fullText
        .replace(/Watch a Video/ig, '')
        .replace(/Read Content/ig, '')
        .replace(/Finish Onboarding/ig, '');
        
      // Strip dates if they match the old pattern
      const datePattern = /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?(?:,)?\s+\d{4}/ig;
      rawTitle = rawTitle.replace(datePattern, '');
      
      // Strip relative dates like Today, Yesterday
      rawTitle = rawTitle.replace(/\b(?:Today|Yesterday|\d+\s+(?:hours?|mins?|days?)\s+ago)\b/ig, '');
      
      // Strip partner handshakes
      if (rawTitle.includes('🤝')) {
        rawTitle = rawTitle.substring(rawTitle.indexOf('🤝') + 2);
      } else if (rawTitle.includes('·')) {
        rawTitle = rawTitle.substring(rawTitle.indexOf('·') + 1);
      } else if (rawTitle.includes('•')) {
        rawTitle = rawTitle.substring(rawTitle.indexOf('•') + 1);
      }
      
      rawTitle = rawTitle.trim();
      if (!rawTitle) continue;
      
      // Check for exact time in the row
      let exactTime = Date.now();
      try {
        const timeTag = rowContainer.querySelector('time[datetime], [datetime]');
        if (timeTag && timeTag.getAttribute('datetime')) {
          const parsed = new Date(timeTag.getAttribute('datetime')).getTime();
          if (!isNaN(parsed)) exactTime = parsed;
        }
      } catch(e) {}
      
      const normalizedTitle = normalizeTitle(rawTitle);
      if (normalizedTitle && !processedTitles.has(normalizedTitle)) {
        processedTitles.add(normalizedTitle);
        newItems.push({
          normalizedTitle,
          rawTitle,
          actionType,
          dateText: "Synced",
          lastSeen: exactTime
        });
      }
    }
  }
  
  if (newItems.length > 0) {
    chrome.storage.local.get(['completedItems'], (result) => {
      const existing = result.completedItems || [];
      const map = new Map();
      existing.forEach(item => map.set(item.normalizedTitle, item));
      newItems.forEach(item => map.set(item.normalizedTitle, item));
      
      chrome.storage.local.set({ completedItems: Array.from(map.values()) }, () => {
        chrome.runtime.sendMessage({ action: "scanComplete", count: map.size });
      });
    });
  } else {
    chrome.runtime.sendMessage({ action: "scanComplete", count: 0 });
  }
}

// Run extraction on load
extractContributions();

// Observe for dynamic changes
let debounceTimer;
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(extractContributions, 500);
});
observer.observe(document.body, { childList: true, subtree: true });

// Listen for manual sync request from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "rescan") {
    extractContributions();
    sendResponse({ status: "done" });
  }
});
