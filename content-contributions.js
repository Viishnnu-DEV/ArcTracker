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
  
  // Find all text nodes in the body
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let n;
  
  // Ultra-forgiving date pattern: Month Day, Year
  const datePattern = /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?,\s+\d{4}/i;
  
  while ((n = walk.nextNode())) {
    let fullText = n.textContent.trim();
    
    // If the text node has the date pattern, it's a contribution item!
    if (datePattern.test(fullText)) {
      
      // Some text nodes are split. Walk up to parent to get full text if needed
      let parent = n.parentElement;
      for (let i=0; i<3; i++) {
        if (parent && parent.textContent.trim().length > fullText.length && datePattern.test(parent.textContent)) {
           fullText = parent.textContent.trim();
        }
        if (parent) parent = parent.parentElement;
      }
      
      // Extract title by stripping everything up to the handshake 🤝 or middle dot · or bullet •
      let rawTitle = fullText.replace(datePattern, '').trim();
      
      // Strip partner names and separators
      if (rawTitle.includes('🤝')) {
        rawTitle = rawTitle.substring(rawTitle.indexOf('🤝') + 2);
      } else if (rawTitle.includes('·')) {
        rawTitle = rawTitle.substring(rawTitle.indexOf('·') + 1);
      } else if (rawTitle.includes('•')) {
        rawTitle = rawTitle.substring(rawTitle.indexOf('•') + 1);
      }
      
      rawTitle = rawTitle.trim();
      
      if (!rawTitle) continue;
      
      // Now hunt for the action type (Watch a Video, Read Content) near this node
      let actionType = 'article'; // Default
      let searchNode = n.parentElement;
      for (let i = 0; i < 8; i++) {
        if (searchNode) {
          const content = searchNode.textContent || "";
          if (/Watch a Video/i.test(content) || /Play/i.test(content) || /View/i.test(content)) {
            actionType = 'video';
            break;
          }
          searchNode = searchNode.parentElement;
        }
      }
      
      // See if Arc provides a hidden exact time
      let exactTime = Date.now();
      try {
        let timeNode = n.parentElement;
        for (let i = 0; i < 5; i++) {
          if (timeNode) {
            const timeTag = timeNode.querySelector('time[datetime], [datetime]');
            if (timeTag && timeTag.getAttribute('datetime')) {
              const parsed = new Date(timeTag.getAttribute('datetime')).getTime();
              if (!isNaN(parsed)) {
                exactTime = parsed;
                break;
              }
            }
            timeNode = timeNode.parentElement;
          }
        }
      } catch(e) {}
      
      const normalizedTitle = normalizeTitle(rawTitle);
      if (normalizedTitle && !processedTitles.has(normalizedTitle)) {
        processedTitles.add(normalizedTitle);
        newItems.push({
          normalizedTitle,
          rawTitle,
          actionType,
          dateText: fullText.match(datePattern)[0].trim(),
          lastSeen: exactTime
        });
      }
    }
  }
  
  if (newItems.length > 0) {
    chrome.storage.local.get(['completedItems'], (result) => {
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
