// contextAwareCandidateExtractor.js
// Context-aware extractor that adapts to Gmail regions

/**
 * Extract candidates with region context
 * @param {Object|null} region - The region object from regionManager, or null for global extraction
 * @returns {Array} Array of candidate objects
 */
export function extractCandidates(region = null) {
    if (!region) {
        return extractAllClickableCandidates();
    }

    // Context-aware extraction based on region
    switch (region.id) {
        case 'compose-window':
            return extractComposeWindowCandidates(region);
        case 'header':
            return extractHeaderCandidates(region);
        case 'top-navigation':
            return extractTopNavigationCandidates(region);
        case 'mail-navigation':
            return extractMailNavigationCandidates(region);
        case 'main':
            return extractMainCandidates(region);
        case 'left-panel':
            return extractLeftPanelCandidates(region);
        case 'right-panel':
            return extractRightPanelCandidates(region);
        default:
            return extractGenericCandidates(region);
    }
}

/**
 * Extract candidates from compose window region
 * Focus: To/Cc/Bcc fields, Subject, Message body, Send button, formatting, attachments
 */
function extractComposeWindowCandidates(region) {
    const candidates = [];
    const seen = new Set();
    const container = region.element;

    const push = (el, reason = '') => {
        if (!el || seen.has(el)) return;
        if (!isElementVisible(el)) return;
        if (shouldIgnoreElement(el)) return;

        const r = el.getBoundingClientRect();
        if (r.width < 6 || r.height < 6) return;

        seen.add(el);
        candidates.push({
            element: el,
            features: extractFeatures(el, reason),
        });
    };

    console.log('✍️ Extracting compose window candidates');

    // Type of response dropdown (inline compose only: Reply/Reply All/Forward switcher)
    queryAllIn(container, '.J-JN-M-I.Un[role="button"]').forEach(el => {
        push(el, 'compose:type-of-response');
    });

    // Header buttons (Minimize, Pop-out, Close/Save) - floating dialog only
    queryAllIn(container, '.Hl, .Hq, .Ha').forEach(el => {
        push(el, 'compose:header-button');
    });

    // Recipient placeholder (shows "Recipients" text, needs to be clicked to reveal input)
    queryAllIn(container, '.aoD.hl[tabindex]').forEach(el => {
        push(el, 'compose:recipient-placeholder');
    });

    // Recipient fields (To/Cc/Bcc inputs - these appear after clicking placeholder)
    queryAllIn(container, 'input[aria-label*="To"], input[aria-label*="Cc"], input[aria-label*="Bcc"], input.agP').forEach(el => {
        push(el, 'compose:recipient-field');
    });

    // Cc/Bcc toggle links
    queryAllIn(container, '.aB.gQ').forEach(el => {
        push(el, 'compose:cc-bcc-toggle');
    });

    // Subject field
    queryAllIn(container, 'input.aoT, input[placeholder="Subject"]').forEach(el => {
        push(el, 'compose:subject-field');
    });

    // Message body
    queryAllIn(container, '.Am[contenteditable="true"], textarea.Ak').forEach(el => {
        push(el, 'compose:message-body');
    });

    // Send buttons (Send + More options dropdown)
    queryAllIn(container, '.T-I.aoO, .T-I.hG, .T-I[aria-label*="Send"]').forEach(el => {
        push(el, 'compose:send-button');
    });

    // ALL formatting buttons (.J-Z-I)
    queryAllIn(container, '.J-Z-I[role="button"]').forEach(el => {
        if (!seen.has(el)) push(el, 'compose:formatting-button');
    });

    // ALL formatting dropdowns (.J-Z-M-I)
    queryAllIn(container, '.J-Z-M-I[role="button"], .J-Z-M-I[role="listbox"]').forEach(el => {
        if (!seen.has(el)) push(el, 'compose:formatting-dropdown');
    });

    // ALL toolbar buttons (.wG - attach, link, emoji, drive, photo, etc.)
    queryAllIn(container, '.wG.J-Z-I').forEach(el => {
        if (!seen.has(el)) push(el, 'compose:toolbar-button');
    });

    // More options (three dots)
    queryAllIn(container, '.J-JN-M-I[role="button"]').forEach(el => {
        if (!seen.has(el)) push(el, 'compose:more-options');
    });

    // Discard draft
    queryAllIn(container, '.oh[role="button"]').forEach(el => {
        if (!seen.has(el)) push(el, 'compose:discard-draft');
    });

    // Catch any other buttons we missed
    queryAllIn(container, 'button, div[role="button"][tabindex]').forEach(el => {
        if (!seen.has(el)) push(el, 'compose:generic-button');
    });

    console.log(`✍️ Compose Window: ${candidates.length} candidates`);
    return candidates;
}

