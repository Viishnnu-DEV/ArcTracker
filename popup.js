document.addEventListener('DOMContentLoaded', () => {
  const countEl = document.getElementById('item-count');
  const videoCountEl = document.getElementById('video-count');
  const articleCountEl = document.getElementById('article-count');
  const videoUnlockEl = document.getElementById('video-unlock');
  const articleUnlockEl = document.getElementById('article-unlock');
  const rescanBtn = document.getElementById('rescan-btn');
  const clearBtn = document.getElementById('clear-btn');
  
  function formatTime(timestamp) {
    const d = new Date(timestamp);
    let hours = d.getHours();
    let minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    minutes = minutes < 10 ? '0' + minutes : minutes;
    return `${hours}:${minutes} ${ampm}`;
  }
  
  function updateCount() {
    chrome.storage.local.get(['completedItems', 'clickTimes', 'manualOverrides'], (res) => {
      const items = res.completedItems || [];
      const clickTimes = res.clickTimes || {};
      const manualOverrides = res.manualOverrides || {};
      
      // Calculate totals
      let total = items.length;
      Object.values(manualOverrides).forEach(v => {
        if ((typeof v === 'number' && v > 0) || (typeof v === 'object' && v.time > 0)) total++;
      });
      Object.keys(clickTimes).forEach(k => {
        // If not already in items
        if (!items.some(i => i.normalizedTitle === k)) total++;
      });
      countEl.textContent = total;
      
      // Calculate 24h quotas
      const now = Date.now();
      const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
      
      let recentVideos = [];
      let recentArticles = [];
      
      // We process all clickTimes and manualOverrides to find exact timestamps
      // My Contributions page gives us dates, but we want exact times. If it's only in completedItems, 
      // we don't have the exact time, so we just use lastSeen (sync time) as a rough fallback.
      
      const allEvents = [];
      
      Object.values(clickTimes).forEach(v => {
        if (v && v.time && (now - v.time < TWENTY_FOUR_HOURS)) {
          allEvents.push({ time: v.time, type: v.type || 'article' });
        }
      });
      
      Object.values(manualOverrides).forEach(v => {
        if (v && typeof v === 'object' && v.time > 0 && (now - v.time < TWENTY_FOUR_HOURS)) {
          allEvents.push({ time: v.time, type: v.type || 'article' });
        } else if (typeof v === 'number' && v > 0 && (now - v < TWENTY_FOUR_HOURS)) {
          allEvents.push({ time: v, type: 'article' });
        }
      });
      
      items.forEach(item => {
        if (item.lastSeen && (now - item.lastSeen < TWENTY_FOUR_HOURS)) {
          // Check if we didn't already count this title in clickTimes/manualOverrides
          let type = 'article';
          if (item.actionType && /video/i.test(item.actionType)) type = 'video';
          allEvents.push({ time: item.lastSeen, type: type });
        }
      });
      
      // Sort and filter to recent 24h
      const eventsWithin24h = allEvents.filter(e => now - e.time < TWENTY_FOUR_HOURS);
      eventsWithin24h.forEach(e => {
        if (e.type === 'video') recentVideos.push(e);
        else recentArticles.push(e);
      });
      
      // Sort oldest first
      recentVideos.sort((a,b) => a.time - b.time);
      recentArticles.sort((a,b) => a.time - b.time);
      
      videoCountEl.textContent = recentVideos.length;
      articleCountEl.textContent = recentArticles.length;
      
      if (recentVideos.length >= 4) {
        const oldest = recentVideos[0].time;
        videoUnlockEl.textContent = "Next slot opens at " + formatTime(oldest + TWENTY_FOUR_HOURS);
      } else {
        videoUnlockEl.textContent = "";
      }
      
      if (recentArticles.length >= 5) {
        const oldest = recentArticles[0].time;
        articleUnlockEl.textContent = "Next slot opens at " + formatTime(oldest + TWENTY_FOUR_HOURS);
      } else {
        articleUnlockEl.textContent = "";
      }
    });
  }
  
  updateCount();
  
  rescanBtn.addEventListener('click', () => {
    rescanBtn.textContent = "Rescanning...";
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {action: "rescan"}, (response) => {
          if (chrome.runtime.lastError) {
             rescanBtn.textContent = "Error: Open Arc page";
             setTimeout(() => { rescanBtn.textContent = "Rescan Active Tab"; }, 2000);
          } else {
             setTimeout(() => {
               updateCount();
               rescanBtn.textContent = "Done!";
               setTimeout(() => { rescanBtn.textContent = "Rescan Active Tab"; }, 2000);
             }, 500);
          }
        });
      }
    });
  });
  
  clearBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to clear all tracked items and manual overrides?")) {
      chrome.storage.local.clear(() => {
        updateCount();
        clearBtn.textContent = "Cleared!";
        setTimeout(() => { clearBtn.textContent = "Clear Stored Data"; }, 2000);
      });
    }
  });
});
