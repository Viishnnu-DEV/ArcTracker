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
  // Use \s+ to handle non-breaking spaces or multiple spaces
  const datePattern = /^\s*[A-Za-z]{3}\s+\d{1,2}(?:st|nd|rd|th)?,\s+\d{4}\s*·\s*/;
  
  const allNodes = Array.from(document.querySelectorAll('*'));
  const potentialNodes = allNodes.filter(el => {
    if (!datePattern.test(el.textContent)) return false;
    // Check if any child also starts with the date. If so, let the child be the match.
    for (let i = 0; i < el.children.length; i++) {
       if (datePattern.test(el.children[i].textContent)) {
           return false;
       }
    }
    return true;
  });
  
  console.log(`Arc House Task Tracker: Found ${potentialNodes.length} potential contribution rows.`);
  
  const newItems = [];
  const processedTitles = new Set();
  
  potentialNodes.forEach(node => {
    let dateTitleContainer = node;
    let fullText = dateTitleContainer.textContent;
    let rawTitle = fullText.replace(datePattern, '').trim();
    
    // If the matched node only contains the date (e.g. wrapped in a span), walk up to get the title
    while (rawTitle === '' && dateTitleContainer.parentElement) {
       dateTitleContainer = dateTitleContainer.parentElement;
       fullText = dateTitleContainer.textContent;
       rawTitle = fullText.replace(datePattern, '').trim();
    }
    
    // Strip partner name prefix using 🤝 as delimiter
    if (/^[^🤝]+🤝\s*/.test(rawTitle)) {
      rawTitle = rawTitle.replace(/^[^🤝]+🤝\s*/, '');
    }
    
    // Find action type by walking up tree from the container
    let current = dateTitleContainer;
    let actionType = "Unknown";
    
    for (let i = 0; i < 8; i++) {
      if (current.parentElement) {
        current = current.parentElement;
        
        const actionEl = Array.from(current.querySelectorAll('*')).find(el => {
          const isClassMatch = el.className && typeof el.className === 'string' && el.className.includes('-InnerText-breakpointValues');
          let hasSibling = false;
          if (isClassMatch) {
             const next = el.nextElementSibling;
             if (next && /^x\d+$/.test(next.textContent.trim())) {
                hasSibling = true;
             }
          }
          const txt = el.textContent.trim();
          const isTextMatch = (txt === 'Read Content' || txt === 'Watch a Video' || txt === 'Finish Onboarding');
          return (isClassMatch && hasSibling) || isTextMatch;
        });
        
        if (actionEl) {
          actionType = actionEl.textContent.trim();
          break; // Stop at the first valid action type container to avoid grabbing other rows
        }
      }
    }
    
    // Attempt to fetch exact exact historical time if Arc includes it in the DOM
    let exactTime = Date.now();
    try {
      const timeTag = current.querySelector('time[datetime], [datetime]');
      if (timeTag && timeTag.getAttribute('datetime')) {
        const parsed = new Date(timeTag.getAttribute('datetime')).getTime();
        if (!isNaN(parsed)) exactTime = parsed;
      }
    } catch(e) {}
    
    if (actionType.includes("Finish Onboarding") || !rawTitle) {
      return; // skip non-content actions
    }
    
    const normalizedTitle = normalizeTitle(rawTitle);
    if (normalizedTitle && !processedTitles.has(normalizedTitle)) {
      processedTitles.add(normalizedTitle);
      newItems.push({
        normalizedTitle,
        rawTitle,
        actionType,
        dateText: (fullText.match(datePattern) ? fullText.match(datePattern)[0].trim() : fullText),
        lastSeen: exactTime
      });
    }
  });
  
  if (newItems.length > 0) {
    chrome.storage.local.get(['completedItems'], (result) => {
      let existing = result.completedItems || [];
      let existingMap = new Map(existing.map(item => [item.normalizedTitle, item]));
      
      newItems.forEach(item => {
        if (existingMap.has(item.normalizedTitle)) {
          existingMap.get(item.normalizedTitle).lastSeen = item.lastSeen;
        } else {
          existingMap.set(item.normalizedTitle, item);
        }
      });
      
      const merged = Array.from(existingMap.values());
      chrome.storage.local.set({ completedItems: merged }, () => {
        console.log(`Arc House Task Tracker: Synced ${merged.length} completed items (${newItems.length} found on this page).`);
      });
    });
  } else {
    console.warn("Arc House Task Tracker: 0 contribution rows extracted. The page structure might have changed.");
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