/**
 * Extract candidates from header region
 * Focus: Main menu, Search, Status, Settings, Google apps
 */
function extractHeaderCandidates(region) {
    const candidates = [];
    const seen = new Set();
    const container = region.element;

    const push = (el, reason = '') => {
        if (!el || seen.has(el)) return;
        if (!isElementVisible(el)) return;
        if (shouldIgnoreElement(el)) return;

        const r = el.getBoundingClientRect();
        if (r.width < 6 || r.height < 6) return;

        seen.add(el);
        candidates.push({
            element: el,
            features: extractFeatures(el, reason),
        });
    };

    // Priority header controls with specific aria-labels
    const headerTargets = [
        { selector: '[aria-label="Main menu"][role="button"]', reason: 'header:main-menu' },
        { selector: '[aria-label="Search mail"]', reason: 'header:search' },
        { selector: 'form[aria-label="Search mail"]', reason: 'header:search-form' },
        { selector: '[aria-label^="Status:"][role="button"]', reason: 'header:status' },
        { selector: '[aria-label="Settings"][role="button"]', reason: 'header:settings' },
        { selector: '[aria-label="Google apps"][role="button"]', reason: 'header:google-apps' },
        { selector: '[aria-label="Support"][role="button"]', reason: 'header:support' },
    ];

    headerTargets.forEach(({ selector, reason }) => {
        const elements = queryAllIn(container, selector);
        elements.forEach(el => push(el, reason));
    });

    // Search input field
    queryAllIn(container, 'input[type="text"][aria-label*="Search"]').forEach(el => {
        push(el, 'header:search-input');
    });

    // Profile/account button (often has aria-label with email or "Google Account")
    queryAllIn(container, '[aria-label*="Google Account"], [aria-label*="account" i]').forEach(el => {
        if (el.getAttribute('role') === 'button' || el.tagName.toLowerCase() === 'a') {
            push(el, 'header:account');
        }
    });

    console.log(`📍 Header: ${candidates.length} candidates`);
    return candidates;
}

/**
 * Extract candidates from top navigation region.
 *
 * Gmail reuses div.aeH across views but swaps which child is active.
 * The actual toolbar DOM lives inside:
 *   • div.nH.aqK  — toolbar buttons (Select, Refresh, Sort, pagination …)
 *   • div.G6[role="toolbar"][aria-label*="search refinement"]  — filter chips
 *   • div.Th      — result-type tabs (Mail / Conversations / Spaces)
 *
 * These three containers can live in different places depending on the view:
 *   Inbox:           aeH → active child → nH.aqK
 *   Starred:         aeH → active child → nH.aqK  +  G6
 *   Advanced search: aeH children ALL hidden;
 *                    nH.aqK moved into role="main";
 *                    G6 + Th moved under #:3 → active child → [data-srm="email"]
 *
 * So instead of trusting region.element as the query root, we resolve
 * each container ourselves.
 */
