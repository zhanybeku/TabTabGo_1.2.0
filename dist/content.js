const O={focusedElement:null,focusHistory:[],mouse:{x:0,y:0},maxHistory:5};function Wt(t){const o=t.getBoundingClientRect();return{tag:t.tagName.toLowerCase(),role:t.getAttribute("role")||"",text:_t(t),rect:{x:o.x,y:o.y,w:o.width,h:o.height},className:Kt(t).toLowerCase(),id:(t.id||"").toLowerCase()}}function ht(t){t&&(O.focusedElement=t,O.focusHistory.push({element:t,timestamp:Date.now(),features:Wt(t)}),O.focusHistory.length>O.maxHistory&&O.focusHistory.shift())}function Kt(t){return t.className?typeof t.className=="string"?t.className:t.className.toString():""}function _t(t){return t.getAttribute("aria-label")||t.getAttribute("data-tooltip")||t.title||t.textContent?.trim().slice(0,100)||t.tagName.toLowerCase()}function bt(t=null){if(!t)return ee();switch(t.id){case"compose-window":return Yt(t);case"header":return jt(t);case"top-navigation":return Xt(t);case"mail-navigation":return Jt(t);case"main":return Vt(t);case"left-panel":return Zt(t);case"right-panel":return Qt(t);default:return te(t)}}function Yt(t){const o=[],n=new Set,e=t.element,i=(a,r="")=>{if(!a||n.has(a)||!B(a)||D(a))return;const m=a.getBoundingClientRect();m.width<6||m.height<6||(n.add(a),o.push({element:a,features:z(a,r)}))};return console.log("✍️ Extracting compose window candidates"),y(e,'.J-JN-M-I.Un[role="button"]').forEach(a=>{i(a,"compose:type-of-response")}),y(e,".Hl, .Hq, .Ha").forEach(a=>{i(a,"compose:header-button")}),y(e,".aoD.hl[tabindex]").forEach(a=>{i(a,"compose:recipient-placeholder")}),y(e,'input[aria-label*="To"], input[aria-label*="Cc"], input[aria-label*="Bcc"], input.agP').forEach(a=>{i(a,"compose:recipient-field")}),y(e,".aB.gQ").forEach(a=>{i(a,"compose:cc-bcc-toggle")}),y(e,'input.aoT, input[placeholder="Subject"]').forEach(a=>{i(a,"compose:subject-field")}),y(e,'.Am[contenteditable="true"], textarea.Ak').forEach(a=>{i(a,"compose:message-body")}),y(e,'.T-I.aoO, .T-I.hG, .T-I[aria-label*="Send"]').forEach(a=>{i(a,"compose:send-button")}),y(e,'.J-Z-I[role="button"]').forEach(a=>{n.has(a)||i(a,"compose:formatting-button")}),y(e,'.J-Z-M-I[role="button"], .J-Z-M-I[role="listbox"]').forEach(a=>{n.has(a)||i(a,"compose:formatting-dropdown")}),y(e,".wG.J-Z-I").forEach(a=>{n.has(a)||i(a,"compose:toolbar-button")}),y(e,'.J-JN-M-I[role="button"]').forEach(a=>{n.has(a)||i(a,"compose:more-options")}),y(e,'.oh[role="button"]').forEach(a=>{n.has(a)||i(a,"compose:discard-draft")}),y(e,'button, div[role="button"][tabindex]').forEach(a=>{n.has(a)||i(a,"compose:generic-button")}),console.log(`✍️ Compose Window: ${o.length} candidates`),o}function jt(t){const o=[],n=new Set,e=t.element,i=(r,m="")=>{if(!r||n.has(r)||!B(r)||D(r))return;const w=r.getBoundingClientRect();w.width<6||w.height<6||(n.add(r),o.push({element:r,features:z(r,m)}))};return[{selector:'[aria-label="Main menu"][role="button"]',reason:"header:main-menu"},{selector:'[aria-label="Search mail"]',reason:"header:search"},{selector:'form[aria-label="Search mail"]',reason:"header:search-form"},{selector:'[aria-label^="Status:"][role="button"]',reason:"header:status"},{selector:'[aria-label="Settings"][role="button"]',reason:"header:settings"},{selector:'[aria-label="Google apps"][role="button"]',reason:"header:google-apps"},{selector:'[aria-label="Support"][role="button"]',reason:"header:support"}].forEach(({selector:r,reason:m})=>{y(e,r).forEach(u=>i(u,m))}),y(e,'input[type="text"][aria-label*="Search"]').forEach(r=>{i(r,"header:search-input")}),y(e,'[aria-label*="Google Account"], [aria-label*="account" i]').forEach(r=>{(r.getAttribute("role")==="button"||r.tagName.toLowerCase()==="a")&&i(r,"header:account")}),console.log(`📍 Header: ${o.length} candidates`),o}function Xt(t){const o=[],n=new Set,e=(c,f="")=>{if(!c||n.has(c)||!B(c)||D(c))return;const A=c.getBoundingClientRect();A.width<6||A.height<6||(n.add(c),o.push({element:c,features:z(c,f)}))},i=t.element;if(i.dataset&&i.dataset.combinedRegion==="true"){console.log("🧭 Extracting from combined top-navigation region");const c=i._toolbarElement,f=i._biWElement,A=i._categoryTabsElement;return c&&(c.classList.contains("aeH")?y(c,'[role="button"], button, .T-I').forEach(S=>{e(S,"top-nav:toolbar")}):y(c,'[role="button"], button, .T-I').forEach(S=>{e(S,"top-nav:toolbar")})),f&&y(f,'[role="button"], button').forEach(E=>{e(E,"top-nav:biw")}),A&&(y(A,'[role="tab"]').forEach(E=>{e(E,"top-nav:category-tab")}),y(A,'[role="button"]').forEach(E=>{e(E,"top-nav:tab-settings")})),console.log(`📍 Top Navigation (combined): ${o.length} candidates`),o}const a=document.querySelector("div.aeH");let r=null;if(a){for(const c of a.children)if(window.getComputedStyle(c).display!=="none"){r=c;break}}const m=a?Array.from(a.children).length>0&&Array.from(a.children).every(c=>window.getComputedStyle(c).display==="none"):!0;let w=null;r&&(w=r.querySelector("div.nH.aqK"));let u=null;if(r&&(u=r.querySelector('div.G6[role="toolbar"][aria-label*="search refinement" i], [role="toolbar"][aria-label*="search refinement" i]')),!u&&m){const c=document.querySelector('[data-srm="email"]');if(c&&(u=c.querySelector('div.G6[role="toolbar"][aria-label*="search refinement" i], [role="toolbar"][aria-label*="search refinement" i]')),!u){const f=document.querySelector('[role="main"]');f&&(u=f.querySelector('div.G6[role="toolbar"][aria-label*="search refinement" i], [role="toolbar"][aria-label*="search refinement" i]'))}}let l=null;if(r&&(l=r.querySelector("div.Th")),!l&&m){const c=document.querySelector('[data-srm="email"]');if(c&&(l=c.querySelector("div.Th")),!l){const f=document.querySelector('[role="main"]');f&&(l=f.querySelector("div.Th"))}}console.log("🧭 Resolved containers:",{aeH:!!a,activeChild:!!r,allAeHChildrenHidden:m,nHaqK:!!w,g6Toolbar:!!u,thContainer:!!l}),w&&(y(w,'div.T-I[role="button"][aria-label], div.T-I[role="button"][title]').forEach(c=>{if(c.getAttribute("aria-disabled")==="true")return;let f=c.parentElement;for(;f&&f!==w;){if(window.getComputedStyle(f).display==="none")return;f=f.parentElement}e(c,"top-nav:toolbar-button")}),y(w,'div.amD[role="button"]').forEach(c=>{c.getAttribute("aria-disabled")!=="true"&&e(c,"top-nav:pagination")}),y(w,'div.amH[role="button"]').forEach(c=>{e(c,"top-nav:page-info")}),y(w,'[role="button"][tabindex]').forEach(c=>{n.has(c)||e(c,"top-nav:other-button")})),u&&(y(u,'[role="button"].HW').forEach(c=>{e(c,"top-nav:filter-chip")}),y(u,'[role="button"].N5').forEach(c=>{e(c,"top-nav:advanced-search")}),y(u,'[role="button"][tabindex]').forEach(c=>{n.has(c)||e(c,"top-nav:toolbar-other")})),l&&y(l,'[role="button"].qN').forEach(c=>{e(c,"top-nav:result-tab")});let d=null;if(r&&(d=r.querySelector("div.aKk")),!d&&a&&(d=a.querySelector("div.aKk")),d&&(y(d,'[role="tab"]').forEach(c=>{e(c,"top-nav:category-tab")}),y(d,'[role="button"]').forEach(c=>{n.has(c)||e(c,"top-nav:tab-settings")})),o.length===0&&(a||t.element)){console.log("⚠️ No specific containers found, using fallback extraction");const c=r||a||t.element;y(c,'[role="button"], button, .T-I').forEach(f=>{const A=f.getAttribute("aria-label")||"",E=(f.textContent||"").trim();A.includes("Inbox")||A.includes("Starred")||A.includes("Compose")||E==="Compose"||n.has(f)||e(f,"top-nav:fallback-button")}),y(c,'[role="toolbar"]').forEach(f=>{y(f,'[role="button"], button').forEach(A=>{n.has(A)||e(A,"top-nav:fallback-toolbar")})}),console.log(`📍 Fallback found ${o.length} candidates`)}return console.log("📍 Top Navigation extraction debug:",{"aeH found":!!a,"activeChild found":!!r,allAeHChildrenHidden:m,"nHaqK found":!!w,"g6Toolbar found":!!u,"thContainer found":!!l,usedFallback:o.length>0&&!w&&!u&&!l,candidates:o.length}),console.log(`📍 Top Navigation: ${o.length} candidates`),o}function Jt(t){const o=[],n=new Set,e=t.element,i=(r,m="")=>{if(!r||n.has(r)||!B(r)||D(r))return;const w=r.getBoundingClientRect();w.width<6||w.height<6||(n.add(r),o.push({element:r,features:z(r,m)}))};y(e,'[role="button"]').forEach(r=>{const m=(r.textContent||"").trim(),w=(r.getAttribute("aria-label")||"").trim();(m==="Compose"||w==="Compose")&&i(r,"nav:compose")});const a=["Inbox","Starred","Snoozed","Sent","Drafts","Spam","Trash","Categories","More","Less","Important","Chats","Scheduled","All Mail"];return y(e,'a, [role="link"], [role="button"], div[tabindex]').forEach(r=>{const m=(r.getAttribute("aria-label")||"").trim(),w=(r.textContent||"").trim(),u=(r.getAttribute("data-tooltip")||"").trim(),l=a.find(d=>m===d||w===d||u===d);l&&i(r,`nav:${l.toLowerCase()}`)}),y(e,'[role="button"][aria-expanded]').forEach(r=>{const m=(r.textContent||"").trim();(m==="More"||m==="Less")&&i(r,"nav:toggle")}),y(e,'[data-tooltip*="label" i], [aria-label*="label" i]').forEach(r=>{i(r,"nav:label")}),document.querySelectorAll('a[href*="category/"]').forEach(r=>{n.has(r)||i(r,"nav:category")}),console.log(`📍 Mail Navigation: ${o.length} candidates`),o}function Vt(t){const o=[],n=new Set,e=t.element,i=(u,l="")=>{if(!u||n.has(u)||!B(u)||D(u))return;const d=u.getBoundingClientRect();d.width<6||d.height<6||(n.add(u),o.push({element:u,features:z(u,l)}))},a=e.querySelector(".nH.aHU"),r=e.querySelector(".ams.bkH, .ams.bkI, .ams.bkG"),m=e.querySelectorAll('tr.zA, tr[role="row"]'),w=(a||r)&&m.length<=3;if(console.log("🔍 View detection:",{hasEmailContent:!!a,hasReplyButtons:!!r,emailRowsCount:m.length,isSingleEmailView:w}),w)console.log("📧 Detected single email view"),y(e,"button.DILLkc, button.Wsq5Cf, button.pYTkkf-JX-I").forEach(l=>{!n.has(l)&&l.getAttribute("aria-label")&&i(l,"main:email-header-button")}),y(e,'.ajy[role="button"]').forEach(l=>{n.has(l)||i(l,"main:show-details-button")}),y(e,".ams.bkH, .ams.bkI, .ams.bkG").forEach(l=>{i(l,"main:reply-forward-button")}),e.querySelectorAll('[role="toolbar"], .G-atb, .iH, .bHJ').forEach(l=>{y(l,'[role="button"], button, .T-I').forEach(d=>{n.has(d)||i(d,"main:email-action-button")})}),y(e,"a[href]").forEach(l=>{const d=l.getBoundingClientRect();d.width>20&&d.height>10&&!n.has(l)&&i(l,"main:email-link")}),y(e,'[role="button"][aria-label*="Download"], [role="button"][aria-label*="attachment" i], .aQy').forEach(l=>{n.has(l)||i(l,"main:attachment")}),y(e,'[aria-haspopup="menu"], [aria-haspopup="listbox"]').forEach(l=>{n.has(l)||i(l,"main:dropdown")}),y(e,'[aria-label*="Starred"], .zd').forEach(l=>{n.has(l)||i(l,"main:star-button")}),y(e,'.hN[role="button"], .hO[role="button"]').forEach(l=>{n.has(l)||i(l,"main:label-button")});else{console.log("📬 Detected email list view");const u=e.querySelectorAll('tr.zA, tr[role="row"]');console.log(`🔍 Debug: Found ${u.length} total rows (tr.zA or tr[role="row"])`);let l=0;y(e,'tr.zA, tr[role="row"]').forEach(d=>{l++;const c=!!d.querySelector('[role="checkbox"]'),f=!!d.querySelector('[role="link"]'),A=d.getAttribute("aria-label")||"",E=A.includes("Conversation");if(l<=3&&console.log(`🔍 Row ${l}:`,{hasCheckbox:c,hasLink:f,ariaLabel:A.substring(0,50),hasConversation:E,passes:c||f||E}),d.querySelector('[role="checkbox"]')||d.querySelector('[role="link"]')||(d.getAttribute("aria-label")||"").includes("Conversation")){if(!d||n.has(d)||!B(d)||D(d))return;const S=d.getBoundingClientRect();if(S.width<6||S.height<6)return;n.add(d),o.push({element:d,highlightElement:d,features:z(d,"main:email-row")})}}),console.log(`🔍 Debug: ${l} rows checked, ${o.length} passed filters`)}return console.log(`📍 Main: ${o.length} candidates (${w?"email view":"list view"})`),o}function Zt(t){const o=[],n=new Set,e=t.element,i=(a,r="")=>{if(!a||n.has(a)||!B(a)||D(a))return;const m=a.getBoundingClientRect();m.width<6||m.height<6||(n.add(a),o.push({element:a,features:z(a,r)}))};return y(e,'a[aria-label], [role="link"][aria-label], [role="button"][aria-label]').forEach(a=>{i(a,"left-panel:labeled")}),y(e,"[data-tooltip]").forEach(a=>{i(a,"left-panel:tooltip")}),console.log(`📍 Left Panel: ${o.length} candidates`),o}function Qt(t){const o=[],n=new Set,e=t.element,i=(a,r="")=>{if(!a||n.has(a)||!B(a)||D(a))return;const m=a.getBoundingClientRect();m.width<6||m.height<6||(n.add(a),o.push({element:a,features:z(a,r)}))};return y(e,'[role="tab"], [role="button"][aria-label]').forEach(a=>{i(a,"right-panel:tab")}),y(e,'button, a[href], [role="button"], [role="link"]').forEach(a=>{(a.getAttribute("aria-label")||a.getAttribute("data-tooltip"))&&i(a,"right-panel:action")}),console.log(`📍 Right Panel: ${o.length} candidates`),o}function te(t){const o=[],n=new Set,e=t.element,i=(r,m="")=>{if(!r||n.has(r)||!B(r)||D(r))return;const w=r.getBoundingClientRect();w.width<6||w.height<6||(n.add(r),o.push({element:r,features:z(r,m)}))};return y(e,["button","a[href]","input","select","textarea",'[role="button"]','[role="link"]','[role="menuitem"]','[role="tab"]','[role="checkbox"]'].join(",")).forEach(r=>{xt(r)&&i(r,"generic")}),console.log(`📍 Generic (${t.id}): ${o.length} candidates`),o}function ee(){const t=[],o=new Set,n=(i,a="")=>{if(!i||o.has(i)||!B(i)||D(i))return;const r=i.getBoundingClientRect();r.width<6||r.height<6||(o.add(i),t.push({element:i,features:z(i,a)}))};return oe(["button","a[href]","input","select","textarea",'[role="button"]','[role="link"]','[role="checkbox"]','[role="tab"]',"tr.zA"].join(",")).forEach(i=>{xt(i)&&n(i,"global")}),console.log(`🌍 Global extraction: ${t.length} candidates`),t}function oe(t){try{return Array.from(document.querySelectorAll(t))}catch{return[]}}function y(t,o){try{return Array.from(t.querySelectorAll(o))}catch{return[]}}function B(t){const o=t.getBoundingClientRect();if(o.width<=0||o.height<=0||!(o.bottom>=-80&&o.right>=-80&&o.top<=window.innerHeight+80&&o.left<=window.innerWidth+80))return!1;const e=window.getComputedStyle(t);return!(e.display==="none"||e.visibility==="hidden"||e.opacity==="0")}function D(t){const o=["smarttab-popup","smarttab-lasso","smarttab-chord","task-notification","tabtabgo-region-overlay","tabtabgo-region-popup"];if(o.includes(t.id))return!0;for(const n of o)if(t.closest(`#${n}`))return!0;return!1}function xt(t){const o=t.tagName?t.tagName.toLowerCase():"",n=(t.getAttribute("role")||"").toLowerCase(),e=(t.getAttribute("aria-label")||"").trim(),i=(t.getAttribute("data-tooltip")||"").trim(),a=(t.getAttribute("title")||"").trim(),r=((t.textContent||"").trim()||"").slice(0,80);return o==="tr"&&t.classList&&t.classList.contains("zA")||["button","a","input","select","textarea","form"].includes(o)?!0:n==="presentation"||n==="none"?!1:e||i||a?!0:!!(n&&r.length>=2)}function z(t,o=""){const n=t.getBoundingClientRect(),e=window.getComputedStyle(t),i=t.tagName?t.tagName.toLowerCase():"",a=t.getAttribute("role")||"",r=t.type||"",m=t.getAttribute("aria-label")||"",w=t.getAttribute("data-tooltip")||"",u=t.getAttribute("title")||"";let l=(t.textContent||"").trim()||t.value||t.placeholder||t.alt||u||m||w||"";if(o==="top-nav:filter-chip"||o==="top-nav:advanced-search"){const d=t.querySelector("span.H5, span.Og");d&&(l=d.textContent.trim())}if(i==="tr"&&t.classList&&t.classList.contains("zA")){const d=t.querySelector(".bog")&&t.querySelector(".bog").textContent||t.querySelector('[role="link"]')&&t.querySelector('[role="link"]').textContent||"",c=t.querySelector(".y2")&&t.querySelector(".y2").textContent||t.querySelector(".xS")&&t.querySelector(".xS").textContent||"",f=[d.trim(),c.trim()].filter(Boolean).join(" — ");f&&(l=f)}return l=(l||"").trim().substring(0,220),{reason:o,text:l,ariaLabel:m,tooltip:w,title:u,id:t.id||"",className:typeof t.className=="string"?t.className:(t.className||"").toString(),tagName:i,role:a,type:r,tabindex:t.getAttribute("tabindex"),x:n.left,y:n.top,width:n.width,height:n.height,centerX:n.left+n.width/2,centerY:n.top+n.height/2,cursor:e.cursor,zIndex:parseInt(e.zIndex)||0,opacity:parseFloat(e.opacity)||1,isButton:i==="button"||a==="button"||r==="button"||r==="submit",isLink:i==="a"||a==="link",isInput:i==="input"||i==="textarea"||i==="select"||a==="textbox",isRow:i==="tr"||a==="row",isFocusable:t.tabIndex>=0}}async function yt(t,o,n=!1,e=null,i=0,a=null,r=null,m=null,w=null){e===null&&(e=o.findIndex(u=>u.element===t.element)),o.map(u=>({text:u.text||u.features?.text||"",selector:u.selector||u.features?.id||u.features?.className||"",isFake:u.isFake||!1})),console.log("📊 Interaction logged:",{selectedIndex:e,cursorTraveledDistancePx:i});try{const u=await chrome.storage.local.get(["sessionActive","currentSession"]);u.sessionActive&&await chrome.runtime.sendMessage({action:"logInteraction",data:{timestamp:Date.now(),selectedIndex:e,manualClick:!n,TabTabGoClick:n,elementText:t.text||t.features?.text||"",cursorTraveledDistancePx:i,url:window.location.href,mode:u.currentSession.mode,tabsRequired:a,entersRequired:r,tabsRequiredSinceLastClick:m,entersRequiredSinceLastClick:w}})}catch(u){console.error("Failed to log interaction to session:",u)}}const ne=[{id:"compose-window",name:"Message window",description:"A new compose message window",icon:"✍️",priority:1,customExtractor:()=>{const t=document.querySelectorAll('[role="dialog"]');for(const n of t){const e=window.getComputedStyle(n);if(e.display==="none"||e.visibility==="hidden")continue;const i=n.querySelector("h2.a3E");if(i){const a=i.textContent||"";if(a.includes("Compose")||a.includes("New Message")||a.includes("Reply")||a.includes("Forward"))return console.log("✍️ Found floating compose dialog:",a.trim()),n}}const o=document.querySelectorAll('.aoI[role="region"][data-compose-id]');for(const n of o){const e=window.getComputedStyle(n);if(e.display==="none"||e.visibility==="hidden")continue;const i=n.getAttribute("aria-label")||"";return console.log("✍️ Found inline compose:",i),n}return null}},{id:"mail-navigation",name:"Mail Navigation",description:"Compose, Inbox, Starred, Sent, Drafts",selector:'[role="navigation"]',icon:"📧",priority:2},{id:"main",name:"Email List",description:"Your emails",icon:"📬",priority:3,customExtractor:()=>{const t=document.querySelectorAll('[role="main"]');for(const o of t){const n=window.getComputedStyle(o);if(n.display==="none"||n.visibility==="hidden")continue;const e=o.querySelector(".Cp");if(!e)return o;const i=window.getComputedStyle(e);if(i.display==="none"||i.visibility==="hidden")continue;const a=e.getBoundingClientRect();if(!(a.width<20||a.height<20))return console.log("📬 Found main mail content (.Cp inside role=main)"),e}return null}},{id:"top-navigation",name:"Top Navigation",description:"Refresh, select, back and forth",icon:"🧭",priority:4,customExtractor:()=>{const t=document.querySelector("div.aeH"),o=document.querySelector('[role="main"]'),n=o?o.querySelector("table.aKk"):null;if(t){const r=window.getComputedStyle(t);if(r.display!=="none"&&r.visibility!=="hidden"){const m=Array.from(t.children);if(!(m.length>0&&m.every(u=>window.getComputedStyle(u).display==="none"))){if(console.log("🧭 Using standard aeH toolbar"),n){const l=[t,n].map(S=>S.getBoundingClientRect()),d=Math.min(...l.map(S=>S.left)),c=Math.min(...l.map(S=>S.top)),f=Math.max(...l.map(S=>S.right)),A=Math.max(...l.map(S=>S.bottom)),E=document.createElement("div");return E.className="tabtabgo-virtual-topnav",E.dataset.combinedRegion="true",E._toolbarElement=t,E._categoryTabsElement=n,E._virtualBounds={left:d,top:c,right:f,bottom:A,width:f-d,height:A-c},E.getBoundingClientRect=function(){return this._virtualBounds},console.log("🧭 Using combined region: aeH + aKk"),E}return t}console.log("🧭 aeH children all hidden, using adaptive mode")}}const e=o?o.querySelector(".nH.aqK"):null,i=document.querySelector(".biW");if(!e&&!i&&!n)return console.log("🧭 No top-navigation elements found"),null;const a=[e,i,n].filter(r=>r!==null);if(a.length>0){const r=a.map(f=>f.getBoundingClientRect()),m=Math.min(...r.map(f=>f.left)),w=Math.min(...r.map(f=>f.top)),u=Math.max(...r.map(f=>f.right)),l=Math.max(...r.map(f=>f.bottom)),d=document.createElement("div");d.className="tabtabgo-virtual-topnav",d.dataset.combinedRegion="true",d._toolbarElement=e,d._biWElement=i,d._categoryTabsElement=n,d._virtualBounds={left:m,top:w,right:u,bottom:l,width:u-m,height:l-w},d.getBoundingClientRect=function(){return this._virtualBounds};const c=[];return e&&c.push("nH.aqK"),i&&c.push("biW"),n&&c.push("aKk"),console.log(`🧭 Using combined region: ${c.join(" + ")}`),d}}},{id:"header",name:"Header",description:"Search, settings, and account",selector:'[role="banner"]',icon:"🔍",priority:5},{id:"right-panel",name:"Right Panel",description:"Calendar, Keep, Tasks, Contacts",selector:'[role="complementary"][aria-label*="Side panel"], [role="complementary"]',icon:"📅",priority:7}];function ie(){const t=[];for(const n of ne){let e=null;if(n.customExtractor?e=n.customExtractor():e=document.querySelector(n.selector),e&&ae(e,n.id)){const i=re(e);t.push({id:n.id,name:n.name,description:n.description,icon:n.icon,element:e,priority:n.priority,interactiveCount:i,bounds:e.getBoundingClientRect()})}}return t.sort((n,e)=>n.priority-e.priority),t.find(n=>n.id==="top-navigation")||(t.push({id:"top-navigation",name:"Top Navigation",description:"Toolbar and search refinement",icon:"🧭",element:document.querySelector('[role="main"]')||document.body,priority:3,interactiveCount:0,bounds:(document.querySelector('[role="main"]')||document.body).getBoundingClientRect()}),t.sort((n,e)=>n.priority-e.priority),console.log("🧭 top-navigation: aeH missing, added placeholder for extractor")),console.log(`🗺️ Found ${t.length} regions:`,t.map(n=>`${n.icon} ${n.name} (${n.interactiveCount})`)),t}function ae(t,o){if(t.dataset&&t.dataset.combinedRegion==="true")return console.log("🧭 Virtual combined region - skipping visibility check"),!0;const n=t.getBoundingClientRect(),e=window.getComputedStyle(t),i={hasSize:n.width>0&&n.height>0,width:n.width,height:n.height,display:e.display,visibility:e.visibility,opacity:e.opacity,displayOk:e.display!=="none",visibilityOk:e.visibility!=="hidden",opacityOk:e.opacity!=="0"};return t.querySelector&&t.querySelector("h2.a3E")&&console.log("🔍 Compose window visibility check:",i),!i.hasSize||!i.displayOk||!i.opacityOk?!1:o==="compose-window"?(console.log("✅ Compose window is visible (special handling)"),!0):i.visibilityOk}function re(t){const n=t.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[role="link"],[role="menuitem"],[role="tab"],[onclick]');let e=0;for(const i of n)se(i)&&e++;return e}function se(t){const o=t.getBoundingClientRect();if(o.width===0||o.height===0)return!1;const n=window.getComputedStyle(t);return n.display!=="none"&&n.visibility!=="hidden"&&parseFloat(n.opacity)>0}function ce(t,o){if(!t||!t.element)return[];const n=o(t);return console.log(`🎯 Found ${n.length} candidates in "${t.name}" region`),n}function le(t,o){if(X(),t.length===0)return null;const n=document.createElement("div");return n.id="tabtabgo-region-overlay",n.style.cssText=`
        position: fixed;top: 0;left: 0;width: 100%;height: 100%;z-index: 999998;pointer-events: none;
    `,t.forEach((e,i)=>{const a=i===o,r=e.bounds,m=document.createElement("div");m.className="region-highlight",m.style.cssText=`
            position: absolute;left: ${r.left}px;top: ${r.top}px;width: ${r.width}px;height: ${r.height}px;
            border: ${a?"4px":"2px"} solid ${a?"#10b981":"transparent"};
            background: ${a?"rgba(16, 185, 129, 0.1)":"rgba(147, 197, 253, 0.0)"};
            border-radius: 8px;pointer-events: none;transition: all 0.2s ease;
            box-shadow: ${a?"0 0 20px rgba(16, 185, 129, 0.4)":"0 0 10px rgba(147, 197, 253, 0.2)"};
        `,n.appendChild(m)}),document.body.appendChild(n),n}function X(){const t=document.getElementById("tabtabgo-region-overlay");t&&t.remove()}function de(t,o,n,e){if(J(),t.length===0)return null;const i=document.createElement("div");i.id="tabtabgo-region-popup",i.style.cssText=`
        position: fixed;left: ${n}px;top: ${e}px;background: white;border: 2px solid #10b981;
        border-radius: 12px;padding: 12px;box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;min-width: 280px;max-width: 400px;
    `;const a=document.createElement("div");a.style.cssText="font-size: 13px;font-weight: 600;color: #10b981;margin-bottom: 8px;padding-bottom: 8px;border-bottom: 1px solid #e5e7eb;",a.textContent="🔎 Select Region",i.appendChild(a);const r=document.createElement("div");r.style.cssText="display: flex;flex-direction: column;gap: 4px;",t.forEach((u,l)=>{const d=l===o,c=document.createElement("div");c.style.cssText=`
            padding: 10px 12px;background: ${d?"#10b981":"#f9fafb"};color: ${d?"white":"#374151"};
            border-radius: 8px;cursor: pointer;transition: all 0.2s ease;border: 2px solid ${d?"#10b981":"transparent"};
        `,c.innerHTML=`
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 18px;">${u.icon}</span>
                    <div>
                        <div style="font-weight: 600; font-size: 14px; margin-bottom: 2px;">${u.name}</div>
                        <div style="font-size: 11px; opacity: 0.8;">${u.description}</div>
                    </div>
                </div>
                <div style="font-size: 12px; font-weight: 600; opacity: 0.8;">${u.interactiveCount}</div>
            </div>
        `,d||(c.addEventListener("mouseenter",()=>{c.style.background="#e5e7eb"}),c.addEventListener("mouseleave",()=>{c.style.background="#f9fafb"})),r.appendChild(c)}),i.appendChild(r);const m=document.createElement("div");m.style.cssText="margin-top: 12px;padding-top: 12px;border-top: 1px solid #e5e7eb;font-size: 11px;color: #6b7280;line-height: 1.5;",m.innerHTML=`
        <div style="margin-bottom: 4px;"><kbd style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-family: monospace;">Tab</kbd> or <kbd style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-family: monospace;">D</kbd> Next region</div>
        <div style="margin-bottom: 4px;"><kbd style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-family: monospace;">Shift+Tab</kbd> or <kbd style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-family: monospace;">S</kbd> Previous region</div>
        <div><kbd style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-family: monospace;">Enter</kbd> or <kbd style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-family: monospace;">W</kbd> Select region</div>
    `,i.appendChild(m),document.body.appendChild(i);const w=i.getBoundingClientRect();return w.right>window.innerWidth&&(i.style.left=`${window.innerWidth-w.width-20}px`),w.bottom>window.innerHeight&&(i.style.top=`${window.innerHeight-w.height-20}px`),i}function J(){const t=document.getElementById("tabtabgo-region-popup");t&&t.remove()}function ue(t){if(!t)return console.warn("❌ Cannot click null element"),!1;let o=t;const n=t.tagName?t.tagName.toLowerCase():"";if(n==="svg"||n==="path"){let l=t.parentElement,d=5;for(;l&&d>0;){const c=l.tagName?l.tagName.toLowerCase():"";if(l.getAttribute("role")==="button"||c==="button"||c==="a"||l.hasAttribute("jsaction")||l.onclick){o=l,console.log("📍 Found clickable parent:",{tag:c,role:l.getAttribute("role"),ariaLabel:l.getAttribute("aria-label")});break}l=l.parentElement,d--}}console.log("🖱️ Smart clicking:",{tag:o.tagName,class:(o.className||"").toString().substring(0,80),text:(o.textContent||"").trim().substring(0,50),ariaLabel:o.getAttribute("aria-label"),role:o.getAttribute("role")});const e=(o.className||"").toString(),i=e.includes("J-Ke")||e.includes("n4")||o.closest(".n6")||o.closest(".J-Ke"),a=o.closest('[role="banner"]')!==null||o.closest(".gb_")!==null,r=e.includes("T-I")||o.closest(".T-I")!==null||e.includes("z0")||o.closest(".z0")!==null||e.includes("wG")||o.closest(".wG")!==null||e.includes("J-Z-I")||o.closest(".J-Z-I")!==null||o.closest(".AD")!==null,m=e.includes("HW")&&e.includes("H0")&&e.includes("H2")||o.closest(".Im")!==null,w=o.closest(".aKk")!==null||o.closest('[role="tab"]')!==null,u=o.closest('[role="complementary"]')!==null;console.log("🎯 Element type:",{isGmailUI:i,isHeader:a,isComposeNav:r,isTopNavFilter:m,isCategoryTab:w,isRightPanel:u});try{return i||a?(console.log("📌 Using simple click (Gmail UI / header element)"),o.focus(),o.click(),console.log("✅ Simple click completed"),!0):m?(console.log("📌 Using robust click (top navigation filter)"),_(o)):w?(console.log("📌 Using robust click (category tab)"),_(o)):u?(console.log("📌 Using robust click (right panel)"),_(o)):r?(console.log("📌 Using robust click (compose/navigation element)"),_(o)):(console.log("📌 Using simple click (default)"),o.focus(),o.click(),console.log("✅ Simple click completed"),!0)}catch(l){console.error("❌ Smart click failed, trying fallback:",l);try{return i||a?(console.log("🔄 Fallback: trying robust click"),_(o)):(console.log("🔄 Fallback: trying simple click"),o.click(),!0)}catch(d){return console.error("❌ Fallback also failed:",d),!1}}}function _(t){const o=t.getBoundingClientRect(),n=o.left+o.width/2,e=o.top+o.height/2;(t.tabIndex>=0||t.getAttribute("tabindex"))&&t.focus();const i={view:window,bubbles:!0,cancelable:!0,composed:!0,clientX:n,clientY:e,screenX:n+window.screenX,screenY:e+window.screenY,button:0,buttons:1},a=new MouseEvent("mousedown",i);return t.dispatchEvent(a),setTimeout(()=>{const r=new MouseEvent("mouseup",i);t.dispatchEvent(r);const m=new MouseEvent("click",i);t.dispatchEvent(m),console.log("✅ Robust click completed")},10),!0}function ge(t){return ue(t)}class me{constructor(){this.overlay=null,this.clickCount=0,this.clickTimestamps=[],this.onComplete=null}show(o){this.onComplete=o,this.clickCount=0,this.clickTimestamps=[],this.overlay=document.createElement("div"),this.overlay.id="tabtabgo-sync-overlay",this.overlay.innerHTML=`
            <div class="sync-container">
                <div class="sync-header">
                    <h1>📊 EMG SYNC</h1>
                    <p class="sync-instruction">Click the big button below <strong>3 times quickly</strong></p>
                </div>
                
                <button class="sync-button" id="sync-click-btn">
                    <div class="sync-button-content">
                        <div class="click-counter">${this.clickCount}/3</div>
                        <div class="sync-button-text">CLICK HERE</div>
                    </div>
                </button>
                
                <div class="sync-footer">
                    <p>This helps synchronize interaction logs with EMG sensors</p>
                </div>
            </div>
        `,this.addStyles(),document.body.appendChild(this.overlay);const n=document.getElementById("sync-click-btn");n.addEventListener("click",()=>this.handleClick()),setTimeout(()=>n.focus(),100)}handleClick(){const o=Date.now();this.clickTimestamps.push(o),this.clickCount++,console.log(`🎯 Sync click ${this.clickCount}/3 at ${o}`);const n=this.overlay.querySelector(".click-counter");n.textContent=`${this.clickCount}/3`;const e=document.getElementById("sync-click-btn");if(e.classList.add("clicked"),setTimeout(()=>e.classList.remove("clicked"),200),this.clickCount>=3){const i=[this.clickTimestamps[1]-this.clickTimestamps[0],this.clickTimestamps[2]-this.clickTimestamps[1]];console.log("✅ Sync complete!",{timestamps:this.clickTimestamps,intervals:i,totalDuration:this.clickTimestamps[2]-this.clickTimestamps[0]}),this.showCompletion()}}showCompletion(){const o=this.overlay.querySelector(".sync-container");o.innerHTML=`
            <div class="sync-header">
                <h1 style="color: #10b981;">✅ SYNC COMPLETE</h1>
                <p class="sync-instruction">EMG synchronization successful</p>
            </div>
            <div class="sync-stats">
                <div class="sync-stat">
                    <div class="stat-label">Click 1</div>
                    <div class="stat-value">${new Date(this.clickTimestamps[0]).toLocaleTimeString()}.${this.clickTimestamps[0]%1e3}</div>
                </div>
                <div class="sync-stat">
                    <div class="stat-label">Click 2</div>
                    <div class="stat-value">${new Date(this.clickTimestamps[1]).toLocaleTimeString()}.${this.clickTimestamps[1]%1e3}</div>
                </div>
                <div class="sync-stat">
                    <div class="stat-label">Click 3</div>
                    <div class="stat-value">${new Date(this.clickTimestamps[2]).toLocaleTimeString()}.${this.clickTimestamps[2]%1e3}</div>
                </div>
            </div>
            <div class="sync-footer">
                <p>Starting first task...</p>
            </div>
        `,setTimeout(()=>{this.remove(),this.onComplete&&this.onComplete({timestamps:this.clickTimestamps,intervals:[this.clickTimestamps[1]-this.clickTimestamps[0],this.clickTimestamps[2]-this.clickTimestamps[1]],totalDuration:this.clickTimestamps[2]-this.clickTimestamps[0]})},2e3)}remove(){this.overlay&&this.overlay.parentNode&&(this.overlay.parentNode.removeChild(this.overlay),this.overlay=null)}addStyles(){if(document.getElementById("tabtabgo-sync-styles"))return;const o=document.createElement("style");o.id="tabtabgo-sync-styles",o.textContent=`
            #tabtabgo-sync-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                z-index: 2147483647;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }

            .sync-container {
                text-align: center;
                color: white;
                max-width: 600px;
                padding: 40px;
            }

            .sync-header h1 {
                font-size: 48px;
                margin: 0 0 20px 0;
                font-weight: 700;
                text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
            }

            .sync-instruction {
                font-size: 24px;
                margin: 0 0 40px 0;
                opacity: 0.95;
            }

            .sync-button {
                width: 300px;
                height: 300px;
                border-radius: 50%;
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                border: 8px solid rgba(255, 255, 255, 0.3);
                cursor: pointer;
                transition: all 0.2s ease;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                margin: 0 auto 40px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .sync-button:hover {
                transform: scale(1.05);
                box-shadow: 0 15px 50px rgba(0, 0, 0, 0.4);
                border-color: rgba(255, 255, 255, 0.5);
            }

            .sync-button:active,
            .sync-button.clicked {
                transform: scale(0.95);
                background: linear-gradient(135deg, #059669 0%, #047857 100%);
            }

            .sync-button-content {
                text-align: center;
            }

            .click-counter {
                font-size: 72px;
                font-weight: 700;
                color: white;
                margin-bottom: 10px;
                text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            }

            .sync-button-text {
                font-size: 24px;
                font-weight: 600;
                color: white;
                text-shadow: 1px 1px 2px rgba(0,0,0,0.3);
            }

            .sync-footer {
                font-size: 16px;
                opacity: 0.8;
            }

            .sync-stats {
                display: flex;
                justify-content: center;
                gap: 30px;
                margin: 40px 0;
            }

            .sync-stat {
                background: rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                padding: 20px;
                min-width: 150px;
            }

            .stat-label {
                font-size: 14px;
                opacity: 0.8;
                margin-bottom: 8px;
            }

            .stat-value {
                font-size: 18px;
                font-weight: 600;
                font-family: monospace;
            }
        `,document.head.appendChild(o)}}const wt=new me;chrome.runtime.onMessage.addListener((t,o,n)=>{if(t.action==="showSync")return console.log("📊 Showing sync screen..."),wt.show(e=>{console.log("✅ Sync data:",e),chrome.runtime.sendMessage({action:"syncComplete",data:e}).then(()=>{n({success:!0})})}),!0;t.action==="hideSync"&&(wt.remove(),n({success:!0}))});class pe{constructor(){this.overlay=null}show(o,n,e="completed",i){this.remove(),this.overlay=document.createElement("div"),this.overlay.id="tabtabgo-task-interstitial";const a=e==="completed"?"✅":"⏭️",r=e==="completed"?"Task Complete":"Task Skipped",m=e==="completed"?"#10b981":"#f59e0b";this.overlay.innerHTML=`
            <div class="interstitial-container">
                <div class="interstitial-icon" style="color: ${m};">${a}</div>
                <div class="interstitial-title">${r}</div>
                <div class="interstitial-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${o/n*100}%;"></div>
                    </div>
                    <div class="progress-text">Task ${o} of ${n}</div>
                </div>
                ${o<n?'<div class="interstitial-next">Next task starting...</div>':'<div class="interstitial-next">Session complete!</div>'}
            </div>
        `,this.addStyles(),document.body.appendChild(this.overlay),setTimeout(()=>{this.remove(),i&&i()},2500)}remove(){this.overlay&&this.overlay.parentNode&&(this.overlay.parentNode.removeChild(this.overlay),this.overlay=null)}addStyles(){if(document.getElementById("tabtabgo-interstitial-styles"))return;const o=document.createElement("style");o.id="tabtabgo-interstitial-styles",o.textContent=`
            #tabtabgo-task-interstitial {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.95);
                z-index: 2147483646;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                animation: interstitialFadeIn 0.3s ease-out;
            }

            @keyframes interstitialFadeIn {
                from {
                    opacity: 0;
                }
                to {
                    opacity: 1;
                }
            }

            .interstitial-container {
                text-align: center;
                color: white;
                max-width: 500px;
                padding: 40px;
            }

            .interstitial-icon {
                font-size: 80px;
                margin-bottom: 20px;
                animation: iconPop 0.5s ease-out;
            }

            @keyframes iconPop {
                0% {
                    transform: scale(0);
                }
                50% {
                    transform: scale(1.2);
                }
                100% {
                    transform: scale(1);
                }
            }

            .interstitial-title {
                font-size: 36px;
                font-weight: 700;
                margin-bottom: 30px;
                opacity: 0;
                animation: titleSlideIn 0.5s ease-out 0.2s forwards;
            }

            @keyframes titleSlideIn {
                from {
                    opacity: 0;
                    transform: translateY(20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            .interstitial-progress {
                margin-bottom: 20px;
                opacity: 0;
                animation: progressFadeIn 0.5s ease-out 0.4s forwards;
            }

            @keyframes progressFadeIn {
                from {
                    opacity: 0;
                }
                to {
                    opacity: 1;
                }
            }

            .progress-bar {
                width: 100%;
                height: 8px;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 4px;
                overflow: hidden;
                margin-bottom: 10px;
            }

            .progress-fill {
                height: 100%;
                background: linear-gradient(90deg, #10b981, #059669);
                transition: width 0.5s ease-out;
                border-radius: 4px;
            }

            .progress-text {
                font-size: 18px;
                color: rgba(255, 255, 255, 0.8);
            }

            .interstitial-next {
                font-size: 16px;
                color: rgba(255, 255, 255, 0.6);
                margin-top: 20px;
                opacity: 0;
                animation: nextFadeIn 0.5s ease-out 0.6s forwards;
            }

            @keyframes nextFadeIn {
                from {
                    opacity: 0;
                }
                to {
                    opacity: 0.6;
                }
            }
        `,document.head.appendChild(o)}}const vt=new pe;(function(){let t="none",o=[],n=-1,e=[],i=-1,a=null,r=null,m=null,w=!1,u=!1,l="#10b981",d=null,c=null,f=null,A={x:0,y:0},E=0,S=0,H=0,V=0,Z=0,Q=0,tt=0;const kt=500,Ct=4,St=6,rt=1500;let U={timestamp:0,candidates:[]};async function Y(){return console.log("🗺️ Starting region navigation..."),o=ie(),o.length===0?(console.warn("⚠️ No regions found on page"),!1):(t="region",n=0,j(),!0)}function j(){X(),le(o,n),J(),de(o,n,S||window.innerWidth/2,H||100)}function Et(){o.length!==0&&(n=(n+1)%o.length,j(),console.log(`➡️ Region: ${o[n].name}`))}function Tt(){o.length!==0&&(n=n-1,n<0&&(n=o.length-1),j(),console.log(`⬅️ Region: ${o[n].name}`))}async function At(){if(n<0||n>=o.length)return;const s=o[n];console.log(`✅ Selected region: ${s.name}`),X(),J(),await Nt(s)}async function Nt(s){if(console.log(`🎯 Starting element navigation in: ${s.name}`),t="element",e=await $t(s),e.length===0){console.warn(`⚠️ No interactive elements found in ${s.name}`),t="region",j();return}i=-1,await it()}async function $t(s){if(w)return[];w=!0;try{const b=ce(s,bt);return console.log(`🎯 Found ${b.length} candidates in ${s.name}`),U={timestamp:Date.now(),candidates:b.map(p=>({element:p.element,candidate:p}))},b.map(p=>({element:p.element,highlightElement:p.highlightElement||null,text:p.features.text,selector:p.features.id||p.features.className,features:p.features}))}finally{w=!1}}async function et(){if(w)return e;w=!0;try{const s=bt();console.log("🎯 Raw candidates found:",s.length),U={timestamp:Date.now(),candidates:s.map(g=>({element:g.element,candidate:g}))};const b=s.map(g=>({element:g.element,text:g.features.text,selector:g.features.id||g.features.className,features:g.features})),p=[{element:null,text:"other",selector:"fake-other",isFake:!0,fakeAction:"other"}];return[...b,...p]}finally{w=!1}}function st(s){const b=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(s);return b?{r:parseInt(b[1],16),g:parseInt(b[2],16),b:parseInt(b[3],16)}:{r:16,g:185,b:129}}function It(s,b){const p=st(s);return`rgba(${p.r}, ${p.g}, ${p.b}, ${b})`}let F=null;function Lt(){if(!c||!a)return;const s=a.getBoundingClientRect(),b=4,p=s.left-b,g=s.top-b,h=s.width+b*2,C=s.height+b*2,k=c.querySelector("rect:not([filter])"),v=c.querySelector('rect[filter="url(#blur-filter)"]');k&&(k.setAttribute("x",p),k.setAttribute("y",g),k.setAttribute("width",h),k.setAttribute("height",C)),v&&(v.setAttribute("x",p),v.setAttribute("y",g),v.setAttribute("width",h),v.setAttribute("height",C))}function Rt(s,b=l){ot(),a=s;const p=s.getBoundingClientRect(),g=4,h=p.left-g,C=p.top-g,k=p.width+g*2,v=p.height+g*2,T=st(b),R=`rgb(${Math.min(255,T.r+50)}, ${Math.min(255,T.g+50)}, ${Math.min(255,T.b+50)})`,x=document.createElementNS("http://www.w3.org/2000/svg","svg");x.id="smarttab-lasso",x.style.position="fixed",x.style.top="0",x.style.left="0",x.style.width="100%",x.style.height="100%",x.style.pointerEvents="none",x.style.zIndex="999998";const M=document.createElementNS("http://www.w3.org/2000/svg","defs"),L=document.createElementNS("http://www.w3.org/2000/svg","filter");L.setAttribute("id","blur-filter");const I=document.createElementNS("http://www.w3.org/2000/svg","feGaussianBlur");I.setAttribute("stdDeviation","4"),L.appendChild(I),M.appendChild(L),x.appendChild(M);const N=document.createElementNS("http://www.w3.org/2000/svg","rect");N.setAttribute("x",h),N.setAttribute("y",C),N.setAttribute("width",k),N.setAttribute("height",v),N.setAttribute("rx","6"),N.setAttribute("ry","6"),N.setAttribute("stroke",R),N.setAttribute("stroke-width",St),N.setAttribute("fill","none"),N.setAttribute("opacity","0.6"),N.setAttribute("filter","url(#blur-filter)");const $=document.createElementNS("http://www.w3.org/2000/svg","rect");return $.setAttribute("x",h),$.setAttribute("y",C),$.setAttribute("width",k),$.setAttribute("height",v),$.setAttribute("rx","6"),$.setAttribute("ry","6"),$.setAttribute("stroke",b),$.setAttribute("stroke-width",Ct),$.setAttribute("fill","none"),$.style.opacity="1",$.style.transition="opacity 0.2s",x.appendChild(N),x.appendChild($),document.body.appendChild(x),c=x,F=()=>Lt(),window.addEventListener("scroll",F,!0),window.addEventListener("resize",F),x}function ot(){F&&(window.removeEventListener("scroll",F,!0),window.removeEventListener("resize",F),F=null),c&&(c.remove(),c=null),a=null}let P=null,K=null;function Mt(s,b,p){nt(),r=s;const g=s.getBoundingClientRect(),h=g.left+g.width/2,C=g.top+g.height/2,k=It(l,.8),v=document.createElementNS("http://www.w3.org/2000/svg","svg");v.id="smarttab-chord",v.style.position="fixed",v.style.top="0",v.style.left="0",v.style.width="100%",v.style.height="100%",v.style.pointerEvents="none",v.style.zIndex="999998";const T=document.createElementNS("http://www.w3.org/2000/svg","defs"),R=document.createElementNS("http://www.w3.org/2000/svg","filter");R.setAttribute("id","chord-blur-filter");const x=document.createElementNS("http://www.w3.org/2000/svg","feGaussianBlur");x.setAttribute("stdDeviation","3"),R.appendChild(x),T.appendChild(R),v.appendChild(T);const M=h-b,L=C-p,I=Math.sqrt(M*M+L*L);let N;if(I<5)N=`M ${b} ${p} L ${h} ${C}`;else{const mt=Math.min(I*.3,100),pt=-L/I*mt*.6,ft=M/I*mt*.6,Pt=b+(h-b)*.35+pt,Gt=p+(C-p)*.35+ft,Ot=b+(h-b)*.65+pt,Ut=p+(C-p)*.65+ft;N=`M ${b} ${p} C ${Pt} ${Gt}, ${Ot} ${Ut}, ${h} ${C}`}const $=document.createElementNS("http://www.w3.org/2000/svg","path");$.setAttribute("d",N),$.setAttribute("stroke",l),$.setAttribute("stroke-width","8"),$.setAttribute("fill","none"),$.setAttribute("opacity","0.5"),$.setAttribute("filter","url(#chord-blur-filter)");const q=document.createElementNS("http://www.w3.org/2000/svg","path");q.setAttribute("d",N),q.setAttribute("stroke",k),q.setAttribute("stroke-width","3"),q.setAttribute("fill","none"),q.setAttribute("stroke-linecap","round"),q.style.opacity="1",q.style.transition="opacity 0.2s",v.appendChild($),v.appendChild(q),document.body.appendChild(v),d=v,P=()=>ct(),window.addEventListener("scroll",P,!0),window.addEventListener("resize",P),K=at=>{S=at.clientX,H=at.clientY,d&&r&&ct()},O.mouse.x=S,O.mouse.y=H,document.addEventListener("mousemove",K)}function ct(){if(!d||!r)return;const s=r.getBoundingClientRect(),b=s.left+s.width/2,p=s.top+s.height/2,g=b-S,h=p-H,C=Math.sqrt(g*g+h*h);let k;if(C<5)k=`M ${S} ${H} L ${b} ${p}`;else{const x=Math.min(C*.3,100),M=-h/C*x*.6,L=g/C*x*.6,I=S+(b-S)*.35+M,N=H+(p-H)*.35+L,$=S+(b-S)*.65+M,q=H+(p-H)*.65+L;k=`M ${S} ${H} C ${I} ${N}, ${$} ${q}, ${b} ${p}`}const v=d.querySelector("path[filter]"),T=d.querySelector("path:not([filter])");v&&v.setAttribute("d",k),T&&T.setAttribute("d",k)}function nt(){P&&(window.removeEventListener("scroll",P,!0),window.removeEventListener("resize",P),P=null),K&&(document.removeEventListener("mousemove",K),K=null),d&&(d.remove(),d=null),r=null}async function it(){if(e.length===0)return;i=(i+1)%e.length;const s=e[i];if(ot(),nt(),s.isFake)W();else if(s.element){const b=s.highlightElement||s.element;Rt(b,l),Mt(b,S,H),s.element.scrollIntoView({behavior:"smooth",block:"center",inline:"center"})}}async function Ht(){e.length!==0&&(i=i-1,i<0&&(i=e.length-1),await it())}function W(){t="none",n=-1,i=-1,ot(),nt(),X(),J()}async function qt(){if(t==="region"){await At();return}if(t!=="element"||i<0||i>=e.length)return;const s=e[i];if(s.isFake&&s.fakeAction==="other"){W(),await Y();return}s.element&&(u=!0,ht(s.element),await yt(s,e,!0,i,0,V,Z,Q,tt),Q=0,tt=0,G(),console.log("🎯 Activating element with robust click..."),ge(s.element),setTimeout(()=>{u=!1},100),W())}async function lt(s){const b=s.key==="Tab",p=s.key==="d"||s.key==="D"||s.key==="в"||s.key==="В",g=s.key==="s"||s.key==="S"||s.key==="ы"||s.key==="Ы";if(f==="trackpad")return!0;if((b||p||g)&&!s.ctrlKey&&!s.altKey&&!s.metaKey){const h=document.activeElement;let C=!1;if(h){const k=h.tagName,v=h.type?h.type.toLowerCase():"";k==="TEXTAREA"?C=!0:k==="INPUT"?(["text","email","password","search","tel","url","number","date","datetime-local","month","time","week"].includes(v)||!v||v==="")&&(C=!0):h.isContentEditable&&(C=!0)}if(C)return!0;if(s.preventDefault(),V++,Q++,s.stopPropagation(),s.stopImmediatePropagation(),t==="none"){await Y();return}t==="region"?s.shiftKey||g?Tt():Et():t==="element"&&(s.shiftKey||g?Ht():it())}}function dt(s){if(t==="none")return;const b=s.key==="Enter",p=s.key===" ",g=s.key==="w"||s.key==="W"||s.key==="ц"||s.key==="Ц";(b||p||g)&&(s.preventDefault(),Z++,tt++,s.stopPropagation(),s.stopImmediatePropagation(),qt())}function ut(s){if(t==="none")return;const b=s.key==="Escape",p=s.key==="a"||s.key==="A"||s.key==="ф"||s.key==="Ф";(b||p)&&(s.preventDefault(),s.stopPropagation(),s.stopImmediatePropagation(),t==="element"?(W(),Y()):W())}function Bt(s){if(f==="trackpad"){const b=s.clientX-A.x,p=s.clientY-A.y,g=Math.sqrt(b*b+p*p);E+=g,A.x=s.clientX,A.y=s.clientY}}function G(){E=0}chrome.runtime.onMessage.addListener(async(s,b,p)=>{if(s.action==="sessionStateChanged")return f=s.sessionActive?s.mode:null,console.log(`🔄 Session mode changed to: ${f||"inactive"}`),e=[],i=-1,f==="trackpad"&&G(),p({success:!0}),!0;if(s.action==="toggleNavigation"){try{if(t!=="none")W(),p({success:!0,navigationActive:!1});else{const h=await Y();p({success:h,navigationActive:h})}}catch(g){console.error("Error toggling navigation:",g),p({success:!1,error:g.message})}return!0}return s.action==="showTaskInterstitial"?(console.log("📋 Showing task interstitial..."),vt.show(s.taskNumber,s.totalTasks,s.status,()=>{console.log("✅ Interstitial complete"),p({success:!0})}),!0):s.action==="resetTabCounters"?(V=0,Z=0,p({success:!0}),!0):(s.action==="hideTaskInterstitial"&&(vt.remove(),p({success:!0})),!1)});function Dt(){m&&clearTimeout(m),m=setTimeout(async()=>{e=await et(),i>=e.length&&(i=-1)},kt)}function zt(s){if(Date.now()-U.timestamp>rt)return null;for(let p=0;p<U.candidates.length;p++){const{element:g}=U.candidates[p];if(g===s||g.contains(s))return{button:e[p],selectedIndex:p}}return null}function Ft(s){return s.className?typeof s.className=="string"?s.className:s.className.toString():""}async function gt(){document.addEventListener("mousemove",g=>{S=g.clientX,H=g.clientY,Bt(g)});try{const g=await chrome.storage.local.get(["sessionActive","currentSession"]);g.sessionActive&&g.currentSession&&(f=g.currentSession.mode,console.log(`📊 Session active in ${f} mode`),f==="trackpad"&&G())}catch(g){console.error("Failed to check session state:",g)}chrome.storage.onChanged.addListener((g,h)=>{h==="local"&&g.currentSession&&(g.currentSession.newValue?(f=g.currentSession.newValue.mode,console.log(`🔄 Session started via storage: ${f} mode`),f==="trackpad"&&G()):(f=null,console.log("🔄 Session ended via storage")))});let s=null,b=!1;document.addEventListener("mousedown",async g=>{if(f!=="trackpad")return;const h=g.target,C=h.id||h.closest("button")?.id;if(C==="skip-task-btn"||C==="next-task-btn"||C==="task-next-btn")return;let k=h;if(!["BUTTON","A","INPUT","SELECT","TEXTAREA","IMG"].includes(h.tagName)){const R=h.closest('button, a, img, [role="button"], [role="link"], [onclick], [tabindex]');R&&(k=R)}const T=k.getAttribute("aria-label")||k.getAttribute("data-tooltip")||k.title||k.textContent?.trim().slice(0,100)||k.alt||k.value||k.tagName.toLowerCase();s={timestamp:Date.now(),element:k,elementText:T},b=!1,console.log("👇 Mousedown:",{tag:k.tagName,text:T.substring(0,30),ariaLabel:k.getAttribute("aria-label")})},!0),document.addEventListener("mouseup",async g=>{if(f==="trackpad"&&s&&!b&&(await new Promise(h=>setTimeout(h,100)),!b)){console.log("⚠️ Click event did not fire - logging from mouseup");const h=s.element,C=s.elementText,k=h.id||h.closest("button")?.id;if(k==="skip-task-btn"||k==="next-task-btn"||k==="task-next-btn"){s=null;return}let v="";if(h.id)v=`#${h.id}`;else if(h.getAttribute("data-tooltip"))v=`[data-tooltip="${h.getAttribute("data-tooltip")}"]`;else if(h.getAttribute("aria-label"))v=`[aria-label="${h.getAttribute("aria-label")}"]`;else if(h.className&&typeof h.className=="string"){const T=h.className.split(" ").filter(R=>R).slice(0,2);v=T.length>0?T.join(" "):h.tagName}else v=h.tagName;console.log("🖱️ Mouseup logged (no click):",{tag:h.tagName,text:C.substring(0,30),distance:E.toFixed(2)});try{const T=await chrome.storage.local.get(["sessionActive","currentSession"]);T.sessionActive&&(await chrome.runtime.sendMessage({action:"logInteraction",data:{timestamp:Date.now(),selectedIndex:-1,manualClick:!0,TabTabGoClick:!1,elementText:C.substring(0,100),elementSelector:v,cursorTraveledDistancePx:E,url:window.location.href,mode:T.currentSession.mode}}),console.log("✅ Interaction logged from mouseup"),b=!0)}catch(T){console.error("Failed to log from mouseup:",T)}G(),s=null}},!0),document.addEventListener("click",async g=>{if(u)return;const h=g.target,C=h.id||h.closest("button")?.id;if(C==="skip-task-btn"||C==="next-task-btn"||C==="task-next-btn")return;if(f==="trackpad"){let x=h,M="";if(s&&Date.now()-s.timestamp<500)x=s.element,M=s.elementText,console.log("✓ Using mousedown data");else{if(!["BUTTON","A","INPUT","SELECT","TEXTAREA","IMG"].includes(h.tagName)){const N=h.closest('button, a, img, [role="button"], [role="link"], [onclick], [tabindex]');N&&(x=N)}M=x.getAttribute("aria-label")||x.getAttribute("data-tooltip")||x.title||x.textContent?.trim().slice(0,100)||x.alt||x.value||x.tagName.toLowerCase()}let L="";if(x.id)L=`#${x.id}`;else if(x.getAttribute("data-tooltip"))L=`[data-tooltip="${x.getAttribute("data-tooltip")}"]`;else if(x.getAttribute("aria-label"))L=`[aria-label="${x.getAttribute("aria-label")}"]`;else if(x.className&&typeof x.className=="string"){const I=x.className.split(" ").filter(N=>N).slice(0,2);L=I.length>0?I.join(" "):x.tagName}else L=x.tagName;console.log("🖱️ Click logged:",{tag:x.tagName,text:M.substring(0,30),distance:E.toFixed(2)});try{const I=await chrome.storage.local.get(["sessionActive","currentSession"]);I.sessionActive&&(await chrome.runtime.sendMessage({action:"logInteraction",data:{timestamp:Date.now(),selectedIndex:-1,manualClick:!0,TabTabGoClick:!1,elementText:M.substring(0,100),elementSelector:L,cursorTraveledDistancePx:E,url:window.location.href,mode:I.currentSession.mode}}),b=!0,s=null)}catch(I){console.error("Failed to log trackpad click:",I)}G();return}Date.now()-U.timestamp>rt&&(e=await et());const v=zt(g.target);if(!v)return;const{button:T,selectedIndex:R}=v;ht(T.element),await yt(T,e,!1,R,E),G()},!0),setTimeout(async()=>{e=await et()},1e3),window.addEventListener("keydown",lt,!0),document.addEventListener("keydown",lt,!0),window.addEventListener("keydown",dt,!0),document.addEventListener("keydown",dt,!0),window.addEventListener("keydown",ut,!0),document.addEventListener("keydown",ut,!0),new MutationObserver(g=>{let h=!1;for(const C of g){if(C.type==="childList"&&C.addedNodes.length>0){for(const k of C.addedNodes)if(k.nodeType===1){const v=k.tagName?.toLowerCase(),T=k.getAttribute?.("role"),R=Ft(k);if(v==="button"||T==="button"||R.includes("button")){h=!0;break}}}if(h)break}h&&Dt()}).observe(document.body,{childList:!0,subtree:!0,attributes:!0,attributeFilter:["class","style","role"]})}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",gt):gt()})();
