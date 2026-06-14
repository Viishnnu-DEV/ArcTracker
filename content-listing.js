// content-listing.js
console.log("Arc House Task Tracker: Listing matcher loaded with 24-hour tracking.");

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

function normalizeTitle(title) {
  if (!title) return "";
  let t = title.trim().toLowerCase();
  // Replace all non-alphanumeric (except basic punctuation) with spaces 
  // so things like "A/B" become "A B" instead of "AB"
  t = t.replace(/[^\w.,?!'\-]+/g, ' ');
  t = t.replace(/\s+/g, ' ');
  t = t.replace(/[.?!,;:\-]+$/, '');
  return t.trim();
}

function injectBadge(card, normTitle, actionType) {
  if (card.querySelector('.arc-house-tracker-badge')) return;
  if (window.getComputedStyle(card).position === 'static') {
    try { card.style.position = 'relative'; } catch(e){}
  }
  try {
    const badge = document.createElement('div');
    badge.className = 'arc-house-tracker-badge';
    badge.title = "Marked as completed. Click to toggle override.";
    badge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      chrome.storage.local.get(['manualOverrides'], (res) => {
        const overrides = res.manualOverrides || {};
        overrides[normTitle] = { time: 0, type: actionType }; // 0 means forcefully uncompleted
        chrome.storage.local.set({ manualOverrides: overrides }, () => {
          removeBadge(card);
          setTimeout(matchCards, 100);
        });
      });
    });
    
    card.appendChild(badge);
    card.style.opacity = '0.7';
  } catch(e) {}
}

function injectManualAddButton(card, normTitle, actionType) {
  if (card.querySelector('.arc-house-tracker-add')) return;
  if (window.getComputedStyle(card).position === 'static') {
    try { card.style.position = 'relative'; } catch(e){}
  }
  try {
    const btn = document.createElement('div');
    btn.className = 'arc-house-tracker-add';
    btn.title = "Mark as completed manually";
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 8 12 16"></polyline><polyline points="8 12 16 12"></polyline></svg>`;
    
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      chrome.storage.local.get(['manualOverrides'], (res) => {
        const overrides = res.manualOverrides || {};
        overrides[normTitle] = { time: Date.now(), type: actionType };
        chrome.storage.local.set({ manualOverrides: overrides }, () => {
          btn.remove();
          setTimeout(matchCards, 100);
        });
      });
    });
    card.appendChild(btn);
  } catch(e){}
}

function removeBadge(card) {
  const badge = card.querySelector('.arc-house-tracker-badge');
  if (badge) badge.remove();
  const addBtn = card.querySelector('.arc-house-tracker-add');
  if (addBtn) addBtn.remove();
  card.style.opacity = '1';
}

function isCompleted(normTitle, completedItems, manualOverrides) {
  // Check overrides
  const override = manualOverrides[normTitle];
  if (override) {
    if (typeof override === 'number') {
      if (override === 0) return false;
      if (override > 0) return true;
    } else {
      if (override.time === 0) return false;
      if (override.time > 0) return true;
    }
  }
  
  // Check contributions
  return completedItems.some(item => {
    return item.normalizedTitle === normTitle || 
           item.normalizedTitle.includes(normTitle) || 
           normTitle.includes(item.normalizedTitle);
  });
}

function matchCards() {
  chrome.storage.local.get(['completedItems', 'manualOverrides'], (result) => {
    const completedItems = result.completedItems || [];
    const manualOverrides = result.manualOverrides || {};
    
    const cards = document.querySelectorAll('[data-content-item="true"]');
    if (cards.length === 0) return;
    
    let matchCount = 0;
    
    cards.forEach(card => {
      let title = null;
      let actionType = 'article'; // default
      
      const link = Array.from(card.querySelectorAll('a')).find(a => {
        const aria = a.getAttribute('aria-label');
        return aria && /^(Read more about|Watch|Play|View)\s+(.+)$/i.test(aria);
      });
      
      if (link) {
        const match = link.getAttribute('aria-label').match(/^(?:Read more about|Watch|Play|View)\s+(.+)$/i);
        if (match && match[1]) {
          title = match[1];
          if (/^(Watch|Play)/i.test(match[1])) {
            actionType = 'video';
          }
        }
      }
      
      if (!title) {
        const fallback = Array.from(card.querySelectorAll('*')).find(el => {
          return el.className && typeof el.className === 'string' && el.className.includes('-Title');
        });
        if (fallback) title = fallback.textContent.trim();
      }
      
      if (title) {
        const normTitle = normalizeTitle(title);
        
        removeBadge(card);
        
        if (isCompleted(normTitle, completedItems, manualOverrides)) {
          injectBadge(card, normTitle, actionType);
          matchCount++;
        } else {
          injectManualAddButton(card, normTitle, actionType);
        }
      }
    });
  });
}

// Initial run
matchCards();

let debounceTimer;
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(matchCards, 300);
});
observer.observe(document.body, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "rescan") {
    matchCards();
    sendResponse({ status: "done" });
  }
});