function extractTopNavigationCandidates(region) {
    const candidates = [];
    const seen = new Set();

    const push = (el, reason = '') => {
        if (!el || seen.has(el)) return;
        if (!isElementVisible(el)) return;
        if (shouldIgnoreElement(el)) return;

        const r = el.getBoundingClientRect();
        if (r.width < 6 || r.height < 6) return;

        seen.add(el);
        candidates.push({
            element: el,
            features: extractFeatures(el, reason),
        });
    };

    // ----------------------------------------------------------
    // HANDLE COMBINED REGION (aeH/nH.aqK + biW + aKk)
    // ----------------------------------------------------------
    const regionElement = region.element;
    if (regionElement.dataset && regionElement.dataset.combinedRegion === 'true') {
        console.log('🧭 Extracting from combined top-navigation region');

        const toolbar = regionElement._toolbarElement;
        const biW = regionElement._biWElement;
        const categoryTabs = regionElement._categoryTabsElement;

        // Extract from toolbar (can be aeH or nH.aqK)
        if (toolbar) {
            // Check if it's aeH (has children) or nH.aqK (direct toolbar)
            const isAeH = toolbar.classList.contains('aeH');

            if (isAeH) {
                // It's aeH - extract from all its visible children
                queryAllIn(toolbar, '[role="button"], button, .T-I').forEach(el => {
                    push(el, 'top-nav:toolbar');
                });
            } else {
                // It's nH.aqK or other direct toolbar
                queryAllIn(toolbar, '[role="button"], button, .T-I').forEach(el => {
                    push(el, 'top-nav:toolbar');
                });
            }
        }

        // Extract from biW
        if (biW) {
            queryAllIn(biW, '[role="button"], button').forEach(el => {
                push(el, 'top-nav:biw');
            });
        }

        // Extract from category tabs (Primary/Promotions/Social)
        if (categoryTabs) {
            // Tab elements with role="tab"
            queryAllIn(categoryTabs, '[role="tab"]').forEach(el => {
                push(el, 'top-nav:category-tab');
            });

            // The "Select which tabs to show or hide" button
            queryAllIn(categoryTabs, '[role="button"]').forEach(el => {
                push(el, 'top-nav:tab-settings');
            });
        }

        // Geometry fallback: when this combined region came from layoutAnalyzer's
        // block-scan (Gmail's CSS classes weren't found) instead of named
        // aeH/biW/aKk elements, we only have a best-effort guess at which member
        // is which -- so also scan every raw member generically. `push` dedupes
        // via `seen`, so this is a no-op wherever the named-slot extraction above
        // already found everything.
        if (regionElement._geometryMembers) {
            regionElement._geometryMembers.forEach(member => {
                queryAllIn(member, '[role="button"], button, .T-I, [role="tab"]').forEach(el => {
                    push(el, 'top-nav:geometry-member');
                });
            });
        }

        console.log(`📍 Top Navigation (combined): ${candidates.length} candidates`);
        return candidates;
    }

    // ----------------------------------------------------------
    // RESOLVE CONTAINERS (standard aeH mode)
    // ----------------------------------------------------------
    const aeH = document.querySelector('div.aeH');

    // Find the active (visible) child of aeH, if any
    let activeChild = null;
    if (aeH) {
        for (const child of aeH.children) {
            const style = window.getComputedStyle(child);
            if (style.display !== 'none') {
                activeChild = child;
                break;
            }
        }
    }

    // Determine whether all aeH children are hidden (advanced-search mode)
    const allAeHChildrenHidden = aeH
        ? Array.from(aeH.children).length > 0 &&
        Array.from(aeH.children).every(c => window.getComputedStyle(c).display === 'none')
        : true; // treat missing aeH same as all-hidden

    // --- nH.aqK (toolbar: Select, Refresh, Sort, pagination …) ---
    // This container only exists inside aeH's active child.  When all
    // aeH children are hidden (advanced search) the classic toolbar is
    // gone entirely — do NOT fall back to role="main", that's the email
    // list and would cause top-nav and main to overlap.
    let nHaqK = null;
    if (activeChild) {
        nHaqK = activeChild.querySelector('div.nH.aqK');
    }

    // --- G6 search-refinement toolbar ---
    let g6Toolbar = null;
    if (activeChild) {
        g6Toolbar = activeChild.querySelector(
            'div.G6[role="toolbar"][aria-label*="search refinement" i], ' +
            '[role="toolbar"][aria-label*="search refinement" i]'
        );
    }
    if (!g6Toolbar && allAeHChildrenHidden) {
        // Advanced-search fallback: G6 lives under [data-srm="email"]
        // (do NOT use getElementById for Gmail's dynamic :N IDs — they change per session)
        const srmEmail = document.querySelector('[data-srm="email"]');
        if (srmEmail) {
            g6Toolbar = srmEmail.querySelector(
                'div.G6[role="toolbar"][aria-label*="search refinement" i], ' +
                '[role="toolbar"][aria-label*="search refinement" i]'
            );
        }
        // Last resort: anywhere in role="main"
        if (!g6Toolbar) {
            const mainEl = document.querySelector('[role="main"]');
            if (mainEl) {
                g6Toolbar = mainEl.querySelector(
                    'div.G6[role="toolbar"][aria-label*="search refinement" i], ' +
                    '[role="toolbar"][aria-label*="search refinement" i]'
                );
            }
        }
    }

    // --- Th result-type tabs (Mail / Conversations / Spaces) ---
    let thContainer = null;
    if (activeChild) {
        thContainer = activeChild.querySelector('div.Th');
    }
    if (!thContainer && allAeHChildrenHidden) {
        // Advanced-search fallback: Th lives under [data-srm="email"]
        const srmEmail = document.querySelector('[data-srm="email"]');
        if (srmEmail) {
            thContainer = srmEmail.querySelector('div.Th');
        }
        if (!thContainer) {
            const mainEl = document.querySelector('[role="main"]');
            if (mainEl) thContainer = mainEl.querySelector('div.Th');
        }
    }

    console.log('🧭 Resolved containers:', {
        aeH: !!aeH,
        activeChild: !!activeChild,
        allAeHChildrenHidden,
        nHaqK: !!nHaqK,
        g6Toolbar: !!g6Toolbar,
        thContainer: !!thContainer
    });

    // ----------------------------------------------------------
    // EXTRACT FROM nH.aqK  (toolbar buttons)
    // ----------------------------------------------------------
    if (nHaqK) {
        // T-I toolbar buttons: Select, Archive, Delete, Refresh, More, Sort …
        // Some use aria-label, some use only title (e.g. "Sort by most relevant")
        queryAllIn(nHaqK,
            'div.T-I[role="button"][aria-label], ' +
            'div.T-I[role="button"][title]'
        ).forEach(el => {
            if (el.getAttribute('aria-disabled') === 'true') return;

            // Skip if any ancestor up to nHaqK is hidden
            let p = el.parentElement;
            while (p && p !== nHaqK) {
                if (window.getComputedStyle(p).display === 'none') return;
                p = p.parentElement;
            }

            push(el, 'top-nav:toolbar-button');
        });

        // Pagination (Newer / Older)
        queryAllIn(nHaqK, 'div.amD[role="button"]').forEach(el => {
            if (el.getAttribute('aria-disabled') !== 'true') {
                push(el, 'top-nav:pagination');
            }
        });

        // Page info ("1-50 of 3,526")
        queryAllIn(nHaqK, 'div.amH[role="button"]').forEach(el => {
            push(el, 'top-nav:page-info');
        });

        // Any remaining focusable role=button we haven't seen
        queryAllIn(nHaqK, '[role="button"][tabindex]').forEach(el => {
            if (!seen.has(el)) {
                push(el, 'top-nav:other-button');
            }
        });
    }

    // ----------------------------------------------------------
    // EXTRACT FROM G6 toolbar  (filter chips)
    // ----------------------------------------------------------
    if (g6Toolbar) {
        // Filter chips: From, To, Any time, Has attachment, Is unread …
        queryAllIn(g6Toolbar, '[role="button"].HW').forEach(el => {
            push(el, 'top-nav:filter-chip');
        });

        // Advanced search link
        queryAllIn(g6Toolbar, '[role="button"].N5').forEach(el => {
            push(el, 'top-nav:advanced-search');
        });

        // Catch-all inside the toolbar
        queryAllIn(g6Toolbar, '[role="button"][tabindex]').forEach(el => {
            if (!seen.has(el)) {
                push(el, 'top-nav:toolbar-other');
            }
        });
    }

    // ----------------------------------------------------------
    // EXTRACT FROM Th  (result-type tabs)
    // ----------------------------------------------------------
    if (thContainer) {
        queryAllIn(thContainer, '[role="button"].qN').forEach(el => {
            push(el, 'top-nav:result-tab');
        });
    }

    // ----------------------------------------------------------
    // EXTRACT FROM aKk (category tabs: Primary/Promotions/Social)
    // ----------------------------------------------------------
    // Look for category tabs container - it can be in activeChild or directly in aeH
    let categoryTabsContainer = null;
    if (activeChild) {
        categoryTabsContainer = activeChild.querySelector('div.aKk');
    }
    if (!categoryTabsContainer && aeH) {
        categoryTabsContainer = aeH.querySelector('div.aKk');
    }

    if (categoryTabsContainer) {
        // Tab elements with role="tab" (Primary, Promotions, Social, etc.)
        queryAllIn(categoryTabsContainer, '[role="tab"]').forEach(el => {
            push(el, 'top-nav:category-tab');
        });

        // The "Select which tabs to show or hide" button
        queryAllIn(categoryTabsContainer, '[role="button"]').forEach(el => {
            if (!seen.has(el)) {
                push(el, 'top-nav:tab-settings');
            }
        });
    }

    // ----------------------------------------------------------
    // FALLBACK: If no specific containers found, search broadly
    // ----------------------------------------------------------
    if (candidates.length === 0 && (aeH || region.element)) {
        console.log('⚠️ No specific containers found, using fallback extraction');

        // Try to find buttons in the activeChild or aeH
        const searchRoot = activeChild || aeH || region.element;

        // Look for any visible buttons
        queryAllIn(searchRoot, '[role="button"], button, .T-I').forEach(el => {
            const ariaLabel = el.getAttribute('aria-label') || '';
            const text = (el.textContent || '').trim();

            // Skip if it looks like it's from the wrong region
            if (ariaLabel.includes('Inbox') || ariaLabel.includes('Starred') ||
                ariaLabel.includes('Compose') || text === 'Compose') {
                return; // Skip mail navigation items
            }

            if (!seen.has(el)) {
                push(el, 'top-nav:fallback-button');
            }
        });

        // Look for toolbar elements
        queryAllIn(searchRoot, '[role="toolbar"]').forEach(toolbar => {
            queryAllIn(toolbar, '[role="button"], button').forEach(el => {
                if (!seen.has(el)) {
                    push(el, 'top-nav:fallback-toolbar');
                }
            });
        });

        console.log(`📍 Fallback found ${candidates.length} candidates`);
    }

    console.log('📍 Top Navigation extraction debug:', {
        'aeH found': !!aeH,
        'activeChild found': !!activeChild,
        'allAeHChildrenHidden': allAeHChildrenHidden,
        'nHaqK found': !!nHaqK,
        'g6Toolbar found': !!g6Toolbar,
        'thContainer found': !!thContainer,
        'usedFallback': candidates.length > 0 && !nHaqK && !g6Toolbar && !thContainer,
        'candidates': candidates.length
    });
    console.log(`📍 Top Navigation: ${candidates.length} candidates`);
    return candidates;
}

