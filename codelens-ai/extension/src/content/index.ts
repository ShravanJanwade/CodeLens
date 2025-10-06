/**
 * CodeLens AI - Content Script
 * Extracts GitHub context, detects code selection, and injects UI enhancements
 */

import './styles.css';

// Types
interface GitHubContext {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  type: 'file' | 'directory' | 'repo' | 'pr' | 'commit';
  url: string;
}

// Track if popup is currently shown
let currentPopup: HTMLElement | null = null;
let selectionTimeout: ReturnType<typeof setTimeout> | null = null;

// Extract GitHub context from current page
function extractContext(): GitHubContext | null {
  const url = window.location.href;
  const pathname = window.location.pathname;

  // Parse GitHub URL
  const match = pathname.match(/^\/([^\/]+)\/([^\/]+)(?:\/([^\/]+))?(?:\/([^\/]+))?(?:\/(.*))?/);
  
  if (!match) return null;

  const [, owner, repo, action, branchOrNumber, path] = match;

  // Skip non-repo pages
  if (!owner || !repo || ['settings', 'marketplace', 'explore'].includes(owner)) {
    return null;
  }

  let type: GitHubContext['type'] = 'repo';
  let branch = 'main';
  let filePath = '';

  if (action === 'tree') {
    type = 'directory';
    branch = branchOrNumber || 'main';
    filePath = path || '';
  } else if (action === 'blob') {
    type = 'file';
    branch = branchOrNumber || 'main';
    filePath = path || '';
  } else if (action === 'pull') {
    type = 'pr';
  } else if (action === 'commit') {
    type = 'commit';
  }

  // Try to get branch from page elements if not in URL
  if (branch === 'main') {
    const branchSelector = document.querySelector('[data-hotkey="w"] span, .branch-select-menu summary span');
    if (branchSelector) {
      branch = branchSelector.textContent?.trim() || 'main';
    }
  }

  return {
    owner,
    repo,
    branch,
    path: filePath,
    type,
    url,
  };
}

// Send context to background script
function sendContext() {
  const context = extractContext();
  
  if (context) {
    chrome.runtime.sendMessage({
      type: 'CONTEXT_UPDATED',
      payload: context,
    }).catch(() => {
      // Extension context invalidated, ignore
    });
  }
}

// Get selected code and line information
function getSelectedCode(): { code: string; file: string; startLine: number; endLine: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return null;

  const selectedText = selection.toString().trim();
  if (!selectedText || selectedText.length < 3) return null;

  // Get context
  const context = extractContext();
  if (!context) return null;

  // Try to find line numbers from GitHub's code view
  let startLine = 0;
  let endLine = 0;

  const range = selection.getRangeAt(0);
  const startContainer = range.startContainer;
  const endContainer = range.endContainer;

  // Find line number elements
  const findLineNumber = (node: Node): number => {
    let current: Node | null = node;
    while (current && current !== document.body) {
      if (current instanceof HTMLElement) {
        const lineId = current.id || current.closest('[id^="LC"], [id^="L"]')?.id;
        if (lineId) {
          const match = lineId.match(/(?:LC)?(\d+)/);
          if (match) return parseInt(match[1], 10);
        }
        
        // Also check for data-line-number attribute
        const lineAttr = current.getAttribute('data-line-number');
        if (lineAttr) return parseInt(lineAttr, 10);
      }
      current = current.parentNode;
    }
    return 0;
  };

  startLine = findLineNumber(startContainer);
  endLine = findLineNumber(endContainer);

  return {
    code: selectedText,
    file: context.path,
    startLine,
    endLine: endLine || startLine,
  };
}