/**
 * Extract candidates from mail navigation region
 * Focus: Compose, Inbox, Starred, Sent, Drafts, More/Less toggles
 */
function extractMailNavigationCandidates(region) {
    const candidates = [];
    const seen = new Set();
    const container = region.element;

    const push = (el, reason = '') => {
        if (!el || seen.has(el)) return;
        if (!isElementVisible(el)) return;
        if (shouldIgnoreElement(el)) return;

        const r = el.getBoundingClientRect();
        if (r.width < 6 || r.height < 6) return;

        seen.add(el);
        candidates.push({
            element: el,
            features: extractFeatures(el, reason),
        });
    };

    // Compose button - highest priority
    queryAllIn(container, '[role="button"]').forEach(el => {
        const text = (el.textContent || '').trim();
        const ariaLabel = (el.getAttribute('aria-label') || '').trim();
        if (text === 'Compose' || ariaLabel === 'Compose') {
            push(el, 'nav:compose');
        }
    });

    // Navigation links (Inbox, Starred, Sent, etc.)
    const navLabels = [
        'Inbox',
        'Starred',
        'Snoozed',
        'Sent',
        'Drafts',
        'Spam',
        'Trash',
        'Categories',
        'More',
        'Less',
        'Important',
        'Chats',
        'Scheduled',
        'All Mail',
    ];

    // Try links and buttons with these labels
    queryAllIn(container, 'a, [role="link"], [role="button"], div[tabindex]').forEach(el => {
        const ariaLabel = (el.getAttribute('aria-label') || '').trim();
        const text = (el.textContent || '').trim();
        const dataTooltip = (el.getAttribute('data-tooltip') || '').trim();

        const matchedLabel = navLabels.find(label => {
            return ariaLabel === label || text === label || dataTooltip === label;
        });

        if (matchedLabel) {
            push(el, `nav:${matchedLabel.toLowerCase()}`);
        }
    });

    // More/Less toggles (have aria-expanded)
    queryAllIn(container, '[role="button"][aria-expanded]').forEach(el => {
        const text = (el.textContent || '').trim();
        if (text === 'More' || text === 'Less') {
            push(el, 'nav:toggle');
        }
    });

    // Labels section (often expandable)
    queryAllIn(container, '[data-tooltip*="label" i], [aria-label*="label" i]').forEach(el => {
        push(el, 'nav:label');
    });

    // Category child links (Social, Updates, Forums, Promotions).
    // When the Categories section is expanded, these render inside
    // div#:mb (the "more labels" container) which is a sibling, not
    // nested under the first div.byl.  Searching document-wide is
    // safe — these links only exist in the nav sidebar.
    document.querySelectorAll('a[href*="category/"]').forEach(el => {
        if (!seen.has(el)) {
            push(el, 'nav:category');
        }
    });

    console.log(`📍 Mail Navigation: ${candidates.length} candidates`);
    return candidates;
}

/**
 * Extract candidates from main content area
 * Handles both:
 *  • Email list view: Email rows (tr.zA)
 *  • Single email view: Reply, Forward, Archive, Delete buttons
 */
function extractMainCandidates(region) {
    const candidates = [];
    const seen = new Set();
    const container = region.element;

    const push = (el, reason = '') => {
        if (!el || seen.has(el)) return;
        if (!isElementVisible(el)) return;
        if (shouldIgnoreElement(el)) return;

        const r = el.getBoundingClientRect();
        if (r.width < 6 || r.height < 6) return;

        seen.add(el);
        candidates.push({
            element: el,
            features: extractFeatures(el, reason),
        });
    };

    // Detect if we're viewing a single email (vs email list)
    // Single email view indicators:
    // - Has .nH.aHU (email content container)
    // - Has Reply/Forward buttons at bottom (.ams.bkH, .ams.bkI, .ams.bkG)
    // - No email rows or very few rows
    const emailContentContainer = container.querySelector('.nH.aHU');
    const hasReplyButtons = container.querySelector('.ams.bkH, .ams.bkI, .ams.bkG');
    const emailRows = container.querySelectorAll('tr.zA, tr[role="row"]');
    const isSingleEmailView = (emailContentContainer || hasReplyButtons) && emailRows.length <= 3;

    console.log('🔍 View detection:', {
        hasEmailContent: !!emailContentContainer,
        hasReplyButtons: !!hasReplyButtons,
        emailRowsCount: emailRows.length,
        isSingleEmailView
    });

    if (isSingleEmailView) {
        console.log('📧 Detected single email view');

        // Reply/Forward/More buttons with specific classes
        // Reply button (DILLkc), More options (Wsq5Cf), etc.
        queryAllIn(container, 'button.DILLkc, button.Wsq5Cf, button.pYTkkf-JX-I').forEach(el => {
            if (!seen.has(el) && el.getAttribute('aria-label')) {
                push(el, 'main:email-header-button');
            }
        });

        // Show details button (.ajy)
        queryAllIn(container, '.ajy[role="button"]').forEach(el => {
            if (!seen.has(el)) {
                push(el, 'main:show-details-button');
            }
        });

        // Reply/Forward buttons at bottom
        queryAllIn(container, '.ams.bkH, .ams.bkI, .ams.bkG').forEach(el => {
            push(el, 'main:reply-forward-button');
        });

        // Extract email action buttons (Reply, Forward, Archive, Delete, etc.)
        // These are typically in a toolbar at the top of the email
        const emailToolbars = container.querySelectorAll('[role="toolbar"], .G-atb, .iH, .bHJ');
        emailToolbars.forEach(toolbar => {
            // Find all buttons in the toolbar
            queryAllIn(toolbar, '[role="button"], button, .T-I').forEach(el => {
                if (!seen.has(el)) {
                    push(el, 'main:email-action-button');
                }
            });
        });

        // Email body links and buttons
        queryAllIn(container, 'a[href]').forEach(el => {
            // Only get links that are actually in the email body
            const rect = el.getBoundingClientRect();
            if (rect.width > 20 && rect.height > 10 && !seen.has(el)) {
                push(el, 'main:email-link');
            }
        });

        // Attachments
        queryAllIn(container, '[role="button"][aria-label*="Download"], [role="button"][aria-label*="attachment" i], .aQy').forEach(el => {
            if (!seen.has(el)) {
                push(el, 'main:attachment');
            }
        });

        // Action dropdowns (More actions, etc.)
        queryAllIn(container, '[aria-haspopup="menu"], [aria-haspopup="listbox"]').forEach(el => {
            if (!seen.has(el)) {
                push(el, 'main:dropdown');
            }
        });

        // Star button
        queryAllIn(container, '[aria-label*="Starred"], .zd').forEach(el => {
            if (!seen.has(el)) {
                push(el, 'main:star-button');
            }
        });

        // Label buttons (Inbox, etc.)
        queryAllIn(container, '.hN[role="button"], .hO[role="button"]').forEach(el => {
            if (!seen.has(el)) {
                push(el, 'main:label-button');
            }
        });

    } else {
        console.log('📬 Detected email list view');

        // Debug: Check what rows we're finding
        const allRows = container.querySelectorAll('tr.zA, tr[role="row"]');
        console.log(`🔍 Debug: Found ${allRows.length} total rows (tr.zA or tr[role="row"])`);

        // Email rows only — everything else (toolbar, pagination, checkboxes)
        // is owned by top-navigation or is not wanted here.
        let debugCount = 0;
        queryAllIn(container, 'tr.zA, tr[role="row"]').forEach(el => {
            debugCount++;
            const hasCheckbox = !!el.querySelector('[role="checkbox"]');
            const hasLink = !!el.querySelector('[role="link"]');
            const ariaLabel = el.getAttribute('aria-label') || '';
            const hasConversation = ariaLabel.includes('Conversation');

            if (debugCount <= 3) {
                console.log(`🔍 Row ${debugCount}:`, {
                    hasCheckbox,
                    hasLink,
                    ariaLabel: ariaLabel.substring(0, 50),
                    hasConversation,
                    passes: hasCheckbox || hasLink || hasConversation
                });
            }

            if (el.querySelector('[role="checkbox"]') ||
                el.querySelector('[role="link"]') ||
                (el.getAttribute('aria-label') || '').includes('Conversation')) {

                if (!el || seen.has(el)) return;
                if (!isElementVisible(el)) return;
                if (shouldIgnoreElement(el)) return;

                const r = el.getBoundingClientRect();
                if (r.width < 6 || r.height < 6) return;

                seen.add(el);
                candidates.push({
                    element: el,
                    highlightElement: el,
                    features: extractFeatures(el, 'main:email-row'),
                });
            }
        });

        console.log(`🔍 Debug: ${debugCount} rows checked, ${candidates.length} passed filters`);
    }

    console.log(`📍 Main: ${candidates.length} candidates (${isSingleEmailView ? 'email view' : 'list view'})`);
    return candidates;
}