// Create floating action popup
function createFloatingPopup(x: number, y: number, selectedCode: string) {
  // Remove existing popup
  removeFloatingPopup();

  const popup = document.createElement('div');
  popup.className = 'codelens-floating-popup';
  popup.innerHTML = `
    <div class="codelens-popup-content">
      <button class="codelens-popup-btn codelens-popup-primary" data-action="ask">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        Ask AI
      </button>
      <button class="codelens-popup-btn" data-action="explain">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        Explain
      </button>
      <button class="codelens-popup-btn" data-action="issues">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        Find Issues
      </button>
    </div>
  `;

  // Position the popup
  const viewportWidth = window.innerWidth;
  const popupWidth = 280;
  
  let left = x;
  if (x + popupWidth > viewportWidth - 20) {
    left = viewportWidth - popupWidth - 20;
  }

  popup.style.left = `${left}px`;
  popup.style.top = `${y + window.scrollY + 10}px`;

  // Handle button clicks
  popup.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('.codelens-popup-btn') as HTMLElement;
    if (!btn) return;

    const action = btn.dataset.action;
    handlePopupAction(action || '', selectedCode);
    removeFloatingPopup();
  });

  // Prevent selection from clearing when clicking popup
  popup.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.body.appendChild(popup);
  currentPopup = popup;

  // Auto-hide after 10 seconds
  setTimeout(() => {
    if (currentPopup === popup) {
      removeFloatingPopup();
    }
  }, 10000);
}

// Remove floating popup
function removeFloatingPopup() {
  if (currentPopup) {
    currentPopup.remove();
    currentPopup = null;
  }
}

// Handle popup action
function handlePopupAction(action: string, selectedCode: string) {
  const selectionData = getSelectedCode();
  const context = extractContext();
  
  // Send selected code to extension
  chrome.runtime.sendMessage({
    type: 'CODE_SELECTED',
    payload: {
      code: selectedCode,
      file: selectionData?.file || context?.path || '',
      startLine: selectionData?.startLine || 0,
      endLine: selectionData?.endLine || 0,
      action,
    },
  }).catch(() => {});

  // Open sidepanel
  chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' }).catch(() => {});
}

// Handle text selection
function handleSelection() {
  if (selectionTimeout) {
    clearTimeout(selectionTimeout);
  }

  selectionTimeout = setTimeout(() => {
    const selectedData = getSelectedCode();
    
    if (selectedData && selectedData.code.length >= 10) {
      // Get selection position
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Show floating popup near selection
      createFloatingPopup(rect.left, rect.bottom, selectedData.code);
    } else {
      removeFloatingPopup();
    }
  }, 300); // Debounce 300ms
}

// Handle click outside to remove popup
function handleDocumentClick(e: MouseEvent) {
  if (currentPopup && !currentPopup.contains(e.target as Node)) {
    removeFloatingPopup();
  }
}

// Initialize when DOM is ready
function init() {
  // Send initial context
  sendContext();

  // Listen for navigation changes (GitHub uses PJAX)
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        // Check if navigation occurred
        if (document.querySelector('[data-pjax-container]')) {
          sendContext();
          break;
        }
      }
    }
  });

  // Observe document for navigation
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Re-send on popstate (back/forward)
  window.addEventListener('popstate', sendContext);

  // Add CodeLens button to code view (if on a file page)
  addCodeLensButton();

  // Listen for text selection on code views
  document.addEventListener('mouseup', handleSelection);
  document.addEventListener('click', handleDocumentClick);

  // Clean up popup when selection changes
  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      // Delay removal to allow popup interaction
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) {
          removeFloatingPopup();
        }
      }, 100);
    }
  });
}

// Add CodeLens button to code view
function addCodeLensButton() {
  const context = extractContext();
  if (!context || context.type !== 'file') return;

  // Check if we already added button
  if (document.querySelector('.codelens-analyze-btn')) return;

  // Find the raw button container
  const rawBtn = document.querySelector('[data-view-component="true"] a[data-hotkey="b"]');
  if (!rawBtn) return;

  const container = rawBtn.closest('div');
  if (!container) return;

  // Create button
  const btn = document.createElement('button');
  btn.className = 'codelens-analyze-btn btn btn-sm';
  btn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path fill-rule="evenodd" d="M8 16A8 8 0 108 0a8 8 0 000 16zm.847-8.145a.625.625 0 00-.099-.814.666.666 0 00-.847 0L5.64 8.962a.625.625 0 00.374 1.122h.986v2.5a.5.5 0 00.5.5h1a.5.5 0 00.5-.5v-2.5h.986c.452 0 .69-.533.374-.817l-1.513-1.312z" />
    </svg>
    <span>Analyze</span>
  `;
  btn.title = 'Analyze with CodeLens AI';
  btn.style.cssText = 'display: inline-flex; align-items: center; gap: 4px; margin-left: 4px;';

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    // Open side panel
    chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' });
  });

  container.appendChild(btn);
}

// Wait for DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export for type checking
export {};