/**
 * Extract candidates from left panel (full navigation)
 */
function extractLeftPanelCandidates(region) {
    const candidates = [];
    const seen = new Set();
    const container = region.element;

    const push = (el, reason = '') => {
        if (!el || seen.has(el)) return;
        if (!isElementVisible(el)) return;
        if (shouldIgnoreElement(el)) return;

        const r = el.getBoundingClientRect();
        if (r.width < 6 || r.height < 6) return;

        seen.add(el);
        candidates.push({
            element: el,
            features: extractFeatures(el, reason),
        });
    };

    // All labeled links and buttons
    queryAllIn(container, 'a[aria-label], [role="link"][aria-label], [role="button"][aria-label]').forEach(el => {
        push(el, 'left-panel:labeled');
    });

    // Tooltipped elements
    queryAllIn(container, '[data-tooltip]').forEach(el => {
        push(el, 'left-panel:tooltip');
    });

    console.log(`📍 Left Panel: ${candidates.length} candidates`);
    return candidates;
}

/**
 * Extract candidates from right panel (Calendar, Keep, Tasks, Contacts)
 */
function extractRightPanelCandidates(region) {
    const candidates = [];
    const seen = new Set();
    const container = region.element;

    const push = (el, reason = '') => {
        if (!el || seen.has(el)) return;
        if (!isElementVisible(el)) return;
        if (shouldIgnoreElement(el)) return;

        const r = el.getBoundingClientRect();
        if (r.width < 6 || r.height < 6) return;

        seen.add(el);
        candidates.push({
            element: el,
            features: extractFeatures(el, reason),
        });
    };

    // Side panel tabs
    queryAllIn(container, '[role="tab"], [role="button"][aria-label]').forEach(el => {
        push(el, 'right-panel:tab');
    });

    // Interactive elements in side panel
    queryAllIn(container, 'button, a[href], [role="button"], [role="link"]').forEach(el => {
        if (el.getAttribute('aria-label') || el.getAttribute('data-tooltip')) {
            push(el, 'right-panel:action');
        }
    });

    console.log(`📍 Right Panel: ${candidates.length} candidates`);
    return candidates;
}

/**
 * Generic extraction for unknown regions
 */
function extractGenericCandidates(region) {
    const candidates = [];
    const seen = new Set();
    const container = region.element;

    const push = (el, reason = '') => {
        if (!el || seen.has(el)) return;
        if (!isElementVisible(el)) return;
        if (shouldIgnoreElement(el)) return;

        const r = el.getBoundingClientRect();
        if (r.width < 6 || r.height < 6) return;

        seen.add(el);
        candidates.push({
            element: el,
            features: extractFeatures(el, reason),
        });
    };

    const standardSelectors = [
        'button',
        'a[href]',
        'input',
        'select',
        'textarea',
        '[role="button"]',
        '[role="link"]',
        '[role="menuitem"]',
        '[role="tab"]',
        '[role="checkbox"]',
    ];

    queryAllIn(container, standardSelectors.join(',')).forEach(el => {
        if (isGoodLabeledTarget(el)) {
            push(el, 'generic');
        }
    });

    console.log(`📍 Generic (${region.id}): ${candidates.length} candidates`);
    return candidates;
}

/**
 * Fallback: extract all clickable candidates globally
 */
export function extractAllClickableCandidates() {
    const candidates = [];
    const seen = new Set();

    const push = (el, reason = '') => {
        if (!el || seen.has(el)) return;
        if (!isElementVisible(el)) return;
        if (shouldIgnoreElement(el)) return;

        const r = el.getBoundingClientRect();
        if (r.width < 6 || r.height < 6) return;

        seen.add(el);
        candidates.push({
            element: el,
            features: extractFeatures(el, reason),
        });
    };

    // Standard interactive elements
    const selectors = [
        'button',
        'a[href]',
        'input',
        'select',
        'textarea',
        '[role="button"]',
        '[role="link"]',
        '[role="checkbox"]',
        '[role="tab"]',
        'tr.zA',
    ];

    queryAll(selectors.join(',')).forEach(el => {
        if (isGoodLabeledTarget(el)) {
            push(el, 'global');
        }
    });

    console.log(`🌍 Global extraction: ${candidates.length} candidates`);
    return candidates;
}

/* -------------------------
 * Helper Functions
 * ------------------------- */

function queryAll(selector) {
    try {
        return Array.from(document.querySelectorAll(selector));
    } catch {
        return [];
    }
}

function queryAllIn(container, selector) {
    try {
        return Array.from(container.querySelectorAll(selector));
    } catch {
        return [];
    }
}

function isElementVisible(element) {
    const rect = element.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) return false;

    const inViewport =
        rect.bottom >= -80 &&
        rect.right >= -80 &&
        rect.top <= window.innerHeight + 80 &&
        rect.left <= window.innerWidth + 80;

    if (!inViewport) return false;

    const style = window.getComputedStyle(element);
    return !(style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0');
}

function shouldIgnoreElement(element) {
    const ignoreIds = [
        'smarttab-popup',
        'smarttab-lasso',
        'smarttab-chord',
        'task-notification',
        'tabtabgo-region-overlay',
        'tabtabgo-region-popup',
    ];

    if (ignoreIds.includes(element.id)) return true;

    for (const id of ignoreIds) {
        if (element.closest(`#${id}`)) return true;
    }

    return false;
}

function isGoodLabeledTarget(el) {
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    const role = (el.getAttribute('role') || '').toLowerCase();

    const ariaLabel = (el.getAttribute('aria-label') || '').trim();
    const tooltip = (el.getAttribute('data-tooltip') || '').trim();
    const title = (el.getAttribute('title') || '').trim();
    const text = ((el.textContent || '').trim() || '').slice(0, 80);

    // Always allow message rows
    if (tag === 'tr' && el.classList && el.classList.contains('zA')) return true;

    // Always allow native controls
    if (['button', 'a', 'input', 'select', 'textarea', 'form'].includes(tag)) return true;

    // Reject presentational
    if (role === 'presentation' || role === 'none') return false;

    // Require label/tooltip/title or meaningful text
    if (ariaLabel || tooltip || title) return true;
    return !!(role && text.length >= 2);
}

function extractFeatures(element, reason = '') {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    const tagName = element.tagName ? element.tagName.toLowerCase() : '';
    const role = element.getAttribute('role') || '';
    const type = element.type || '';

    const ariaLabel = element.getAttribute('aria-label') || '';
    const tooltip = element.getAttribute('data-tooltip') || '';
    const title = element.getAttribute('title') || '';

    let text =
        (element.textContent || '').trim() ||
        element.value ||
        element.placeholder ||
        element.alt ||
        title ||
        ariaLabel ||
        tooltip ||
        '';

    // For filter chips (From, To, Any time, etc.) pull text from the label span only.
    // textContent on the whole button grabs hidden menu markup, so it's noisy.
    if (reason === 'top-nav:filter-chip' || reason === 'top-nav:advanced-search') {
        const labelSpan = element.querySelector('span.H5, span.Og');
        if (labelSpan) {
            text = labelSpan.textContent.trim();
        }
    }

    // For message rows, extract subject/snippet
    if (tagName === 'tr' && element.classList && element.classList.contains('zA')) {
        const subject =
            (element.querySelector('.bog') && element.querySelector('.bog').textContent) ||
            (element.querySelector('[role="link"]') && element.querySelector('[role="link"]').textContent) ||
            '';
        const snippet =
            (element.querySelector('.y2') && element.querySelector('.y2').textContent) ||
            (element.querySelector('.xS') && element.querySelector('.xS').textContent) ||
            '';
        const composed = [subject.trim(), snippet.trim()].filter(Boolean).join(' — ');
        if (composed) text = composed;
    }

    text = (text || '').trim().substring(0, 220);

    return {
        reason,
        text,
        ariaLabel,
        tooltip,
        title,

        id: element.id || '',
        className: typeof element.className === 'string' ? element.className : (element.className || '').toString(),

        tagName,
        role,
        type,

        tabindex: element.getAttribute('tabindex'),

        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,

        cursor: style.cursor,
        zIndex: parseInt(style.zIndex) || 0,
        opacity: parseFloat(style.opacity) || 1,

        isButton: tagName === 'button' || role === 'button' || type === 'button' || type === 'submit',
        isLink: tagName === 'a' || role === 'link',
        isInput: tagName === 'input' || tagName === 'textarea' || tagName === 'select' || role === 'textbox',
        isRow: tagName === 'tr' || role === 'row',

        isFocusable: element.tabIndex >= 0,
    };
}